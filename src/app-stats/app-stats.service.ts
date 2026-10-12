import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;
const SOURCE_RE = /^[a-z0-9-]{1,24}$/;
const INSTALL_RE = /^[A-Za-z0-9-]{8,64}$/;

/** Toshkent vaqti (UTC+5, yozgi vaqt yo'q) — "bugun" yarim tunda almashadi */
const TZ_OFFSET = 5 * 3_600_000;

/** Toshkent bo'yicha sana (AppActiveDay.day uchun): shu kunning 00:00 UTC ko'rinishi */
const tashkentDay = (d = new Date()) => {
    const t = new Date(d.getTime() + TZ_OFFSET);
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
};
/** Toshkent kunining boshlanish lahzasi (createdAt kabi vaqtlar bilan solishtirish uchun) */
const dayStartInstant = (day: Date) => new Date(day.getTime() - TZ_OFFSET);

/**
 * Android ilova statistikasi: yuklab olishlar (APK havolasi backend orqali o'tadi)
 * va ilova ochilishlari (ilova har ochilganda anonim ID bilan "ping" yuboradi).
 */
@Injectable()
export class AppStatsService {
    readonly apkUrl: string;

    constructor(private readonly prisma: PrismaService, config: ConfigService) {
        const app = (config.get<string>('MINI_APP_URL') || 'https://app.otbozor.uz').replace(/\/$/, '');
        this.apkUrl = config.get<string>('APP_APK_URL') || `${app}/app/otbozor.apk`;
    }

    async recordDownload(source: string | undefined, visitorKey: string) {
        await this.prisma.appDownload.create({
            data: { source: source && SOURCE_RE.test(source) ? source : null, visitorKey },
        });
    }

    /** Ilova ochildi: o'rnatishni yaratadi/yangilaydi va bugungi faol kunni belgilaydi */
    async ping(installId: string, version: string, userId?: string, webVersion?: string) {
        if (!INSTALL_RE.test(installId)) return { ok: false };
        const v = /^[0-9.]{1,16}$/.test(version) ? version : 'unknown';
        const web = webVersion && /^w-[0-9a-f]{6,24}$/.test(webVersion) ? webVersion : null;
        await this.prisma.appInstall.upsert({
            where: { installId },
            create: { installId, version: v, webVersion: web, userId: userId ?? null },
            update: { version: v, lastSeenAt: new Date(), opens: { increment: 1 }, ...(web ? { webVersion: web } : {}), ...(userId ? { userId } : {}) },
        });
        await this.prisma.appActiveDay.upsert({
            where: { installId_day: { installId, day: tashkentDay() } },
            create: { installId, day: tashkentDay() },
            update: { opens: { increment: 1 } },
        });
        return { ok: true };
    }

    /** Admin hisoboti */
    async summary() {
        const now = Date.now();
        const since = (days: number) => new Date(now - days * DAY);
        const today = tashkentDay();
        const from14 = new Date(today.getTime() - 13 * DAY);
        const todayStart = dayStartInstant(today);
        const from14Start = dayStartInstant(from14);

        const [downloads, dl7, dlToday, uniqueRows, bySource, installs, inst7, active1, active7, active30, loggedIn, versions, dlDaily, instDaily, activeDaily, webVersions] =
            await Promise.all([
                this.prisma.appDownload.count(),
                this.prisma.appDownload.count({ where: { createdAt: { gte: since(7) } } }),
                this.prisma.appDownload.count({ where: { createdAt: { gte: todayStart } } }),
                this.prisma.appDownload.findMany({ distinct: ['visitorKey'], select: { visitorKey: true } }),
                this.prisma.appDownload.groupBy({ by: ['source'], _count: { _all: true } }),
                this.prisma.appInstall.count(),
                this.prisma.appInstall.count({ where: { firstSeenAt: { gte: since(7) } } }),
                this.prisma.appActiveDay.count({ where: { day: today } }),
                this.prisma.appActiveDay.findMany({ where: { day: { gte: new Date(today.getTime() - 6 * DAY) } }, distinct: ['installId'], select: { installId: true } }),
                this.prisma.appActiveDay.findMany({ where: { day: { gte: new Date(today.getTime() - 29 * DAY) } }, distinct: ['installId'], select: { installId: true } }),
                this.prisma.appInstall.findMany({ where: { userId: { not: null } }, distinct: ['userId'], select: { userId: true } }),
                this.prisma.appInstall.groupBy({ by: ['version'], _count: { _all: true }, orderBy: { version: 'desc' } }),
                this.prisma.appDownload.findMany({ where: { createdAt: { gte: from14Start } }, select: { createdAt: true } }),
                this.prisma.appInstall.findMany({ where: { firstSeenAt: { gte: from14Start } }, select: { firstSeenAt: true } }),
                this.prisma.appActiveDay.groupBy({ by: ['day'], where: { day: { gte: from14 } }, _count: { _all: true }, _sum: { opens: true } }),
                // Oxirgi 30 kunda ochilgan telefonlar qaysi veb paketda (OTA)
                this.prisma.appInstall.groupBy({
                    by: ['webVersion'],
                    where: { lastSeenAt: { gte: since(30) } },
                    _count: { _all: true },
                    _max: { lastSeenAt: true },
                }),
            ]);

        const bucket = (dates: Date[]) => {
            const arr: number[] = Array(14).fill(0);
            for (const d of dates) {
                const i = Math.floor((d.getTime() - from14Start.getTime()) / DAY);
                if (i >= 0 && i < 14) arr[i]++;
            }
            return arr;
        };
        const activeArr: number[] = Array(14).fill(0);
        const opensArr: number[] = Array(14).fill(0);
        for (const r of activeDaily) {
            const i = Math.round((new Date(r.day).getTime() - from14.getTime()) / DAY);
            if (i >= 0 && i < 14) {
                activeArr[i] = r._count._all;
                opensArr[i] = r._sum.opens ?? 0;
            }
        }
        const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

        return {
            apkUrl: this.apkUrl,
            downloads: { total: downloads, unique: uniqueRows.length, last7: dl7, today: dlToday },
            sources: bySource.map((s) => ({ source: s.source ?? 'boshqa', count: s._count._all })).sort((a, b) => b.count - a.count),
            installs: { total: installs, last7: inst7 },
            active: { today: active1, week: active7.length, month: active30.length },
            opens: { today: opensArr[13], last7: sum(opensArr.slice(7)), last14: sum(opensArr) },
            loggedInUsers: loggedIn.length,
            versions: versions.map((v) => ({ version: v.version, count: v._count._all })),
            webVersions: webVersions
                .map((w) => ({ version: w.webVersion ?? 'eski', count: w._count._all, lastSeenAt: w._max.lastSeenAt }))
                .sort((a, b) => b.count - a.count),
            daily: {
                from: from14.toISOString().slice(0, 10),
                downloads: bucket(dlDaily.map((d) => d.createdAt)),
                installs: bucket(instDaily.map((d) => d.firstSeenAt)),
                active: activeArr,
                opens: opensArr,
            },
        };
    }
}
