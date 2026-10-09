import { Action, Ctx, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { DigestService } from './digest.service';

/** Dayjest xabaridagi "o'chirish" tugmasi */
@Update()
export class DigestUpdate {
    constructor(private readonly digest: DigestService) { }

    @Action('digest:off')
    async off(@Ctx() ctx: Context) {
        if (!ctx.from) return;
        await this.digest.disableByTelegram(ctx.from.id);
        await ctx.answerCbQuery("Dayjest o'chirildi. Mini App → Profil orqali qayta yoqishingiz mumkin.", { show_alert: true }).catch(() => { });
        await ctx.editMessageReplyMarkup(undefined).catch(() => { });
    }
}
