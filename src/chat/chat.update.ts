import { Action, Ctx, Next, On, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { ChatService } from './chat.service';

@Update()
export class ChatUpdate {
    constructor(private readonly chat: ChatService) { }

    /** Chatga tegishli bo'lmagan xabarlar keyingi handlerlarga (/start, kontakt, to'lov) o'tadi */
    @On('message')
    async onMessage(@Ctx() ctx: Context, @Next() next: () => Promise<void>) {
        const handled = await this.chat.relay(ctx).catch(() => false);
        if (!handled) await next();
    }

    @Action('chat:stop')
    async onStop(@Ctx() ctx: Context) {
        if (!ctx.from) return;
        await this.chat.stop(ctx.from.id);
        await ctx.answerCbQuery('Suhbat yakunlandi').catch(() => { });
        await ctx.reply("✅ Suhbat yakunlandi. Endi yozgan xabarlaringiz hech kimga yuborilmaydi.\nKelgan xabarga reply qilib, istalgan vaqtda yana javob berishingiz mumkin.").catch(() => { });
    }
}
