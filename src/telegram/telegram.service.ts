import { Injectable } from '@nestjs/common';
import { InjectBot, Update, Start, Ctx, Help, On } from 'nestjs-telegraf';
import { Telegraf, Context } from 'telegraf';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

interface UserState {
    sessionId: string;
    step: 'WAITING_PHONE' | 'COMPLETED';
    telegramUserId: number;
    telegramUsername?: string;
    displayName: string;
}

@Injectable()
@Update()
export class TelegramBotService {
    // Store user states temporarily
    private userStates = new Map<number, UserState>();

    constructor(
        @InjectBot() private readonly bot: Telegraf<Context>,
        private readonly authService: AuthService,
        private readonly prisma: PrismaService,
    ) { }

    @Start()
    async onStart(@Ctx() ctx: Context) {
        const startPayload = ctx.message && 'text' in ctx.message
            ? ctx.message.text.split(' ')[1]
            : undefined;

        if (!startPayload) {
            // Oddiy /start command - greeting
            await ctx.reply(
                '🐴 *Otbozor platformasiga xush kelibsiz!*\n\n' +
                'Login qilish uchun veb saytdan "Telegram orqali kirish" tugmasini bosing.',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Session ID bilan /start - bu login jarayoni
        const sessionId = startPayload;

        try {
            const telegramUserId = ctx.from?.id;
            const telegramUsername = ctx.from?.username;
            const displayName = ctx.from?.first_name + (ctx.from?.last_name ? ` ${ctx.from.last_name}` : '');

            if (!telegramUserId) {
                await ctx.reply('❌ Xatolik: Telegram ma\'lumotlaringizni ololmadik.');
                return;
            }

            // Mavjud foydalanuvchini tekshirish
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
                // Yangi foydalanuvchi — telefon so'rash
                this.userStates.set(telegramUserId, {
                    sessionId,
                    step: 'WAITING_PHONE',
                    telegramUserId,
                    telegramUsername,
                    displayName,
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

            // Check if user has pending state
            const userState = this.userStates.get(telegramUserId);
            if (!userState || userState.step !== 'WAITING_PHONE') {
                await ctx.reply(
                    '❌ Login jarayoni topilmadi.\n\n' +
                    'Iltimos, veb saytdan qaytadan "Telegram orqali kirish" tugmasini bosing.'
                );
                return;
            }

            // Verify contact belongs to user
            if (contact.user_id !== telegramUserId) {
                await ctx.reply('❌ Iltimos, o\'zingizning telefon raqamingizni yuboring.');
                return;
            }

            const phoneNumber = contact.phone_number;

            // Format phone number (add + if missing)
            const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

            console.log('📱 Processing contact:', {
                telegramUserId,
                phone: formattedPhone,
                sessionId: userState.sessionId
            });

            // Call backend callback to generate code
            const result = await this.authService.handleTelegramCallback({
                sessionId: userState.sessionId,
                telegramUserId: userState.telegramUserId,
                telegramUsername: userState.telegramUsername,
                displayName: userState.displayName,
                phone: formattedPhone,
            });

            console.log('✅ Auth callback result:', result);

            if (result.success && result.code) {
                // Update state
                userState.step = 'COMPLETED';

                // Send code to user
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

                // Clean up state after 10 minutes
                setTimeout(() => {
                    this.userStates.delete(telegramUserId);
                }, 10 * 60 * 1000);
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
            console.error('Error stack:', error.stack);
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
