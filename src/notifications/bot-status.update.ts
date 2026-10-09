import { Ctx, On, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { NotificationsService } from './notifications.service';

/** Telegram foydalanuvchi botni bloklaganda / qayta yoqqanda my_chat_member yuboradi */
@Update()
export class BotStatusUpdate {
    constructor(private readonly notifications: NotificationsService) { }

    @On('my_chat_member')
    async onMemberStatus(@Ctx() ctx: Context) {
        const upd = ctx.myChatMember;
        if (!upd || upd.chat.type !== 'private') return;
        const status = upd.new_chat_member.status;
        if (status === 'kicked') await this.notifications.markBlocked(upd.from.id);
        else if (status === 'member') await this.notifications.markUnblocked(upd.from.id);
    }
}
