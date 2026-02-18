import { Injectable } from '@nestjs/common';
import { Update, Start, Ctx, Help, On } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
@Update()
export class TelegramBotService {
    constructor(
        private readonly authService: AuthService,
        private readonly prisma: PrismaService,
    ) { }

    @Start()
    async onStart(@Ctx() ctx: Context) {
        const startPayload = ctx.message && 'text' in ctx.message
            ? ctx.message.text.split(' ')[1]
            : undefined;

        if (!startPayload) {
            await ctx.reply(
                '🐴 *Otbozor platformasiga xush kelibsiz!*\n\n' +
                'Login qilish uchun veb saytdan "Telegram orqali kirish" tugmasini bosing.',
                { parse_mode: 'Markdown' }
            );
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
                // Ro'yxatdan o'tgan — telefon so'ramasdan to'g'ridan-to'g'ri kod yuborish
                console.log('✅ Existing user, sending code directly:', telegramUserId);

                const result = await this.authService.handleTelegramCallback({
                    sessionId,
                    telegramUserId,
                    telegramUsername,
                    displayName,
                });

                if (result.success && result.code) {
                    await ctx.reply(
                        '✅ *Tasdiqlash kodi:*\n\n' +
                        `\`${result.code}\`\n\n` +
                        '⚠️ Bu kodni veb saytdagi login sahifasiga kiriting.\n' +
                        '⏰ Kod 5 daqiqa davomida amal qiladi.',
                        { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
                    );
                } else {
                    await ctx.reply('❌ Xatolik yuz berdi. Veb saytdan qaytadan urinib ko\'ring.');
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
                await ctx.reply(
                    '❌ Login jarayoni topilmadi yoki muddati o\'tdi.\n\n' +
                    'Iltimos, veb saytdan qaytadan "Telegram orqali kirish" tugmasini bosing.'
                );
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

            const result = await this.authService.handleTelegramCallback({
                sessionId,
                telegramUserId,
                telegramUsername,
                displayName,
                phone: formattedPhone,
            });

            console.log('✅ Auth callback result:', result);

            if (result.success && result.code) {
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

    @Help()
    async onHelp(@Ctx() ctx: Context) {
        await ctx.reply(
            '🆘 *Yordam*\n\n' +
            '🐴 *Otbozor* - O\'zbekistondagi eng katta ot savdo platformasi\n\n' +
            '*Login qilish:*\n' +
            '1. Veb saytga o\'ting: otbozor.uz\n' +
            '2. "Telegram orqali kirish" tugmasini bosing\n' +
            '3. Bot sizga telefon raqamni so\'raydi\n' +
            '4. "📞 Telefon raqamni yuborish" tugmasini bosing\n' +
            '5. Bot tasdiqlash kodini yuboradi\n' +
            '6. Kodni veb saytda kiriting\n\n' +
            '*Aloqa:* @otbozor_support',
            { parse_mode: 'Markdown' }
        );
    }
}
