import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { EventStatus, NotificationCategory, RegistrationStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export interface RegistrationInput {
    riderName: string;
    phone: string;
    horseName?: string;
    horseBreed?: string;
    note?: string;
    showPublicly?: boolean;
}

export interface ResultsInput {
    resultsSummary?: string;
    winners?: { place: number; riderName: string; horseName?: string; prize?: string }[];
    photos?: { url: string }[];
    markCompleted?: boolean;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

@Injectable()
export class KopkariService {
    private readonly miniAppUrl: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        @InjectBot() private readonly bot: Telegraf,
        private readonly notifications: NotificationsService,
    ) {
        this.miniAppUrl = (this.config.get<string>('MINI_APP_URL') || '').replace(/\/$/, '');
    }

    private button(text: string, path: string) {
        return this.miniAppUrl ? { reply_markup: { inline_keyboard: [[{ text, web_app: { url: `${this.miniAppUrl}${path}` } }]] } } : {};
    }

    private approvedCount(eventId: string) {
        return this.prisma.eventRegistration.count({ where: { eventId, status: RegistrationStatus.APPROVED } });
    }

    // =================== Ishtirokchi ===================

    async myRegistration(eventId: string, userId: string) {
        return this.prisma.eventRegistration.findUnique({ where: { eventId_userId: { eventId, userId } } });
    }

    async register(eventId: string, userId: string, dto: RegistrationInput) {
        const event = await this.prisma.event.findUnique({ where: { id: eventId } });
        if (!event || event.status !== EventStatus.PUBLISHED) throw new NotFoundException('Tadbir topilmadi');
        if (!event.registrationOpen) throw new BadRequestException("Bu tadbirga ro'yxatdan o'tish yopiq");
        if (event.startsAt < new Date()) throw new BadRequestException('Tadbir allaqachon boshlangan');
        if (!dto.riderName?.trim() || dto.riderName.trim().length < 3) throw new BadRequestException('Ism-familiyani kiriting');
        if (!dto.phone?.trim() || dto.phone.replace(/\D/g, '').length < 9) throw new BadRequestException('Telefon raqamni kiriting');
        if (event.maxParticipants && (await this.approvedCount(eventId)) >= event.maxParticipants) {
            throw new BadRequestException("Afsuski, ishtirokchilar soni to'lgan");
        }

        const data = {
            riderName: dto.riderName.trim().slice(0, 80),
            phone: dto.phone.trim().slice(0, 30),
            horseName: dto.horseName?.trim().slice(0, 60) || null,
            horseBreed: dto.horseBreed?.trim().slice(0, 60) || null,
            note: dto.note?.trim().slice(0, 300) || null,
            showPublicly: Boolean(dto.showPublicly),
        };
        const existing = await this.myRegistration(eventId, userId);
        if (existing && (existing.status === RegistrationStatus.PENDING || existing.status === RegistrationStatus.APPROVED)) {
            throw new BadRequestException('Siz allaqachon ariza topshirgansiz');
        }
        const reg = existing
            ? await this.prisma.eventRegistration.update({
                where: { id: existing.id },
                data: { ...data, status: RegistrationStatus.PENDING, adminNote: null },
            })
            : await this.prisma.eventRegistration.create({ data: { ...data, eventId, userId } });

        void this.notifications.deliver({
            userId,
            category: NotificationCategory.KOPKARI,
            title: `Ko'pkari arizangiz yuborildi: ${event.title}`,
            html: `📝 <b>Arizangiz yuborildi</b>\n\n🏆 ${esc(event.title)}\n👤 ${esc(data.riderName)}\n\nAdmin ko'rib chiqqach natijani yuboramiz.`,
            link: `/kopkari/${event.slug}`,
            buttonText: '📱 Tadbirni ochish',
        });

        // Adminlarga xabar
        const admins = (this.config.get<string>('TELEGRAM_ADMIN_CHAT_IDS') || '').split(',').map((s) => s.trim()).filter(Boolean);
        for (const chatId of admins) {
            this.bot.telegram
                .sendMessage(
                    chatId,
                    `🏇 <b>Ko'pkariga yangi ariza</b>\n\n🏆 ${esc(event.title)}\n👤 ${esc(data.riderName)}\n📞 ${esc(data.phone)}` +
                    (data.horseName ? `\n🐴 ${esc(data.horseName)}` : ''),
                    { parse_mode: 'HTML', ...this.button("📱 Arizalarni ko'rish", '/admin') },
                )
                .catch(() => { });
        }
        return reg;
    }

    /** Ommaviy ro'yxat: faqat tasdiqlanganlar; rozilik bermaganlar anonim, telefon hech qachon qaytarilmaydi */
    async participants(eventId: string) {
        const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { status: true, maxParticipants: true } });
        if (!event || (event.status !== EventStatus.PUBLISHED && event.status !== EventStatus.COMPLETED)) {
            throw new NotFoundException('Tadbir topilmadi');
        }
        const rows = await this.prisma.eventRegistration.findMany({
            where: { eventId, status: RegistrationStatus.APPROVED },
            orderBy: { createdAt: 'asc' },
            select: { id: true, riderName: true, horseName: true, horseBreed: true, showPublicly: true },
        });
        return {
            total: rows.length,
            maxParticipants: event.maxParticipants,
            items: rows.map((r, i) =>
                r.showPublicly
                    ? { n: i + 1, anonymous: false, riderName: r.riderName, horseName: r.horseName, horseBreed: r.horseBreed }
                    : { n: i + 1, anonymous: true },
            ),
        };
    }

    async cancel(eventId: string, userId: string) {
        const reg = await this.myRegistration(eventId, userId);
        if (!reg || reg.status === RegistrationStatus.CANCELLED) throw new NotFoundException('Ariza topilmadi');
        await this.prisma.eventRegistration.update({ where: { id: reg.id }, data: { status: RegistrationStatus.CANCELLED } });
        return { success: true };
    }

    // =================== Admin ===================

    async list(eventId: string) {
        const [rows, approved, event] = await Promise.all([
            this.prisma.eventRegistration.findMany({
                where: { eventId, status: { not: RegistrationStatus.CANCELLED } },
                orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
                include: { user: { select: { displayName: true, telegramUsername: true } } },
            }),
            this.approvedCount(eventId),
            this.prisma.event.findUnique({ where: { id: eventId }, select: { maxParticipants: true, registrationOpen: true } }),
        ]);
        return { registrations: rows, approved, maxParticipants: event?.maxParticipants ?? null, registrationOpen: event?.registrationOpen ?? false };
    }

    async decide(registrationId: string, approve: boolean, adminNote?: string) {
        const reg = await this.prisma.eventRegistration.findUnique({
            where: { id: registrationId },
            include: { event: true, user: { select: { telegramUserId: true } } },
        });
        if (!reg) throw new NotFoundException('Ariza topilmadi');
        if (approve && reg.event.maxParticipants && reg.status !== RegistrationStatus.APPROVED) {
            if ((await this.approvedCount(reg.eventId)) >= reg.event.maxParticipants) {
                throw new BadRequestException("Ishtirokchilar limiti to'lgan");
            }
        }
        const updated = await this.prisma.eventRegistration.update({
            where: { id: registrationId },
            data: { status: approve ? RegistrationStatus.APPROVED : RegistrationStatus.REJECTED, adminNote: adminNote?.trim() || null },
        });
        if (reg.user.telegramUserId) {
            const d = reg.event.startsAt;
            const when = `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
            const text = approve
                ? `✅ <b>Arizangiz qabul qilindi!</b>\n\n🏆 ${esc(reg.event.title)}\n📅 ${when}\n\nTadbirda omad tilaymiz! 🏇`
                : `❌ <b>Arizangiz rad etildi</b>\n\n🏆 ${esc(reg.event.title)}` + (adminNote ? `\n📝 ${esc(adminNote)}` : '');
            void this.notifications.deliver({
                userId: reg.userId,
                category: NotificationCategory.KOPKARI,
                title: approve ? `Ko'pkari arizangiz qabul qilindi: ${reg.event.title}` : `Ko'pkari arizangiz rad etildi: ${reg.event.title}`,
                html: text,
                link: `/kopkari/${reg.event.slug}`,
                buttonText: '📱 Tadbirni ochish',
            });
        }
        return updated;
    }

    /** Tasdiqlangan ishtirokchilar ro'yxatini CSV fayl qilib adminning Telegram'iga yuboradi */
    async exportToAdmin(eventId: string, adminId: string) {
        const admin = await this.prisma.user.findUnique({ where: { id: adminId }, select: { telegramUserId: true } });
        if (!admin?.telegramUserId) throw new ForbiddenException('Telegram akkauntingiz ulanmagan');
        const event = await this.prisma.event.findUnique({ where: { id: eventId } });
        if (!event) throw new NotFoundException('Tadbir topilmadi');
        const rows = await this.prisma.eventRegistration.findMany({
            where: { eventId, status: RegistrationStatus.APPROVED },
            orderBy: { createdAt: 'asc' },
        });
        const lines = [
            ['#', 'Chavandoz', 'Telefon', 'Ot', 'Zoti', 'Izoh', 'Ariza sanasi'].map(csvCell).join(','),
            ...rows.map((r, i) =>
                [i + 1, r.riderName, r.phone, r.horseName, r.horseBreed, r.note, r.createdAt.toISOString().slice(0, 10)].map(csvCell).join(','),
            ),
        ];
        // Excel o'zbekcha harflarni to'g'ri ochishi uchun UTF-8 BOM
        const buffer = Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
        try {
            await this.bot.telegram.sendDocument(
                admin.telegramUserId.toString(),
                { source: buffer, filename: `${event.slug}-ishtirokchilar.csv` },
                { caption: `🏆 ${event.title}\n✅ ${rows.length} ta tasdiqlangan ishtirokchi` },
            );
        } catch {
            throw new BadRequestException("Faylni botga yuborib bo'lmadi. Botga /start yozib, qayta urinib ko'ring");
        }
        return { sent: rows.length };
    }

    async saveResults(eventId: string, dto: ResultsInput) {
        const event = await this.prisma.event.findUnique({ where: { id: eventId } });
        if (!event) throw new NotFoundException('Tadbir topilmadi');
        const winners = (dto.winners ?? [])
            .filter((w) => w.riderName?.trim())
            .slice(0, 20)
            .map((w) => ({
                eventId,
                place: Math.max(1, Math.round(Number(w.place) || 1)),
                riderName: w.riderName.trim().slice(0, 80),
                horseName: w.horseName?.trim().slice(0, 60) || null,
                prize: w.prize?.trim().slice(0, 80) || null,
            }));
        await this.prisma.$transaction([
            this.prisma.eventWinner.deleteMany({ where: { eventId } }),
            this.prisma.eventWinner.createMany({ data: winners }),
            ...(dto.photos
                ? [
                    this.prisma.eventPhoto.deleteMany({ where: { eventId } }),
                    this.prisma.eventPhoto.createMany({ data: dto.photos.slice(0, 20).map((p, i) => ({ eventId, url: p.url, sortOrder: i })) }),
                ]
                : []),
            this.prisma.event.update({
                where: { id: eventId },
                data: {
                    resultsSummary: dto.resultsSummary?.trim().slice(0, 3000) || null,
                    ...(dto.markCompleted ? { status: EventStatus.COMPLETED, registrationOpen: false } : {}),
                },
            }),
        ]);
        return this.prisma.event.findUnique({
            where: { id: eventId },
            include: { winners: { orderBy: { place: 'asc' } }, photos: { orderBy: { sortOrder: 'asc' } } },
        });
    }
}
