import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ServerMetric } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DoClient, DoDroplet, DoSeries } from './do.client';
import {
    CpuTimes,
    cpuPercent,
    parseDockerSize,
    readCpuTimes,
    readDisk,
    readHostJson,
    readLoad,
    readMemory,
    readUptimeSec,
    sampleCpu,
} from './host.reader';
import { RequestStatsService } from './request-stats.service';

const HOUR = 3_600_000;
const KEEP_DAYS = 30;
/** postgres: -c max_connections=40 (deploy/docker-compose.yml) */
const DB_MAX_CONNS = 40;

export type Level = 'ok' | 'info' | 'warn' | 'critical';
export interface Advice {
    level: Level;
    title: string;
    detail: string;
    action?: string;
}

const RANGES = { '24h': { hours: 24, bucketMin: 5 }, '7d': { hours: 24 * 7, bucketMin: 60 }, '30d': { hours: 24 * 30, bucketMin: 360 } } as const;
export type Range = keyof typeof RANGES;

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * Server yuklamasi: host (CPU, RAM, swap, disk, load), konteynerlar, API so'rovlari, baza, zaxira nusxalar,
 * DigitalOcean tarifi/trafigi va shularga qarab "keyingi qadam" tavsiyalari.
 */
@Injectable()
export class ServerStatsService implements OnModuleInit {
    private readonly logger = new Logger(ServerStatsService.name);
    private lastCpu: CpuTimes | null = null;
    private doCache = new Map<string, { at: number; data: unknown }>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly requests: RequestStatsService,
        private readonly config: ConfigService,
    ) { }

    async onModuleInit() {
        this.lastCpu = await readCpuTimes();
    }

    // ---------- Snapshot (har 5 daqiqada) ----------

    @Cron('*/5 * * * *')
    async snapshot() {
        try {
            const cpuNow = await readCpuTimes();
            const cpu = cpuPercent(this.lastCpu, cpuNow);
            this.lastCpu = cpuNow;
            const [mem, load, disk, db, host] = await Promise.all([readMemory(), readLoad(), readDisk(), this.dbStats(), readHostJson()]);
            const req = this.requests.drain();
            await this.prisma.serverMetric.create({
                data: {
                    cpu: round(cpu),
                    memUsedMb: round(mem.usedMb),
                    memTotalMb: round(mem.totalMb),
                    swapUsedMb: round(mem.swapUsedMb),
                    load1: load.load1,
                    diskUsedGb: round(disk.usedGb, 2),
                    diskTotalGb: round(disk.totalGb, 2),
                    requests: req.requests,
                    errors5xx: req.errors5xx,
                    avgMs: req.avgMs,
                    p95Ms: req.p95Ms,
                    dbSizeMb: db.sizeMb,
                    dbConns: db.conns,
                    backendRssMb: round(process.memoryUsage().rss / 1024 / 1024),
                    containers: host?.containers.map((c) => ({
                        service: c.service ?? c.name,
                        memMb: round(parseDockerSize(c.mem?.split('/')[0])),
                        memLimitMb: c.memLimit ? round(c.memLimit / 1024 / 1024) : null,
                        cpu: c.cpu ?? 0,
                    })),
                },
            });
            await this.prisma.serverMetric.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 24 * HOUR) } } });
        } catch (e) {
            this.logger.warn(`Server snapshot: ${(e as Error).message}`);
        }
    }

    private async dbStats() {
        try {
            const [size] = await this.prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
            const [conns] = await this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database()`;
            return { sizeMb: round(Number(size.size) / 1024 / 1024), conns: Number(conns.n) };
        } catch {
            return { sizeMb: 0, conns: 0 };
        }
    }

    private async dbTables() {
        try {
            const rows = await this.prisma.$queryRaw<{ name: string; bytes: bigint; rows: bigint }[]>`
                SELECT relname AS name, pg_total_relation_size(relid) AS bytes, n_live_tup AS rows
                FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 6`;
            return rows.map((r) => ({ name: r.name, sizeMb: round(Number(r.bytes) / 1024 / 1024, 2), rows: Number(r.rows) }));
        } catch {
            return [];
        }
    }

    // ---------- DigitalOcean ----------

    private doClient(dropletId?: string): DoClient | null {
        const token = this.config.get<string>('DO_API_TOKEN');
        const id = this.config.get<string>('DO_DROPLET_ID') || dropletId;
        return token && id ? new DoClient(token, id) : null;
    }

    private async cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
        const hit = this.doCache.get(key);
        if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
        const data = await fn();
        this.doCache.set(key, { at: Date.now(), data });
        return data;
    }

    private async doInfo(range: Range, dropletId?: string) {
        const client = this.doClient(dropletId);
        if (!client) return { enabled: false as const };
        try {
            const [droplet, series] = await Promise.all([
                this.cached<DoDroplet>('droplet', HOUR, () => client.droplet()),
                this.cached<DoSeries>(`series-${range}`, 10 * 60_000, () => client.series(RANGES[range].hours)),
            ]);
            return { enabled: true as const, droplet, series };
        } catch (e) {
            return { enabled: true as const, error: (e as Error).message };
        }
    }

    // ---------- Hisobot ----------

    async summary(range: Range = '24h') {
        const { hours, bucketMin } = RANGES[range];
        const [cpu, mem, load, disk, uptime, db, tables, host, rows, lastHour, week] = await Promise.all([
            sampleCpu(),
            readMemory(),
            readLoad(),
            readDisk(),
            readUptimeSec(),
            this.dbStats(),
            this.dbTables(),
            readHostJson(),
            this.prisma.serverMetric.findMany({ where: { createdAt: { gte: new Date(Date.now() - hours * HOUR) } }, orderBy: { createdAt: 'asc' } }),
            this.prisma.serverMetric.findMany({ where: { createdAt: { gte: new Date(Date.now() - HOUR) } } }),
            this.prisma.serverMetric.findMany({
                where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * HOUR) } },
                select: { createdAt: true, diskUsedGb: true },
                orderBy: { createdAt: 'asc' },
            }),
        ]);
        const cpus = host?.cpus ?? 1;
        const doInfo = await this.doInfo(range, host?.dropletId);

        const containers = (host?.containers ?? []).map((c) => {
            const memMb = parseDockerSize(c.mem?.split('/')[0]);
            const memLimitMb = c.memLimit ? c.memLimit / 1024 / 1024 : null;
            return {
                service: c.service ?? c.name,
                status: c.status,
                health: c.health,
                restarts: c.restarts,
                oomKilled: c.oomKilled,
                startedAt: c.startedAt,
                cpu: c.cpu ?? 0,
                memMb: round(memMb),
                memLimitMb: memLimitMb ? round(memLimitMb) : null,
            };
        });

        const backups = host?.backups ?? [];
        const lastBackup = backups[backups.length - 1];
        const hourReq = lastHour.reduce((n, r) => n + r.requests, 0);
        const hourErr = lastHour.reduce((n, r) => n + r.errors5xx, 0);
        const app = {
            requestsLastHour: hourReq,
            requests24h: rows.filter((r) => r.createdAt.getTime() > Date.now() - 24 * HOUR).reduce((n, r) => n + r.requests, 0),
            rpm: round(hourReq / 60, 1),
            avgMs: Math.round(avg(lastHour.filter((r) => r.requests).map((r) => r.avgMs))),
            p95Ms: Math.round(avg(lastHour.filter((r) => r.requests).map((r) => r.p95Ms))),
            errors5xxLastHour: hourErr,
            slowRoutes: this.requests.lastRoutes.filter((r) => r.route !== 'boshqa').slice(0, 8),
            backendRssMb: round(process.memoryUsage().rss / 1024 / 1024),
        };

        const now = {
            cpu: round(cpu),
            cpus,
            load1: load.load1,
            load5: load.load5,
            load15: load.load15,
            memUsedMb: round(mem.usedMb),
            memTotalMb: round(mem.totalMb),
            swapUsedMb: round(mem.swapUsedMb),
            swapTotalMb: round(mem.swapTotalMb),
            diskUsedGb: round(disk.usedGb, 2),
            diskTotalGb: round(disk.totalGb, 2),
            uptimeSec: Math.round(uptime),
        };

        return {
            range,
            collectingSince: (await this.prisma.serverMetric.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }))?.createdAt ?? null,
            now,
            app,
            db: { ...db, maxConns: DB_MAX_CONNS, tables },
            containers,
            hostUpdatedAt: host ? new Date(host.at * 1000).toISOString() : null,
            storage: {
                uploadsMb: round((host?.uploadsBytes ?? 0) / 1024 / 1024),
                backups: {
                    count: backups.length,
                    totalMb: round(backups.reduce((n, b) => n + b.size, 0) / 1024 / 1024, 2),
                    last: lastBackup ? { name: lastBackup.name, at: new Date(lastBackup.mtime * 1000).toISOString(), sizeKb: Math.round(lastBackup.size / 1024) } : null,
                },
            },
            series: bucketize(rows, bucketMin),
            do: doInfo,
            advice: advise({ now, app, lastHour, week, db, containers, host, lastBackup, doInfo }),
        };
    }
}

function bucketize(rows: ServerMetric[], bucketMin: number) {
    const size = bucketMin * 60_000;
    const buckets = new Map<number, ServerMetric[]>();
    for (const r of rows) {
        const k = Math.floor(r.createdAt.getTime() / size) * size;
        buckets.set(k, [...(buckets.get(k) ?? []), r]);
    }
    return [...buckets.entries()].map(([t, rs]) => ({
        t: new Date(t).toISOString(),
        cpu: round(avg(rs.map((r) => r.cpu))),
        memPct: round(avg(rs.map((r) => (r.memTotalMb ? (r.memUsedMb / r.memTotalMb) * 100 : 0)))),
        swapMb: round(avg(rs.map((r) => r.swapUsedMb))),
        load1: round(avg(rs.map((r) => r.load1)), 2),
        diskPct: round(avg(rs.map((r) => (r.diskTotalGb ? (r.diskUsedGb / r.diskTotalGb) * 100 : 0)))),
        // daqiqasiga so'rov
        rpm: round(rs.reduce((n, r) => n + r.requests, 0) / (rs.length * 5), 1),
        p95Ms: Math.round(Math.max(...rs.map((r) => r.p95Ms))),
        errors: rs.reduce((n, r) => n + r.errors5xx, 0),
    }));
}

interface AdviseInput {
    now: { cpu: number; cpus: number; load5: number; memUsedMb: number; memTotalMb: number; swapUsedMb: number; swapTotalMb: number; diskUsedGb: number; diskTotalGb: number };
    app: { requestsLastHour: number; p95Ms: number; errors5xxLastHour: number };
    lastHour: ServerMetric[];
    week: { createdAt: Date; diskUsedGb: number }[];
    db: { conns: number };
    containers: { service: string; restarts: number; oomKilled: boolean; memMb: number; memLimitMb: number | null; status: string }[];
    host: unknown;
    lastBackup?: { mtime: number };
    doInfo: { enabled: boolean; droplet?: DoDroplet };
}

/** Raqamlarga qarab: hammasi yaxshimi, nimaga e'tibor berish va keyingi qadam */
function advise(i: AdviseInput): Advice[] {
    const out: Advice[] = [];
    const memPct = i.now.memTotalMb ? (i.now.memUsedMb / i.now.memTotalMb) * 100 : 0;
    const memHour = i.lastHour.length ? avg(i.lastHour.map((r) => (r.memUsedMb / r.memTotalMb) * 100)) : memPct;
    const cpuHour = i.lastHour.length ? avg(i.lastHour.map((r) => r.cpu)) : i.now.cpu;
    const swapPct = i.now.swapTotalMb ? (i.now.swapUsedMb / i.now.swapTotalMb) * 100 : 0;
    const diskPct = i.now.diskTotalGb ? (i.now.diskUsedGb / i.now.diskTotalGb) * 100 : 0;
    const upgrade = 'DigitalOcean → Droplet → Resize: 2 GB RAM tarifiga o\'tish (disk o\'zgarmaydi, ~1 daqiqa to\'xtaydi).';

    // RAM
    if (memHour > 90 || swapPct > 50)
        out.push({ level: 'critical', title: 'Operativ xotira (RAM) yetmayapti', detail: `Oxirgi soatda o'rtacha ${round(memHour)}% band, swap ${Math.round(i.now.swapUsedMb)} MB. Sayt sekinlashadi, konteynerlar o'chib qolishi mumkin.`, action: upgrade });
    else if (memHour > 80 || swapPct > 25)
        out.push({ level: 'warn', title: 'RAM chegaraga yaqinlashyapti', detail: `Oxirgi soatda o'rtacha ${round(memHour)}% band, swap ${Math.round(i.now.swapUsedMb)} MB.`, action: `Holat bir necha kun shunday tursa — ${upgrade}` });

    // CPU va load
    const loadPerCpu = i.now.load5 / Math.max(1, i.now.cpus);
    if (cpuHour > 85 || loadPerCpu > 2)
        out.push({ level: 'critical', title: 'Protsessor (CPU) to\'lib qolgan', detail: `Oxirgi soatda CPU o'rtacha ${round(cpuHour)}%, yuklama (load) ${i.now.load5} (${i.now.cpus} yadro).`, action: 'DigitalOcean → Resize: 2 vCPU tarifga o\'tish. Avval quyidagi "eng sekin yo\'llar"ni tekshiring — bitta so\'rov sabab bo\'lishi mumkin.' });
    else if (cpuHour > 65 || loadPerCpu > 1.2)
        out.push({ level: 'warn', title: 'CPU yuklamasi yuqori', detail: `Oxirgi soatda o'rtacha ${round(cpuHour)}%, load ${i.now.load5}.`, action: 'Bir necha kun kuzating; doimiy 70%+ bo\'lsa — 2 vCPU tarifga o\'tish.' });

    // Disk
    const daysLeft = diskDaysLeft(i.week, i.now.diskTotalGb);
    if (diskPct > 90)
        out.push({ level: 'critical', title: 'Disk deyarli to\'lgan', detail: `${round(i.now.diskUsedGb)} / ${round(i.now.diskTotalGb)} GB (${round(diskPct)}%). To'lsa baza va sayt to'xtaydi.`, action: 'Eski Docker image\'lar va zaxira nusxalarni tozalash yoki DigitalOcean Volume qo\'shish / kattaroq diskli tarifga o\'tish.' });
    else if (diskPct > 80 || (daysLeft !== null && daysLeft < 30))
        out.push({ level: 'warn', title: 'Disk to\'lib boryapti', detail: `${round(diskPct)}% band${daysLeft !== null ? `, hozirgi tezlikda ~${daysLeft} kunda to'ladi` : ''}.`, action: 'Rasmlarni DigitalOcean Spaces\'ga ko\'chirish yoki diskni kattalashtirishni rejalashtiring.' });

    // Konteynerlar
    for (const c of i.containers) {
        if (c.oomKilled)
            out.push({ level: 'critical', title: `${c.service}: xotira tugab o'chib qolgan (OOM)`, detail: `Konteyner xotira chegarasidan oshib ketgani uchun o'chirilgan.`, action: `deploy/docker-compose.yml da ${c.service} uchun mem_limit ni oshirish yoki serverga RAM qo'shish.` });
        else if (c.status !== 'running')
            out.push({ level: 'critical', title: `${c.service} ishlamayapti`, detail: `Holati: ${c.status}.`, action: 'Serverda: docker compose logs ' + c.service });
        else if (c.restarts > 0)
            out.push({ level: 'warn', title: `${c.service} ${c.restarts} marta qayta ishga tushgan`, detail: 'Oxirgi deploydan beri konteyner xato bilan to\'xtab, qayta ishga tushgan.', action: `Loglarni ko'rish: docker compose logs --tail 200 ${c.service}` });
        if (c.memLimitMb && c.memMb / c.memLimitMb > 0.9)
            out.push({ level: 'warn', title: `${c.service} xotira chegarasiga yaqin`, detail: `${Math.round(c.memMb)} / ${Math.round(c.memLimitMb)} MB.`, action: `mem_limit ni oshirish (serverda bo'sh RAM bo'lsa) — aks holda OOM bilan o'chishi mumkin.` });
    }
    if (!i.host)
        out.push({ level: 'warn', title: 'Konteynerlar haqida ma\'lumot kelmayapti', detail: 'scripts/host-metrics.sh (cron) ishlamayapti yoki hali birinchi marta ishlamagan.', action: 'Serverda: cat /etc/cron.d/otbozor-metrics va /opt/otbozor/deploy/metrics/host.json ni tekshirish.' });

    // API tezligi va xatolar
    if (i.app.requestsLastHour >= 30) {
        const errRate = (i.app.errors5xxLastHour / i.app.requestsLastHour) * 100;
        if (i.app.p95Ms > 1500)
            out.push({ level: 'critical', title: 'API juda sekin javob beryapti', detail: `So'rovlarning 5% i ${i.app.p95Ms} ms dan sekin.`, action: '"Eng sekin yo\'llar" ro\'yxatidagi birinchi so\'rovni optimallashtirish (indeks, kesh).' });
        else if (i.app.p95Ms > 800)
            out.push({ level: 'warn', title: 'API sekinlashgan', detail: `p95 javob vaqti ${i.app.p95Ms} ms (yaxshi: 500 ms dan kam).`, action: '"Eng sekin yo\'llar"ni ko\'rib chiqing.' });
        if (errRate > 2)
            out.push({ level: 'critical', title: 'Server xatolari ko\'p (5xx)', detail: `Oxirgi soatda ${i.app.errors5xxLastHour} ta xato (${round(errRate)}%).`, action: 'Backend loglari: docker compose logs --tail 300 backend' });
        else if (errRate > 0.5)
            out.push({ level: 'warn', title: 'Server xatolari bor (5xx)', detail: `Oxirgi soatda ${i.app.errors5xxLastHour} ta (${round(errRate)}%).`, action: 'Backend loglarini ko\'rib chiqing.' });
    }

    // Baza
    if (i.db.conns > DB_MAX_CONNS * 0.75)
        out.push({ level: 'warn', title: 'Bazaga ulanishlar ko\'p', detail: `${i.db.conns} / ${DB_MAX_CONNS}.`, action: 'max_connections ni oshirish yoki Prisma connection_limit ni sozlash.' });

    // Zaxira nusxalar
    if (!i.lastBackup || Date.now() / 1000 - i.lastBackup.mtime > 36 * 3600)
        out.push({ level: 'critical', title: 'Bazaning zaxira nusxasi olinmayapti', detail: i.lastBackup ? 'Oxirgi nusxa 36 soatdan eski.' : 'Zaxira nusxa topilmadi.', action: 'Serverda: cat /var/log/otbozor-backup.log va crontab -l ni tekshirish.' });
    else if (i.doInfo.enabled && i.doInfo.droplet && !i.doInfo.droplet.backupsEnabled)
        out.push({ level: 'info', title: 'Zaxira nusxalar faqat shu serverning o\'zida', detail: 'Baza har kuni saqlanyapti, lekin shu droplet ichida. Server butunlay ishdan chiqsa — nusxalar ham yo\'qoladi.', action: 'DigitalOcean → Droplet → Backups ni yoqish (tarif narxining 20%) yoki nusxalarni Spaces\'ga ko\'chirish.' });
    else if (!i.doInfo.enabled)
        out.push({ level: 'info', title: 'Zaxira nusxalar faqat shu serverning o\'zida', detail: 'Baza har kuni saqlanyapti, lekin shu droplet ichida.', action: 'DigitalOcean Backups yoqilganini tekshiring (yoki DO tokenini ulang — shu yerda ko\'rinadi).' });

    if (!out.some((a) => a.level === 'warn' || a.level === 'critical'))
        out.unshift({
            level: 'ok',
            title: 'Server bemalol ishlayapti',
            detail: `RAM ${round(memPct)}%, CPU ${round(cpuHour)}%, disk ${round(diskPct)}%. Hozircha tarifni o'zgartirish shart emas.`,
            action: 'RAM o\'rtacha 80% dan, CPU 65% dan oshsa — shu yerda ogohlantirish chiqadi.',
        });
    const order: Record<Level, number> = { critical: 0, warn: 1, info: 2, ok: 3 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** Oxirgi 7 kundagi o'sish tezligi bo'yicha disk necha kunda to'lishi (o'smasa — null) */
function diskDaysLeft(week: { createdAt: Date; diskUsedGb: number }[], totalGb: number): number | null {
    if (week.length < 12) return null;
    const first = week[0];
    const last = week[week.length - 1];
    const days = (last.createdAt.getTime() - first.createdAt.getTime()) / (24 * HOUR);
    const perDay = days > 0.5 ? (last.diskUsedGb - first.diskUsedGb) / days : 0;
    if (perDay <= 0.01) return null;
    return Math.round((totalGb - last.diskUsedGb) / perDay);
}
