import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { BroadcastStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type Audience = 'ALL' | 'SELLERS' | 'BUYERS' | 'ADMINS';

export interface BroadcastInput {
    text: string;
    imageUrl?: string;
    buttonText?: string;
    buttonPath?: string;
    audience?: Audience;
    testOnly?: boolean;
}

export interface BannerInput {
    title: string;
    subtitle?: string;
    imageUrl?: string;
    link?: string;
    bgColor?: string;
    isActive?: boolean;
    sortOrder?: number;
    startsAt?: string | null;
    endsAt?: string | null;
}

// Telegram limiti ~30 xabar/soniya; zaxira bilan 20/soniya
const SEND_DELAY_MS = 50;

@Injectable()
export class GrowthService {
    private readonly logger = new Logger(GrowthService.name);
    private readonly miniAppUrl: string;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        @InjectBot() private readonly bot: Telegraf,
    ) {
        this.miniAppUrl = (this.config.get<string>('MINI_APP_URL') || '').replace(/\/$/, '');
    }

    // =================== Ommaviy xabar ===================

    private audienceWhere(audience: Audience): Prisma.UserWhereInput {
        const base: Prisma.UserWhereInput = { telegramUserId: { not: null }, status: 'ACTIVE' };
        if (audience === 'SELLERS') return { ...base, listings: { some: {} } };
        if (audience === 'BUYERS') return { ...base, listings: { none: {} } };
        if (audience === 'ADMINS') return { ...base, isAdmin: true };
        return base;
    }

    async audienceCounts() {
        const [all, sellers, buyers, admins] = await Promise.all(
            (['ALL', 'SELLERS', 'BUYERS', 'ADMINS'] as Audience[]).map((a) => this.prisma.user.count({ where: this.audienceWhere(a) })),
        );
        return { ALL: all, SELLERS: sellers, BUYERS: buyers, ADMINS: admins };
    }

    private async sendOne(chatId: string, input: BroadcastInput) {
        const extra: any = { parse_mode: 'HTML' };
        if (input.buttonText && input.buttonPath && this.miniAppUrl) {
            const path = input.buttonPath.startsWith('/') ? input.buttonPath : `/${input.buttonPath}`;
            extra.reply_markup = { inline_keyboard: [[{ text: input.buttonText, web_app: { url: `${this.miniAppUrl}${path}` } }]] };
        }
        if (input.imageUrl) await this.bot.telegram.sendPhoto(chatId, input.imageUrl, { caption: input.text, ...extra });
        else await this.bot.telegram.sendMessage(chatId, input.text, extra);
    }

    async broadcast(adminId: string, input: BroadcastInput) {
        const text = input.text?.trim();
        if (!text) throw new BadRequestException('Xabar matnini kiriting');
        if (text.length > (input.imageUrl ? 1000 : 4000)) throw new BadRequestException('Xabar juda uzun');
        const payload = { ...input, text };

        // Avval faqat adminning o'ziga sinov uchun
        if (input.testOnly) {
            const admin = await this.prisma.user.findUnique({ where: { id: adminId }, select: { telegramUserId: true } });
            if (!admin?.telegramUserId) throw new BadRequestException('Sizning Telegram akkauntingiz ulanmagan');
            try {
                await this.sendOne(admin.telegramUserId.toString(), payload);
            } catch (e) {
                throw new BadRequestException(`Yuborilmadi: ${e.message}`);
            }
            return { test: true };
        }

        const audience = input.audience ?? 'ALL';
        const users = await this.prisma.user.findMany({ where: this.audienceWhere(audience), select: { telegramUserId: true } });
        const record = await this.prisma.broadcast.create({
            data: {
                text,
                imageUrl: input.imageUrl || null,
                buttonText: input.buttonText || null,
                buttonPath: input.buttonPath || null,
                audience,
                total: users.length,
                createdById: adminId,
            },
        });

        // Fonda yuboriladi - so'rov darhol qaytadi, admin progressni ko'radi
        void this.runBroadcast(record.id, users.map((u) => u.telegramUserId!.toString()), payload);
        return record;
    }

    private async runBroadcast(id: string, chatIds: string[], input: BroadcastInput) {
        let sent = 0;
        let failed = 0;
        for (let i = 0; i < chatIds.length; i++) {
            try {
                await this.sendOne(chatIds[i], input);
                sent++;
            } catch (e) {
                failed++;
                // 429 bo'lsa Telegram aytgan vaqtcha kutamiz va qayta urinamiz
                const retry = e?.response?.parameters?.retry_after;
                if (retry) {
                    await new Promise((r) => setTimeout(r, (retry + 1) * 1000));
                    try {
                        await this.sendOne(chatIds[i], input);
                        sent++;
                        failed--;
                    } catch {
                        // botni bloklagan foydalanuvchi va h.k.
                    }
                }
            }
            if ((i + 1) % 25 === 0) {
                await this.prisma.broadcast.update({ where: { id }, data: { sent, failed } }).catch(() => { });
            }
            await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
        }
        await this.prisma.broadcast.update({
            where: { id },
            data: { sent, failed, status: BroadcastStatus.DONE, finishedAt: new Date() },
        });
        this.logger.log(`📣 Broadcast ${id}: ${sent} yuborildi, ${failed} xato`);
    }

    async broadcastHistory() {
        return this.prisma.broadcast.findMany({
            orderBy: { createdAt: 'desc' },
            take: 30,
            include: { createdBy: { select: { displayName: true } } },
        });
    }

    // =================== Bannerlar ===================

    async activeBanners() {
        const now = new Date();
        return this.prisma.banner.findMany({
            where: {
                isActive: true,
                AND: [
                    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                    { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
                ],
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
            take: 10,
        });
    }

    async allBanners() {
        return this.prisma.banner.findMany({ orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] });
    }

    private bannerData(dto: BannerInput) {
        if (!dto.title?.trim()) throw new BadRequestException('Sarlavha kiriting');
        return {
            title: dto.title.trim().slice(0, 80),
            subtitle: dto.subtitle?.trim().slice(0, 160) || null,
            imageUrl: dto.imageUrl || null,
            link: dto.link?.trim() || null,
            bgColor: dto.bgColor || null,
            isActive: dto.isActive ?? true,
            sortOrder: dto.sortOrder ?? 0,
            startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
            endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        };
    }

    createBanner(dto: BannerInput) {
        return this.prisma.banner.create({ data: this.bannerData(dto) });
    }

    async updateBanner(id: string, dto: BannerInput) {
        const b = await this.prisma.banner.findUnique({ where: { id } });
        if (!b) throw new NotFoundException('Banner topilmadi');
        return this.prisma.banner.update({ where: { id }, data: this.bannerData(dto) });
    }

    async deleteBanner(id: string) {
        await this.prisma.banner.delete({ where: { id } });
        return { success: true };
    }

    async bannerClick(id: string) {
        await this.prisma.banner.updateMany({ where: { id }, data: { clicks: { increment: 1 } } });
    }

    // =================== Referal ===================

    async referralConfig() {
        const rows = await this.prisma.appSetting.findMany({
            where: { key: { in: ['referral_enabled', 'referral_reward_inviter', 'referral_reward_invitee'] } },
        });
        const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
        return {
            enabled: m['referral_enabled'] !== 'false',
            inviterReward: m['referral_reward_inviter'] != null ? Number(m['referral_reward_inviter']) : 1,
            inviteeReward: m['referral_reward_invitee'] != null ? Number(m['referral_reward_invitee']) : 1,
        };
    }

    async myReferral(userId: string) {
        const [cfg, invited, rewarded] = await Promise.all([
            this.referralConfig(),
            this.prisma.user.count({ where: { referredById: userId } }),
            this.prisma.user.count({ where: { referredById: userId, referralRewardedAt: { not: null } } }),
        ]);
        return { ...cfg, param: `ref_${userId}`, invited, rewarded, earned: rewarded * cfg.inviterReward };
    }

    async topReferrers() {
        const rows = await this.prisma.user.groupBy({
            by: ['referredById'],
            where: { referredById: { not: null } },
            _count: true,
            orderBy: { _count: { referredById: 'desc' } },
            take: 10,
        });
        const users = await this.prisma.user.findMany({
            where: { id: { in: rows.map((r) => r.referredById!) } },
            select: { id: true, displayName: true },
        });
        return rows.map((r) => ({ user: users.find((u) => u.id === r.referredById), count: r._count }));
    }

    /**
     * Taklif qilingan foydalanuvchining birinchi e'loni tasdiqlanganda
     * ikkala tomonga mukofot (e'lon limiti). Faqat bir marta.
     */
    async rewardReferralIfEligible(inviteeId: string) {
        const invitee = await this.prisma.user.findUnique({
            where: { id: inviteeId },
            select: { id: true, referredById: true, referralRewardedAt: true, telegramUserId: true, displayName: true },
        });
        if (!invitee?.referredById || invitee.referralRewardedAt) return;
        const cfg = await this.referralConfig();
        if (!cfg.enabled) return;
        const inviter = await this.prisma.user.findUnique({
            where: { id: invitee.referredById },
            select: { id: true, telegramUserId: true, status: true },
        });
        if (!inviter || inviter.status !== 'ACTIVE') return;

        // Poyga holatidan himoya: faqat referralRewardedAt hali null bo'lsa yangilanadi
        const claimed = await this.prisma.user.updateMany({
            where: { id: invitee.id, referralRewardedAt: null },
            data: { referralRewardedAt: new Date(), listingCredits: { increment: cfg.inviteeReward } },
        });
        if (claimed.count === 0) return;
        await this.prisma.user.update({ where: { id: inviter.id }, data: { listingCredits: { increment: cfg.inviterReward } } });

        const button = this.miniAppUrl ? { reply_markup: { inline_keyboard: [[{ text: '📱 Otbozorni ochish', web_app: { url: `${this.miniAppUrl}/profile` } }]] } } : {};
        if (inviter.telegramUserId && cfg.inviterReward > 0) {
            this.bot.telegram
                .sendMessage(
                    inviter.telegramUserId.toString(),
                    `🎁 Siz taklif qilgan <b>${invitee.displayName}</b> birinchi e'lonini joyladi!\nSizga <b>+${cfg.inviterReward}</b> ta bepul e'lon qo'shildi.`,
                    { parse_mode: 'HTML', ...button },
                )
                .catch(() => { });
        }
        if (invitee.telegramUserId && cfg.inviteeReward > 0) {
            this.bot.telegram
                .sendMessage(invitee.telegramUserId.toString(), `🎁 Taklif bonusi: sizga <b>+${cfg.inviteeReward}</b> ta bepul e'lon qo'shildi!`, {
                    parse_mode: 'HTML',
                    ...button,
                })
                .catch(() => { });
        }
        this.logger.log(`🎁 Referal mukofoti: ${inviter.id} <- ${invitee.id}`);
    }
}
