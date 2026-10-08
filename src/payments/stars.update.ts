import { Logger } from '@nestjs/common';
import { Ctx, On, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { StarsService } from './stars.service';

/**
 * Telegram Stars to'lov update'lari. PaymentModule ichida turadi - shunda
 * TelegramModule bilan aylanma bog'liqlik bo'lmaydi (nestjs-telegraf barcha
 * modullardagi @Update klasslarini o'zi topadi).
 */
@Update()
export class StarsUpdate {
    private readonly logger = new Logger(StarsUpdate.name);

    constructor(private readonly stars: StarsService) { }

    @On('pre_checkout_query')
    async onPreCheckout(@Ctx() ctx: Context) {
        const q = ctx.preCheckoutQuery!;
        try {
            const error = await this.stars.validatePreCheckout(q.invoice_payload, q.currency, q.total_amount);
            if (error) await ctx.answerPreCheckoutQuery(false, error);
            else await ctx.answerPreCheckoutQuery(true);
        } catch (e) {
            this.logger.error(`pre_checkout xatosi: ${e.message}`);
            await ctx.answerPreCheckoutQuery(false, 'Xatolik yuz berdi, qayta urinib ko\'ring').catch(() => { });
        }
    }

    @On('successful_payment')
    async onSuccessfulPayment(@Ctx() ctx: Context) {
        const msg = ctx.message;
        if (!msg || !('successful_payment' in msg)) return;
        const sp = msg.successful_payment;
        try {
            await this.stars.complete(sp.invoice_payload, sp.telegram_payment_charge_id, sp.total_amount);
            await ctx.reply(`✅ To'lov qabul qilindi: ${sp.total_amount} ⭐\nRahmat! Mini App'da holat avtomatik yangilanadi.`);
        } catch (e) {
            this.logger.error(`successful_payment xatosi: ${e.message} (charge ${sp.telegram_payment_charge_id})`);
            await ctx.reply("⚠️ To'lov qabul qilindi, lekin qayta ishlashda xatolik bo'ldi. Administrator tekshiradi.").catch(() => { });
        }
    }
}
