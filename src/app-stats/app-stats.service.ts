import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;
const SOURCE_RE = /^[a-z0-9-]{1,24}$/;
const INSTALL_RE = /^[A-Za-z0-9-]{8,64}$/;

/** UTC kun boshi (AppActiveDay.day uchun) */
const dayStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

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
    async ping(installId: string, version: string, userId?: string) {
        if (!INSTALL_RE.test(installId)) return { ok: false };
        const v = /^[0-9.]{1,16}$/.test(version) ? version : 'unknown';
        await this.prisma.appInstall.upsert({
            where: { installId },
            create: { installId, version: v, userId: userId ?? null },
            update: { version: v, lastSeenAt: new Date(), opens: { increment: 1 }, ...(userId ? { userId } : {}) },
        });
        await this.prisma.appActiveDay.upsert({
            where: { installId_day: { installId, day: dayStart() } },
            create: { installId, day: dayStart() },
            update: {},
        });
        return { ok: true };
    }

    /** Admin hisoboti */
    async summary() {
        const now = Date.now();
        const since = (days: number) => new Date(now - days * DAY);
        const today = dayStart();
        const from14 = new Date(today.getTime() - 13 * DAY);

        const [downloads, dl7, dlToday, uniqueRows, bySource, installs, inst7, active1, active7, active30, loggedIn, versions, dlDaily, instDaily, activeDaily] =
            await Promise.all([
                this.prisma.appDownload.count(),
                this.prisma.appDownload.count({ where: { createdAt: { gte: since(7) } } }),
                this.prisma.appDownload.count({ where: { createdAt: { gte: today } } }),
                this.prisma.appDownload.findMany({ distinct: ['visitorKey'], select: { visitorKey: true } }),
                this.prisma.appDownload.groupBy({ by: ['source'], _count: { _all: true } }),
                this.prisma.appInstall.count(),
                this.prisma.appInstall.count({ where: { firstSeenAt: { gte: since(7) } } }),
                this.prisma.appActiveDay.count({ where: { day: today } }),
                this.prisma.appActiveDay.findMany({ where: { day: { gte: new Date(today.getTime() - 6 * DAY) } }, distinct: ['installId'], select: { installId: true } }),
                this.prisma.appActiveDay.findMany({ where: { day: { gte: new Date(today.getTime() - 29 * DAY) } }, distinct: ['installId'], select: { installId: true } }),
                this.prisma.appInstall.findMany({ where: { userId: { not: null } }, distinct: ['userId'], select: { userId: true } }),
                this.prisma.appInstall.groupBy({ by: ['version'], _count: { _all: true }, orderBy: { version: 'desc' } }),
                this.prisma.appDownload.findMany({ where: { createdAt: { gte: from14 } }, select: { createdAt: true } }),
                this.prisma.appInstall.findMany({ where: { firstSeenAt: { gte: from14 } }, select: { firstSeenAt: true } }),
                this.prisma.appActiveDay.groupBy({ by: ['day'], where: { day: { gte: from14 } }, _count: { _all: true } }),
            ]);

        const bucket = (dates: Date[]) => {
            const arr: number[] = Array(14).fill(0);
            for (const d of dates) {
                const i = Math.floor((d.getTime() - from14.getTime()) / DAY);
                if (i >= 0 && i < 14) arr[i]++;
            }
            return arr;
        };
        const activeArr: number[] = Array(14).fill(0);
        for (const r of activeDaily) {
            const i = Math.round((new Date(r.day).getTime() - from14.getTime()) / DAY);
            if (i >= 0 && i < 14) activeArr[i] = r._count._all;
        }

        return {
            apkUrl: this.apkUrl,
            downloads: { total: downloads, unique: uniqueRows.length, last7: dl7, today: dlToday },
            sources: bySource.map((s) => ({ source: s.source ?? 'boshqa', count: s._count._all })).sort((a, b) => b.count - a.count),
            installs: { total: installs, last7: inst7 },
            active: { today: active1, week: active7.length, month: active30.length },
            loggedInUsers: loggedIn.length,
            versions: versions.map((v) => ({ version: v.version, count: v._count._all })),
            daily: {
                from: from14.toISOString().slice(0, 10),
                downloads: bucket(dlDaily.map((d) => d.createdAt)),
                installs: bucket(instDaily.map((d) => d.firstSeenAt)),
                active: activeArr,
            },
        };
    }
}
