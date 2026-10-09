import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import type { InlineKeyboardMarkup, Message } from 'telegraf/types';
import { ContactType, ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const STOP = 'chat:stop';

/**
 * Bot orqali yashirin chat: xaridor va sotuvchi bir-birining raqami va username'ini
 * ko'rmasdan, bot orqali yozishadi. Xabarlar copyMessage bilan uzatiladi ("forwarded from" yo'q).
 * Javob: kelgan xabarga reply qilish yoki shunchaki yozish (oxirgi faol suhbatga ketadi).
 */
@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);
    private readonly miniAppUrl: string;
    private botUsername: string | null;

    constructor(
        private readonly prisma: PrismaService,
        config: ConfigService,
        @InjectBot() private readonly bot: Telegraf,
    ) {
        this.miniAppUrl = (config.get<string>('MINI_APP_URL') || '').replace(/\/$/, '');
        this.botUsername = (config.get<string>('TELEGRAM_BOT_USERNAME') || '').replace(/^@/, '') || null;
    }

    private async botLink() {
        if (!this.botUsername) {
            const me = await this.bot.telegram.getMe().catch(() => null);
            this.botUsername = me?.username ?? null;
        }
        return this.botUsername ? `https://t.me/${this.botUsername}` : null;
    }

    private stopKeyboard(listingId?: string): InlineKeyboardMarkup {
        const rows: InlineKeyboardMarkup['inline_keyboard'] = [];
        if (listingId && this.miniAppUrl) rows.push([{ text: "📱 E'lonni ochish", web_app: { url: `${this.miniAppUrl}/listings/${listingId}` } }]);
        rows.push([{ text: '❌ Suhbatni yakunlash', callback_data: STOP }]);
        return { inline_keyboard: rows };
    }

    // =================== Suhbatni ochish ===================

    /** Mini App'dan: xaridor sotuvchiga yozmoqchi — suhbat ochiladi va bot xaridorga yo'riqnoma yuboradi */
    async open(listingId: string, buyerId: string) {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id: listingId },
            select: { id: true, title: true, status: true, userId: true, user: { select: { telegramUserId: true } } },
        });
        if (!listing || listing.status !== ListingStatus.APPROVED) throw new NotFoundException("E'lon topilmadi");
        if (listing.userId === buyerId) throw new BadRequestException("O'z e'loningizga yoza olmaysiz");
        if (!listing.user.telegramUserId) throw new BadRequestException("Sotuvchi botga ulanmagan — telefon orqali bog'laning");
        const buyer = await this.prisma.user.findUnique({ where: { id: buyerId }, select: { telegramUserId: true } });
        if (!buyer?.telegramUserId) throw new BadRequestException('Telegram akkauntingiz ulanmagan');

        const existing = await this.prisma.chatThread.findUnique({ where: { listingId_buyerId: { listingId, buyerId } } });
        const thread = existing
            ? await this.prisma.chatThread.update({ where: { id: existing.id }, data: { closedAt: null } })
            : await this.prisma.chatThread.create({ data: { listingId, buyerId, sellerId: listing.userId } });
        if (!existing) {
            await this.prisma.listingContact.create({ data: { listingId, type: ContactType.CHAT, userId: buyerId } }).catch(() => { });
        }
        await this.prisma.user.update({ where: { id: buyerId }, data: { activeChatThreadId: thread.id } });

        await this.bot.telegram
            .sendMessage(
                buyer.telegramUserId.toString(),
                `💬 <b>Sotuvchiga yozing</b>\n🐴 ${esc(listing.title)}\n\n` +
                `Xabaringizni shu yerga yozing — sotuvchiga <b>raqamingiz va username'ingizsiz</b> yetkaziladi. ` +
                `Rasm, ovozli xabar ham yuborishingiz mumkin.\nSotuvchi javobi shu chatga keladi.`,
                { parse_mode: 'HTML', reply_markup: this.stopKeyboard(listing.id) },
            )
            .catch(() => { });
        return { threadId: thread.id, botUrl: await this.botLink() };
    }

    /** /start chat_<listingId> deep link orqali (sayt yoki tashqi havoladan) */
    async openFromDeepLink(ctx: Context, listingId: string) {
        const user = await this.prisma.user.findUnique({ where: { telegramUserId: BigInt(ctx.from!.id) }, select: { id: true } });
        if (!user) {
            await ctx.reply("Avval Otbozor Mini App'ini oching — so'ng sotuvchiga yozishingiz mumkin.");
            return;
        }
        try {
            await this.open(listingId, user.id);
        } catch (e) {
            await ctx.reply(`❌ ${(e as Error).message}`);
        }
    }

    async stop(telegramUserId: number) {
        await this.prisma.user.updateMany({ where: { telegramUserId: BigInt(telegramUserId) }, data: { activeChatThreadId: null } });
    }

    // =================== Xabarlarni uzatish ===================

    /** Xabar chatga tegishli bo'lsa uzatadi va true qaytaradi; aks holda false (keyingi handlerga) */
    async relay(ctx: Context): Promise<boolean> {
        const msg = ctx.message as Message | undefined;
        if (!msg || ctx.chat?.type !== 'private' || !ctx.from) return false;
        if ('text' in msg && msg.text.startsWith('/')) return false;
        if ('contact' in msg || 'successful_payment' in msg) return false;

        const sender = await this.prisma.user.findUnique({
            where: { telegramUserId: BigInt(ctx.from.id) },
            select: { id: true, activeChatThreadId: true },
        });
        if (!sender) return false;

        // 1) Reply qilingan xabar orqali aniq suhbat; 2) aks holda oxirgi faol suhbat
        let threadId: string | null = null;
        const replyTo = 'reply_to_message' in msg ? msg.reply_to_message : undefined;
        if (replyTo) {
            const relay = await this.prisma.chatRelay.findFirst({
                where: { recipientTgId: BigInt(ctx.from.id), tgMessageId: replyTo.message_id },
                select: { threadId: true },
            });
            threadId = relay?.threadId ?? null;
        }
        threadId ??= sender.activeChatThreadId;
        if (!threadId) return false;

        const thread = await this.prisma.chatThread.findUnique({
            where: { id: threadId },
            include: {
                listing: { select: { id: true, title: true } },
                buyer: { select: { id: true, telegramUserId: true } },
                seller: { select: { id: true, telegramUserId: true } },
            },
        });
        if (!thread || thread.closedAt) return false;
        const fromBuyer = sender.id === thread.buyerId;
        if (!fromBuyer && sender.id !== thread.sellerId) return false;
        const to = fromBuyer ? thread.seller : thread.buyer;
        if (!to.telegramUserId) {
            await ctx.reply('❌ Suhbatdosh botga ulanmagan, xabar yuborilmadi.');
            return true;
        }
        const toChat = to.telegramUserId.toString();
        const label = `#${thread.id.slice(0, 4).toUpperCase()}`;
        const header = fromBuyer
            ? `💬 <b>E'loningiz bo'yicha xabar</b> · Xaridor ${label}\n🐴 ${esc(thread.listing.title)}`
            : `💬 <b>Sotuvchidan javob</b>\n🐴 ${esc(thread.listing.title)}`;
        const hint = `\n\n<i>↩️ Javob berish uchun shu xabarga reply qiling</i>`;

        const sentIds: number[] = [];
        try {
            if ('text' in msg) {
                const m = await this.bot.telegram.sendMessage(toChat, `${header}\n\n${esc(msg.text.slice(0, 3500))}${hint}`, {
                    parse_mode: 'HTML',
                    reply_markup: this.stopKeyboard(thread.listing.id),
                });
                sentIds.push(m.message_id);
            } else {
                const h = await this.bot.telegram.sendMessage(toChat, `${header}${hint}`, { parse_mode: 'HTML' });
                sentIds.push(h.message_id);
                const copy = await this.bot.telegram.copyMessage(toChat, ctx.chat.id, msg.message_id, { reply_markup: this.stopKeyboard(thread.listing.id) });
                sentIds.push(copy.message_id);
            }
        } catch (e) {
            this.logger.warn(`Chat relay failed (${thread.id}): ${(e as Error).message}`);
            await ctx.reply('❌ Xabar yetkazilmadi: suhbatdosh botni bloklagan bo\'lishi mumkin.');
            return true;
        }

        await this.prisma.$transaction([
            this.prisma.chatRelay.createMany({
                data: sentIds.map((id) => ({ threadId: thread.id, recipientTgId: to.telegramUserId!, tgMessageId: id })),
            }),
            this.prisma.chatThread.update({
                where: { id: thread.id },
                data: { lastMessageAt: new Date(), messageCount: { increment: 1 } },
            }),
            // Qabul qiluvchi shunchaki yozsa ham shu suhbatga ketadi
            this.prisma.user.update({ where: { id: to.id }, data: { activeChatThreadId: thread.id } }),
        ]);
        await this.bot.telegram
            .setMessageReaction(ctx.chat.id, msg.message_id, [{ type: 'emoji', emoji: '👌' }])
            .catch(() => { });
        return true;
    }
}
