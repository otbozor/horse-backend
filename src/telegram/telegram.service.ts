import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Update, Start, Ctx, Help, On, Command, Action, InjectBot } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { BOT_COMMANDS, HELP_TEXT, WELCOME_TEXT, mainMenuKeyboard } from './bot-menu';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelService } from './telegram-channel.service';
import { resolvePriceOffer } from '../trust/price-offer-core';
import { ChatService } from '../chat/chat.service';

@Injectable()
@Update()
export class TelegramBotService implements OnApplicationBootstrap {
    private readonly logger = new Logger(TelegramBotService.name);

    constructor(
        private readonly authService: AuthService,
        private readonly prisma: PrismaService,
        private readonly channel: TelegramChannelService,
        private readonly chat: ChatService,
        @InjectBot() private readonly bot: Telegraf,
    ) { }

    private get miniAppUrl() {
        return (process.env.MINI_APP_URL || '').replace(/\/$/, '');
    }

    /** Telegram'dagi "Menu" tugmasidagi buyruqlar ro'yxati */
    async onApplicationBootstrap() {
        try {
            await this.bot.telegram.setMyCommands(BOT_COMMANDS.uz);
            await this.bot.telegram.setMyCommands(BOT_COMMANDS.ru, { language_code: 'ru' });
        } catch (e) {
            this.logger.warn(`setMyCommands failed: ${(e as Error).message}`);
        }
    }

    /** Bitta Mini App bo'limini ochadigan qisqa javob */
    private async replyOpen(ctx: Context, text: string, button: string, path: string) {
        if (!this.miniAppUrl) {
            await ctx.reply(text, { parse_mode: 'HTML' });
            return;
        }
        await ctx.reply(text, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: button, web_app: { url: `${this.miniAppUrl}${path}` } }]] },
        });
    }

    @Command('elon')
    async onPost(@Ctx() ctx: Context) {
        await this.replyOpen(ctx, "➕ <b>E'lon joylash</b>\n\nOt, anjom yoki xizmat — turini tanlang, forma 2 daqiqada to'ldiriladi.", "➕ E'lon joylash", '/create');
    }

    @Command('kopkari')
    async onKopkari(@Ctx() ctx: Context) {
        await this.replyOpen(ctx, "🏇 <b>Ko'pkari taqvimi</b>\n\nYaqinlashayotgan ko'pkarilar, ro'yxatdan o'tish va eslatmalar.", "🏇 Ko'pkarilarni ko'rish", '/kopkari');
    }

    @Command('saqlangan')
    async onFavorites(@Ctx() ctx: Context) {
        await this.replyOpen(ctx, "❤️ <b>Saqlangan e'lonlar</b>", '❤️ Saqlanganlarni ochish', '/favorites');
    }

    @Command('sozlamalar')
    async onSettings(@Ctx() ctx: Context) {
        await this.replyOpen(ctx, "🔔 <b>Bildirishnoma sozlamalari</b>\n\nQaysi xabarlar kelishini o'zingiz tanlang.", '⚙️ Sozlamalarni ochish', '/notifications/settings');
    }

    /** Sotuvchi narx taklifini bot xabaridagi tugma orqali qabul qiladi / rad etadi */
    @Action(/^offer:(a|r):(.+)$/)
    async onOfferAction(@Ctx() ctx: Context) {
        const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : '';
        const [, kind, offerId] = data.split(':');
        const accept = kind === 'a';
        try {
            await resolvePriceOffer(this.prisma, this.channel, offerId, { telegramUserId: BigInt(ctx.from!.id) }, accept);
            await ctx.answerCbQuery(accept ? 'Taklif qabul qilindi ✅' : 'Taklif rad etildi');
            const original = ctx.callbackQuery?.message && 'text' in ctx.callbackQuery.message ? ctx.callbackQuery.message.text : '';
            await ctx.editMessageText(
                `${original}\n\n${accept ? "✅ Qabul qilindi — xaridorga kontaktingiz yuborildi" : '❌ Rad etildi'}`,
            ).catch(() => { });
        } catch (error) {
            await ctx.answerCbQuery(error?.message || 'Xatolik yuz berdi', { show_alert: true }).catch(() => { });
        }
    }

    @Start()
    async onStart(@Ctx() ctx: Context) {
        const startPayload = ctx.message && 'text' in ctx.message
            ? ctx.message.text.split(' ')[1]
            : undefined;

        // Sotuvchiga bot orqali yozish: t.me/<bot>?start=chat_<listingId>
        if (startPayload?.startsWith('chat_')) {
            await this.chat.openFromDeepLink(ctx, startPayload.slice(5));
            return;
        }

        if (!startPayload) {
            await ctx.reply(WELCOME_TEXT, { parse_mode: 'HTML', reply_markup: mainMenuKeyboard(this.miniAppUrl) });
            return;
        }

        const sessionId = startPayload;

        try {
            const telegramUserId = ctx.from?.id;
            const telegramUsername = ctx.from?.username;
            const displayName = ctx.from?.first_name + (ctx.from?.last_name ? ` ${ctx.from.last_name}` : '');

            if (!telegramUserId) {
                await ctx.reply('❌ Xatolik: Telegram ma\'lumotlaringizni ololmadik.');
                return;
            }

            const existingUser = await this.prisma.user.findUnique({
                where: { telegramUserId: BigInt(telegramUserId) },
            });

            if (existingUser) {
                // Ro'yxatdan o'tgan — Magic Link yuborish
                console.log('✅ Existing user, sending magic link:', telegramUserId);

                const result = await this.authService.createMagicLink({
                    sessionId,
                    telegramUserId,
                    telegramUsername,
                    displayName,
                });

                if (result.success && result.magicLink) {
                    await ctx.reply(
                        '✅ *Login havolasi tayyor!*\n\n' +
                        '👇 Quyidagi tugmani bosing va avtomatik login bo\'ling:',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: '🚀 Saytga kirish', url: result.magicLink }
                                ]]
                            }
                        }
                    );
                } else {
                    // Fallback - eski usul (kod yuborish)
                    const codeResult = await this.authService.handleTelegramCallback({
                        sessionId,
                        telegramUserId,
                        telegramUsername,
                        displayName,
                    });

                    if (codeResult.success && codeResult.code) {
                        await ctx.reply(
                            '✅ *Tasdiqlash kodi:*\n\n' +
                            `\`${codeResult.code}\`\n\n` +
                            '⚠️ Bu kodni veb saytdagi login sahifasiga kiriting.\n' +
                            '⏰ Kod 5 daqiqa davomida amal qiladi.',
                            { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
                        );
                    } else {
                        await ctx.reply('❌ Xatolik yuz berdi. Veb saytdan qaytadan urinib ko\'ring.');
                    }
                }
            } else {
                // Yangi foydalanuvchi — holatni DB ga saqlash (restart safe)
                const pendingId = `pending_phone:${telegramUserId}`;

                // Eski pending holatni o'chirish
                await this.prisma.telegramAuthSession.deleteMany({
                    where: { id: pendingId },
                });

                await this.prisma.telegramAuthSession.create({
                    data: {
                        id: pendingId,
                        type: 'PENDING_PHONE',
                        data: JSON.stringify({ sessionId, telegramUsername, displayName }),
                        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
                    },
                });

                await ctx.reply(
                    '📱 *Telefon raqamingizni tasdiqlang*\n\n' +
                    'Ro\'yxatdan o\'tish uchun telefon raqamingizni ulashing.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            keyboard: [[
                                { text: '📞 Telefon raqamni yuborish', request_contact: true }
                            ]],
                            resize_keyboard: true,
                            one_time_keyboard: true,
                        },
                    }
                );
            }
        } catch (error) {
            console.error('❌ Telegram bot start error:', error);
            await ctx.reply('❌ Tizimda xatolik yuz berdi. Iltimos, qaytadan urinib ko\'ring.');
        }
    }

    @On('contact')
    async onContact(@Ctx() ctx: Context) {
        try {
            if (!('contact' in ctx.message)) {
                return;
            }

            const contact = ctx.message.contact;
            const telegramUserId = ctx.from?.id;

            if (!telegramUserId) {
                await ctx.reply('❌ Xatolik: Telegram ma\'lumotlaringizni ololmadik.');
                return;
            }

            // Holatni DB dan olish
            const pendingId = `pending_phone:${telegramUserId}`;
            const pendingSession = await this.prisma.telegramAuthSession.findUnique({
                where: { id: pendingId },
            });

            if (!pendingSession || pendingSession.type !== 'PENDING_PHONE' || pendingSession.expiresAt < new Date()) {
                if (pendingSession) {
                    await this.prisma.telegramAuthSession.delete({ where: { id: pendingId } });
                }
                // Login jarayoni emas — Mini App yoki bot tugmasidan raqam ulash
                await this.linkPhone(ctx, contact);
                return;
            }

            if (contact.user_id !== telegramUserId) {
                await ctx.reply('❌ Iltimos, o\'zingizning telefon raqamingizni yuboring.');
                return;
            }

            const { sessionId, telegramUsername, displayName } = JSON.parse(pendingSession.data);
            const phoneNumber = contact.phone_number;
            const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

            console.log('📱 Processing contact:', { telegramUserId, phone: formattedPhone, sessionId });

            // Holatni DB dan o'chirish
            await this.prisma.telegramAuthSession.delete({ where: { id: pendingId } });

            const result = await this.authService.createMagicLinkWithPhone({
                sessionId,
                telegramUserId,
                telegramUsername,
                displayName,
                phone: formattedPhone,
            });

            console.log('✅ Auth callback result:', result);

            if (result.success && result.magicLink) {
                await ctx.reply(
                    '✅ *Login havolasi tayyor!*\n\n' +
                    '👇 Quyidagi tugmani bosing va avtomatik login bo\'ling:',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🚀 Saytga kirish', url: result.magicLink }
                            ]],
                            remove_keyboard: true
                        }
                    }
                );
            } else if (result.success && result.code) {
                // Fallback - eski usul (kod yuborish)
                await ctx.reply(
                    '✅ *Tasdiqlash kodi:*\n\n' +
                    `\`${result.code}\`\n\n` +
                    '⚠️ Bu kodni veb saytdagi login sahifasiga kiriting.\n' +
                    '⏰ Kod 10 daqiqa davomida amal qiladi.',
                    {
                        parse_mode: 'Markdown',
                        reply_markup: { remove_keyboard: true }
                    }
                );
            } else {
                console.error('❌ Auth callback failed:', result.error);
                await ctx.reply(
                    '❌ Xatolik yuz berdi.\n\n' +
                    `Sabab: ${result.error || 'Noma\'lum xatolik'}\n\n` +
                    'Veb saytdan qaytadan urinib ko\'ring.'
                );
            }
        } catch (error) {
            console.error('❌ Telegram bot contact error:', error);
            await ctx.reply(
                '❌ Tizimda xatolik yuz berdi.\n\n' +
                'Iltimos, qaytadan urinib ko\'ring yoki qo\'llab-quvvatlash xizmatiga murojaat qiling.'
            );
        }
    }

    /** Mini App'dan (requestContact) kelgan raqamni profilga ulash */
    private async linkPhone(ctx: Context, contact: { phone_number: string; user_id?: number }) {
        const telegramUserId = ctx.from!.id;
        if (contact.user_id !== telegramUserId) {
            await ctx.reply("❌ Iltimos, o'zingizning telefon raqamingizni yuboring.", { reply_markup: { remove_keyboard: true } });
            return;
        }
        const phone = contact.phone_number.startsWith('+') ? contact.phone_number : `+${contact.phone_number}`;
        const res = await this.prisma.user.updateMany({ where: { telegramUserId: BigInt(telegramUserId) }, data: { phone } });
        if (!res.count) {
            await ctx.reply("Avval Otbozor ilovasini oching — so'ng raqamingizni ulashingiz mumkin.", { reply_markup: mainMenuKeyboard(this.miniAppUrl) });
            return;
        }
        await ctx.reply(`✅ Telefon raqamingiz ulandi: ${phone}\n\nEndi e'lon joylaganda raqam avtomatik qo'yiladi.`, { reply_markup: { remove_keyboard: true } });
    }

    /** Faqat adminlar uchun: o'z Telegram ID sini bilish */
    @Command('myid')
    async onMyId(@Ctx() ctx: Context) {
        const userId = ctx.from?.id;
        const admins = `${process.env.ADMIN_TELEGRAM_IDS || ''},${process.env.TELEGRAM_ADMIN_CHAT_IDS || ''}`.split(',').map((x) => x.trim());
        if (!userId || !admins.includes(String(userId))) return;
        await ctx.reply(
            `🆔 Sizning Telegram ID:\n\n<code>${userId}</code>\n\n` +
            `Bu ID ni <b>TELEGRAM_ADMIN_CHAT_ID</b> ga kiriting.`,
            { parse_mode: 'HTML' }
        );
    }

    @Help()
    async onHelp(@Ctx() ctx: Context) {
        await ctx.reply(HELP_TEXT, { parse_mode: 'HTML', reply_markup: mainMenuKeyboard(this.miniAppUrl) });
    }

    @Command('yordam')
    async onYordam(@Ctx() ctx: Context) {
        await this.onHelp(ctx);
    }
}
