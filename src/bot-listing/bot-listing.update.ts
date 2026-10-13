import { Action, Ctx, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { BotListingService } from './bot-listing.service';

@Update()
export class BotListingUpdate {
    constructor(private readonly botListing: BotListingService) { }

    @Action(/^bl:s:(.+)$/)
    async onSubmit(@Ctx() ctx: Context & { match: RegExpExecArray }) {
        await ctx.answerCbQuery().catch(() => undefined);
        await this.botListing.submit(ctx, ctx.match[1]);
    }

    @Action(/^bl:x:(.+)$/)
    async onCancel(@Ctx() ctx: Context & { match: RegExpExecArray }) {
        await ctx.answerCbQuery().catch(() => undefined);
        await this.botListing.cancel(ctx, ctx.match[1]);
    }
}
