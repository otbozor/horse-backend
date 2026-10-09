import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import type { InlineKeyboardMarkup } from 'telegraf/types';
import { NotificationCategory, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Foydalanuvchi o'chira oladigan turlar (SYSTEM — doim yoqilgan) */
export const OPTIONAL_CATEGORIES: NotificationCategory[] = [
    NotificationCategory.LISTINGS,
    NotificationCategory.OFFERS,
    NotificationCategory.SEARCHES,
    NotificationCategory.AUCTIONS,
    NotificationCategory.KOPKARI,
];

export interface DeliverInput {
    userId?: string | null;
    telegramUserId?: string | bigint | null;
    category: NotificationCategory;
    /** Ro'yxatdagi qisqa sarlavha (oddiy matn) */
    title: string;
    /** Bot xabari (HTML) */
    html: string;
    /** Mini App ichidagi yo'l, masalan /listings/<id> */
    link?: string | null;
    buttonText?: string;
    replyMarkup?: InlineKeyboardMarkup;
    photoUrl?: string | null;
}

const stripHtml = (s: string) =>
    s.replace(/<a [^>]*>.*?<\/a>/g, '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

/**
 * Yagona bildirishnoma kanali: har bir xabar Mini App'dagi 🔔 ro'yxatga yoziladi va
 * foydalanuvchi shu turni o'chirmagan bo'lsa, bot orqali ham yuboriladi.
 */
@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);
    private readonly miniAppUrl: string;

    constructor(
        private readonly prisma: PrismaService,
        config: ConfigService,
        @InjectBot() private readonly bot: Telegraf,
    ) {
        this.miniAppUrl = (config.get<string>('MINI_APP_URL') || '').replace(/\/$/, '');
    }

    /** Bot xabari yetkazilgan bo'lsa true */
    async deliver(input: DeliverInput): Promise<boolean> {
        const where: Prisma.UserWhereUniqueInput | null = input.userId
            ? { id: input.userId }
            : input.telegramUserId != null
                ? { telegramUserId: BigInt(input.telegramUserId.toString()) }
                : null;
        if (!where) return false;
        const user = await this.prisma.user.findUnique({ where, select: { id: true, telegramUserId: true, notificationPrefs: true } });
        if (!user) {
            // Ro'yxatdan o'tmagan chat (masalan, admin chat) — faqat bot xabari
            return input.telegramUserId != null ? this.send(input.telegramUserId.toString(), input) : false;
        }

        // Ro'yxatdagi matn: sarlavhadan keyingi qism
        // Sarlavhadagi emoji olib tashlanadi, matnda sarlavhani takrorlovchi boshlang'ich qatorlar tushiriladi
        const noEmoji = (t: string) => t.replace(/^[^\p{L}\d"«]+/u, '').trim();
        const title = noEmoji(input.title).slice(0, 120);
        const lines = stripHtml(input.html).split('\n');
        while (lines.length && (!lines[0].trim() || noEmoji(lines[0]).length < 2 || title.includes(noEmoji(lines[0])))) lines.shift();
        const body = lines.join('\n').trim();
        await this.prisma.notification
            .create({ data: { userId: user.id, category: input.category, title, body: body.slice(0, 600) || null, link: input.link ?? null } })
            .catch((e) => this.logger.error(`Notification save failed: ${e.message}`));

        const prefs = (user.notificationPrefs ?? {}) as Record<string, boolean>;
        if (input.category !== NotificationCategory.SYSTEM && prefs[input.category] === false) return false;
        if (!user.telegramUserId) return false;
        return this.send(user.telegramUserId.toString(), input);
    }

    private async send(chatId: string, input: DeliverInput): Promise<boolean> {
        const reply_markup =
            input.replyMarkup ??
            (input.link && this.miniAppUrl
                ? { inline_keyboard: [[{ text: input.buttonText ?? '📱 Mini App\'da ochish', web_app: { url: `${this.miniAppUrl}${input.link}` } }]] }
                : undefined);
        try {
            if (input.photoUrl) await this.bot.telegram.sendPhoto(chatId, input.photoUrl, { caption: input.html, parse_mode: 'HTML', reply_markup });
            else await this.bot.telegram.sendMessage(chatId, input.html, { parse_mode: 'HTML', reply_markup, link_preview_options: { is_disabled: true } });
            return true;
        } catch (e) {
            this.logger.warn(`Bot notification failed (${input.category}): ${(e as Error).message}`);
            return false;
        }
    }

    // =================== Mini App ro'yxati ===================

    async list(userId: string, page = 1) {
        const take = 30;
        const [items, unread] = await Promise.all([
            this.prisma.notification.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip: (Math.max(1, page) - 1) * take,
                take: take + 1,
            }),
            this.unreadCount(userId),
        ]);
        return { items: items.slice(0, take), hasMore: items.length > take, unread };
    }

    unreadCount(userId: string) {
        return this.prisma.notification.count({ where: { userId, readAt: null } });
    }

    async markAllRead(userId: string) {
        await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
        return { unread: 0 };
    }

    async markRead(userId: string, id: string) {
        await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
        return { unread: await this.unreadCount(userId) };
    }

    // =================== Sozlamalar ===================

    async prefs(userId: string) {
        const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true, digestEnabled: true } });
        const p = (u?.notificationPrefs ?? {}) as Record<string, boolean>;
        return {
            digestEnabled: u?.digestEnabled ?? true,
            categories: Object.fromEntries(OPTIONAL_CATEGORIES.map((c) => [c, p[c] !== false])) as Record<string, boolean>,
        };
    }

    async updatePrefs(userId: string, body: { digestEnabled?: boolean; categories?: Record<string, boolean> }) {
        const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
        const p = { ...((u?.notificationPrefs ?? {}) as Record<string, boolean>) };
        for (const c of OPTIONAL_CATEGORIES) {
            if (body.categories && typeof body.categories[c] === 'boolean') p[c] = body.categories[c];
        }
        await this.prisma.user.update({
            where: { id: userId },
            data: { notificationPrefs: p, ...(typeof body.digestEnabled === 'boolean' ? { digestEnabled: body.digestEnabled } : {}) },
        });
        return this.prefs(userId);
    }
}
