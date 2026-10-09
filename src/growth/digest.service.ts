import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import { EventStatus, ListingStatus, Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86400000;
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];

function shortPrice(amount: unknown, currency: string) {
    const n = Number(amount);
    if (!n) return 'kelishiladi';
    if (currency === 'USD') return `$${n.toLocaleString('en-US')}`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0).replace(/\.0$/, '')} mln so'm`;
    return `${Math.round(n / 1000)} ming so'm`;
}

/** Haftalik dayjest: foydalanuvchi hududidagi yangi e'lonlar va yaqin ko'pkarilar (dushanba 10:00) */
@Injectable()
export class DigestService {
    private readonly logger = new Logger(DigestService.name);
    private readonly miniAppUrl: string;
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        config: ConfigService,
        @InjectBot() private readonly bot: Telegraf,
    ) {
        this.miniAppUrl = (config.get<string>('MINI_APP_URL') || '').replace(/\/$/, '');
    }

    /** Admin paneldagi umumiy kalit (standart o'chiq — e'lonlar ko'paygach yoqiladi) */
    async isGloballyEnabled() {
        const row = await this.prisma.appSetting.findUnique({ where: { key: 'digest_enabled' } });
        return row?.value === 'true';
    }

    async setGloballyEnabled(enabled: boolean) {
        await this.prisma.appSetting.upsert({
            where: { key: 'digest_enabled' },
            update: { value: String(enabled) },
            create: { key: 'digest_enabled', value: String(enabled) },
        });
        return this.adminSettings();
    }

    async adminSettings() {
        const [enabled, recipients, listingsThisWeek] = await Promise.all([
            this.isGloballyEnabled(),
            this.prisma.user.count({ where: { telegramUserId: { not: null }, status: UserStatus.ACTIVE, digestEnabled: true } }),
            this.prisma.horseListing.count({ where: { status: ListingStatus.APPROVED, publishedAt: { gte: new Date(Date.now() - 7 * DAY) } } }),
        ]);
        return { enabled, recipients, listingsThisWeek };
    }

    @Cron('0 10 * * 1', { timeZone: 'Asia/Tashkent' })
    async weekly() {
        if (this.running) return;
        if (!(await this.isGloballyEnabled())) {
            this.logger.log("📰 Haftalik dayjest admin tomonidan o'chirilgan — yuborilmadi");
            return;
        }
        this.running = true;
        try {
            const users = await this.prisma.user.findMany({
                where: { telegramUserId: { not: null }, status: UserStatus.ACTIVE, digestEnabled: true },
                select: { id: true, telegramUserId: true },
            });
            const cache = new Map<string, string | null>();
            let sent = 0;
            for (const u of users) {
                try {
                    const region = await this.userRegion(u.id);
                    const key = region?.id ?? 'all';
                    if (!cache.has(key)) cache.set(key, await this.build(region));
                    const text = cache.get(key);
                    if (!text) continue;
                    await this.sendText(u.telegramUserId!.toString(), text);
                    sent++;
                } catch {
                    /* botni bloklagan */
                }
                await sleep(40);
            }
            this.logger.log(`📰 Haftalik dayjest: ${sent}/${users.length}`);
        } finally {
            this.running = false;
        }
    }

    /** Foydalanuvchi hududi: oxirgi e'loni yoki saqlangan qidiruvi bo'yicha */
    private async userRegion(userId: string): Promise<{ id: string; nameUz: string } | null> {
        const listing = await this.prisma.horseListing.findFirst({
            where: { userId, regionId: { not: null } },
            orderBy: { createdAt: 'desc' },
            select: { region: { select: { id: true, nameUz: true } } },
        });
        if (listing?.region) return listing.region;
        const search = await this.prisma.savedSearch.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
        const regionId = (search?.filters as Record<string, unknown> | null)?.regionId;
        if (typeof regionId === 'string') {
            return this.prisma.region.findUnique({ where: { id: regionId }, select: { id: true, nameUz: true } });
        }
        return null;
    }

    /** Dayjest matni; yangilik bo'lmasa null (spam qilmaymiz) */
    async build(region: { id: string; nameUz: string } | null): Promise<string | null> {
        const since = new Date(Date.now() - 7 * DAY);
        const base: Prisma.HorseListingWhereInput = { status: ListingStatus.APPROVED, publishedAt: { gte: since } };
        const regional: Prisma.HorseListingWhereInput = region ? { ...base, regionId: region.id } : base;
        const [total, inRegion, events] = await Promise.all([
            this.prisma.horseListing.count({ where: base }),
            region ? this.prisma.horseListing.count({ where: regional }) : Promise.resolve(0),
            this.prisma.event.findMany({
                where: { status: EventStatus.PUBLISHED, startsAt: { gte: new Date(), lte: new Date(Date.now() + 14 * DAY) } },
                orderBy: { startsAt: 'asc' },
                take: 3,
                include: { region: { select: { nameUz: true } } },
            }),
        ]);
        if (!total && !events.length) return null;

        const useRegion = Boolean(region && inRegion >= 3);
        const top = await this.prisma.horseListing.findMany({
            where: useRegion ? regional : base,
            orderBy: [{ isPremium: 'desc' }, { viewCount: 'desc' }, { publishedAt: 'desc' }],
            take: 5,
            select: { title: true, priceAmount: true, priceCurrency: true, region: { select: { nameUz: true } } },
        });

        let text = `📰 <b>Otbozor: haftalik dayjest</b>\n\n`;
        if (total) {
            text += `Bu hafta <b>${total}</b> ta yangi ot e'loni joylandi`;
            text += region && inRegion ? `, shundan <b>${inRegion}</b> tasi ${esc(region.nameUz)}da.\n` : '.\n';
        }
        if (top.length) {
            text += `\n🔥 <b>${useRegion ? `${esc(region!.nameUz)}dagi` : 'Eng ko\'p ko\'rilgan'} e'lonlar:</b>\n`;
            for (const l of top) {
                text += `• ${esc(l.title.slice(0, 50))} — ${shortPrice(l.priceAmount, l.priceCurrency)}${!useRegion && l.region ? ` (${esc(l.region.nameUz)})` : ''}\n`;
            }
        }
        if (events.length) {
            text += `\n🏆 <b>Yaqin ko'pkarilar:</b>\n`;
            for (const e of events) {
                const d = new Date(e.startsAt.getTime() + 5 * 3600000);
                text += `• ${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]} — ${esc(e.title.slice(0, 50))}${e.region ? ` (${esc(e.region.nameUz)})` : ''}\n`;
            }
        }
        return text;
    }

    private async sendText(chatId: string, text: string) {
        const keyboard: InlineKeyboardButton[][] = [];
        if (this.miniAppUrl) keyboard.push([{ text: '🐴 Bozorni ochish', web_app: { url: this.miniAppUrl } }]);
        keyboard.push([{ text: "🔕 Dayjestni o'chirish", callback_data: 'digest:off' }]);
        await this.bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
    }

    /** Admin: dayjestni o'ziga yuborib ko'rish */
    async sendTest(adminId: string) {
        const admin = await this.prisma.user.findUnique({ where: { id: adminId }, select: { telegramUserId: true } });
        if (!admin?.telegramUserId) throw new BadRequestException('Telegram akkauntingiz ulanmagan');
        const text = (await this.build(await this.userRegion(adminId))) ?? "📰 Bu hafta yangilik yo'q — dayjest yuborilmaydi.";
        try {
            await this.sendText(admin.telegramUserId.toString(), text);
        } catch (e) {
            throw new BadRequestException(`Yuborilmadi: ${(e as Error).message}`);
        }
        const recipients = await this.prisma.user.count({
            where: { telegramUserId: { not: null }, status: UserStatus.ACTIVE, digestEnabled: true },
        });
        return { sent: true, recipients };
    }

    async setEnabled(userId: string, enabled: boolean) {
        await this.prisma.user.update({ where: { id: userId }, data: { digestEnabled: enabled } });
        return { digestEnabled: enabled };
    }

    async disableByTelegram(telegramUserId: number) {
        await this.prisma.user.updateMany({ where: { telegramUserId: BigInt(telegramUserId) }, data: { digestEnabled: false } });
    }
}
