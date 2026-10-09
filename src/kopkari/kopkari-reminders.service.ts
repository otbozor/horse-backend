import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { EventStatus, NotificationCategory, Prisma, RegistrationStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const TZ_OFFSET_MS = 5 * 3600000; // Asia/Tashkent, yozgi vaqt yo'q
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Toshkent bo'yicha bugundan offset kun keyingi sananing [boshi, oxiri) oralig'i (UTC) */
function tashkentDayRange(offsetDays: number): [Date, Date] {
    const local = new Date(Date.now() + TZ_OFFSET_MS);
    const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + offsetDays) - TZ_OFFSET_MS;
    return [new Date(start), new Date(start + 86400000)];
}

function tashkentTime(d: Date) {
    const l = new Date(d.getTime() + TZ_OFFSET_MS);
    return {
        date: `${l.getUTCDate()}-${MONTHS[l.getUTCMonth()]}`,
        time: `${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`,
    };
}

type When = 'tomorrow' | 'today';

/** "Boraman" belgisi va ko'pkari eslatmalari (bir kun oldin 18:00, o'sha kuni 07:00) */
@Injectable()
export class KopkariRemindersService {
    private readonly logger = new Logger(KopkariRemindersService.name);
    private readonly miniAppUrl: string;

    constructor(
        private readonly prisma: PrismaService,
        config: ConfigService,
        @InjectBot() private readonly bot: Telegraf,
        private readonly notifications: NotificationsService,
    ) {
        this.miniAppUrl = (config.get<string>('MINI_APP_URL') || '').replace(/\/$/, '');
    }

    // =================== Boraman ===================

    async goingState(eventId: string, userId?: string) {
        const [count, mine] = await Promise.all([
            this.prisma.eventAttendance.count({ where: { eventId } }),
            userId ? this.prisma.eventAttendance.findUnique({ where: { eventId_userId: { eventId, userId } } }) : null,
        ]);
        return { count, going: Boolean(mine) };
    }

    async setGoing(eventId: string, userId: string, going: boolean) {
        const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { status: true, startsAt: true } });
        if (!event || event.status !== EventStatus.PUBLISHED) throw new NotFoundException('Tadbir topilmadi');
        if (going) {
            if (event.startsAt.getTime() < Date.now() - 12 * 3600000) throw new BadRequestException("Tadbir allaqachon o'tgan");
            await this.prisma.eventAttendance.upsert({
                where: { eventId_userId: { eventId, userId } },
                update: {},
                create: { eventId, userId },
            });
        } else {
            await this.prisma.eventAttendance.deleteMany({ where: { eventId, userId } });
        }
        return this.goingState(eventId, userId);
    }

    // =================== Eslatmalar ===================

    @Cron('0 18 * * *', { timeZone: 'Asia/Tashkent' })
    async remindTomorrow() {
        await this.runReminders('tomorrow');
    }

    @Cron('0 7 * * *', { timeZone: 'Asia/Tashkent' })
    async remindToday() {
        await this.runReminders('today');
    }

    private async runReminders(when: When) {
        const [from, to] = tashkentDayRange(when === 'tomorrow' ? 1 : 0);
        const flag: Prisma.EventWhereInput = when === 'tomorrow' ? { reminderDayBeforeAt: null } : { reminderMorningAt: null };
        const events = await this.prisma.event.findMany({
            where: { status: EventStatus.PUBLISHED, startsAt: { gte: from, lt: to }, ...flag },
            include: { region: { select: { nameUz: true } }, district: { select: { nameUz: true } } },
        });
        for (const event of events) {
            // Avval belgilab qo'yamiz — server qayta ishga tushsa ham ikki marta yuborilmaydi
            await this.prisma.event.update({
                where: { id: event.id },
                data: when === 'tomorrow' ? { reminderDayBeforeAt: new Date() } : { reminderMorningAt: new Date() },
            });
            const chatIds = await this.recipients(event.id);
            let sent = 0;
            for (const chatId of chatIds) {
                try {
                    await this.send(chatId, event, when);
                    sent++;
                } catch {
                    /* botni bloklagan */
                }
                await sleep(40);
            }
            this.logger.log(`🔔 Ko'pkari eslatmasi (${when}) "${event.title}": ${sent}/${chatIds.length}`);
        }
    }

    /** Boraman bosganlar + tasdiqlangan ishtirokchilar (takrorsiz) */
    private async recipients(eventId: string): Promise<string[]> {
        const [att, regs] = await Promise.all([
            this.prisma.eventAttendance.findMany({ where: { eventId }, select: { user: { select: { telegramUserId: true, status: true } } } }),
            this.prisma.eventRegistration.findMany({
                where: { eventId, status: RegistrationStatus.APPROVED },
                select: { user: { select: { telegramUserId: true, status: true } } },
            }),
        ]);
        const ids = new Set<string>();
        for (const r of [...att, ...regs]) {
            if (r.user.telegramUserId && r.user.status === 'ACTIVE') ids.add(r.user.telegramUserId.toString());
        }
        return [...ids];
    }

    private async send(
        chatId: string,
        event: { slug: string; title: string; startsAt: Date; addressText: string | null; region: { nameUz: string } | null; district: { nameUz: string } | null },
        when: When,
    ) {
        const { date, time } = tashkentTime(event.startsAt);
        const place = [event.region?.nameUz, event.district?.nameUz].filter(Boolean).join(', ');
        const text =
            (when === 'tomorrow' ? `⏰ <b>Ertaga ko'pkari!</b>\n\n` : `🏇 <b>Bugun ko'pkari!</b>\n\n`) +
            `🏆 ${esc(event.title)}\n` +
            `🕒 ${date}, soat ${time}\n` +
            (place ? `📍 ${esc(place)}${event.addressText ? ` — ${esc(event.addressText)}` : ''}\n` : '') +
            `\nOmad tilaymiz!`;
        const ok = await this.notifications.deliver({
            telegramUserId: chatId,
            category: NotificationCategory.KOPKARI,
            title: `${when === 'tomorrow' ? "Ertaga ko'pkari" : "Bugun ko'pkari"}: ${event.title}`,
            html: text,
            link: `/kopkari/${event.slug}`,
            buttonText: '📱 Tadbirni ochish',
        });
        if (!ok) throw new Error('not delivered');
    }

    /** Admin uchun: eslatma qanday ko'rinishini o'ziga yuborib ko'rish */
    async sendTest(eventId: string, adminTelegramId: string | null | undefined) {
        if (!adminTelegramId) throw new BadRequestException('Telegram akkauntingiz ulanmagan');
        const event = await this.prisma.event.findUnique({
            where: { id: eventId },
            include: { region: { select: { nameUz: true } }, district: { select: { nameUz: true } } },
        });
        if (!event) throw new NotFoundException('Tadbir topilmadi');
        try {
            await this.send(adminTelegramId, event, 'tomorrow');
        } catch (e) {
            throw new BadRequestException(`Yuborilmadi: ${(e as Error).message}`);
        }
        const recipients = await this.recipients(eventId);
        return { sent: true, recipients: recipients.length };
    }
}
