import { BadRequestException, HttpException, HttpStatus, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramWebAppUser, verifyTelegramInitData } from '../auth/telegram-init-data';

export type GameKind = 'race' | 'kopkari';
export type GamePeriod = 'week' | 'month';

/** race: kamroq soniya yaxshi; kopkari: ko'proq halol yaxshi */
const RULES: Record<GameKind, { lowerIsBetter: boolean; ok: (v: number) => boolean; fmt: (v: number) => number }> = {
    race: { lowerIsBetter: true, ok: (v) => v >= 30 && v <= 180, fmt: (v) => Math.round(v * 100) / 100 },
    kopkari: { lowerIsBetter: false, ok: (v) => Number.isInteger(v) && v >= 0 && v <= 40, fmt: (v) => v },
};
const TZ_MS = 5 * 60 * 60 * 1000; // Toshkent vaqti

/** Hafta (ISO) va oy kalitlari Toshkent vaqti bo'yicha */
export function periodKeys(ts = Date.now()): Record<GamePeriod, string> {
    const d = new Date(ts + TZ_MS);
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    const t = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const wy = t.getUTCFullYear();
    const w = Math.ceil(((t.getTime() - Date.UTC(wy, 0, 1)) / 86400000 + 1) / 7);
    return { week: `week:${wy}-W${String(w).padStart(2, '0')}`, month: `month:${y}-${String(m).padStart(2, '0')}` };
}

function displayName(u: TelegramWebAppUser): string {
    const first = String(u.first_name || u.username || 'Chavandoz').replace(/[\u0000-\u001f<>]/g, '').slice(0, 24);
    return u.last_name ? `${first} ${String(u.last_name)[0]}.` : first;
}

@Injectable()
export class GameService {
    private readonly lastPost = new Map<number, number>();

    constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) { }

    private user(initData: string): TelegramWebAppUser {
        const token = this.config.get<string>('GAME_BOT_TOKEN');
        if (!token) throw new ServiceUnavailableException('GAME_BOT_TOKEN sozlanmagan');
        const parsed = initData && initData.length <= 4096 ? verifyTelegramInitData(initData, token) : null;
        if (!parsed) throw new UnauthorizedException('bad initData');
        return parsed.user;
    }

    async submit(initData: string, kind: GameKind, value: number) {
        const rule = RULES[kind];
        if (!rule || !rule.ok(value)) throw new BadRequestException('bad value');
        const u = this.user(initData);
        const now = Date.now();
        if (now - (this.lastPost.get(u.id) || 0) < 8000) throw new HttpException('slow down', HttpStatus.TOO_MANY_REQUESTS);
        this.lastPost.set(u.id, now);
        if (this.lastPost.size > 50000) this.lastPost.clear();

        const keys = periodKeys(now), v = rule.fmt(value), name = displayName(u), improved: Partial<Record<GamePeriod, boolean>> = {};
        for (const per of ['week', 'month'] as GamePeriod[]) {
            const where = { kind_period_telegramUserId: { kind, period: keys[per], telegramUserId: BigInt(u.id) } };
            const cur = await this.prisma.gameScore.findUnique({ where });
            if (cur && (rule.lowerIsBetter ? v >= cur.value : v <= cur.value)) continue;
            await this.prisma.gameScore.upsert({ where, create: { kind, period: keys[per], telegramUserId: BigInt(u.id), name, value: v }, update: { name, value: v } });
            improved[per] = true;
        }
        return { ok: true, improved };
    }

    async top(kind: GameKind, per: GamePeriod, meId?: string, limit = 20) {
        const rule = RULES[kind];
        const period = periodKeys()[per];
        const order = rule.lowerIsBetter ? 'asc' : 'desc';
        const where = { kind, period };
        const [rows, total] = await Promise.all([
            this.prisma.gameScore.findMany({ where, orderBy: [{ value: order }, { updatedAt: 'asc' }], take: limit }),
            this.prisma.gameScore.count({ where }),
        ]);
        let me: { rank: number; value: number } | null = null;
        if (meId && /^\d{1,20}$/.test(meId)) {
            const mine = await this.prisma.gameScore.findUnique({ where: { kind_period_telegramUserId: { kind, period, telegramUserId: BigInt(meId) } } });
            if (mine) {
                const better = await this.prisma.gameScore.count({
                    where: { ...where, OR: [{ value: rule.lowerIsBetter ? { lt: mine.value } : { gt: mine.value } }, { value: mine.value, updatedAt: { lt: mine.updatedAt } }] },
                });
                me = { rank: better + 1, value: mine.value };
            }
        }
        return {
            period: `${kind}:${period}`,
            top: rows.map((r) => ({ name: r.name, value: r.value, me: !!meId && r.telegramUserId.toString() === meId })),
            me,
            total,
        };
    }
}
