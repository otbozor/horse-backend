import { Action, Ctx, Next, On, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { ChatService } from './chat.service';
import { FALLBACK_TEXT, mainMenuKeyboard } from '../telegram/bot-menu';

@Update()
export class ChatUpdate {
    constructor(private readonly chat: ChatService) { }

    /** Chatga tegishli bo'lmagan xabarlar keyingi handlerlarga (/start, kontakt, to'lov) o'tadi */
    @On('message')
    async onMessage(@Ctx() ctx: Context, @Next() next: () => Promise<void>) {
        const handled = await this.chat.relay(ctx).catch(() => false);
        if (handled) return;
        // Hech kimga tegishli bo'lmagan oddiy matn — jim qolmasdan menyu ko'rsatamiz
        const msg = ctx.message;
        if (ctx.chat?.type === 'private' && msg && 'text' in msg && !msg.text.startsWith('/')) {
            const miniAppUrl = (process.env.MINI_APP_URL || '').replace(/\/$/, '');
            await ctx.reply(FALLBACK_TEXT, { reply_markup: mainMenuKeyboard(miniAppUrl) }).catch(() => { });
            return;
        }
        await next();
    }

    @Action('chat:stop')
    async onStop(@Ctx() ctx: Context) {
        if (!ctx.from) return;
        await this.chat.stop(ctx.from.id);
        await ctx.answerCbQuery('Suhbat yakunlandi').catch(() => { });
        await ctx.reply("✅ Suhbat yakunlandi. Endi yozgan xabarlaringiz hech kimga yuborilmaydi.\nKelgan xabarga reply qilib, istalgan vaqtda yana javob berishingiz mumkin.").catch(() => { });
    }
}
