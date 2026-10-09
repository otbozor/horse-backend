import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CampaignInput {
    name: string;
    code?: string;
    targetPath?: string;
    isActive?: boolean;
}

/** Havola ochilgan paytdan shu vaqt ichida yaratilgan akkaunt — shu havola orqali kelgan yangi foydalanuvchi */
const NEW_USER_WINDOW_MS = 10 * 60 * 1000;

const slug = (s: string) =>
    s
        .toLowerCase()
        .replace(/[ʻʼ'`]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24);

/**
 * Video/reklama havolalari: t.me/<bot>/app?startapp=ad_<code>.
 * Kim ochdi, kim yangi ro'yxatdan o'tdi va ulardan kim e'lon joyladi — admin hisobotida.
 */
@Injectable()
export class CampaignsService {
    constructor(private readonly prisma: PrismaService) { }

    /** Mini App havolani ochganda: tashrifni yozadi va ochiladigan sahifani qaytaradi */
    async open(code: string, userId: string) {
        const campaign = await this.prisma.campaign.findUnique({ where: { code } });
        if (!campaign || !campaign.isActive) return { targetPath: '/' };

        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true, campaignId: true } });
        if (!user) return { targetPath: campaign.targetPath };

        // Manba akkaunt yaratilayotganda (start_param orqali) yoziladi — bu yerda faqat tashrif
        const isNewUser = user.campaignId === campaign.id && Date.now() - user.createdAt.getTime() < NEW_USER_WINDOW_MS;
        const already = isNewUser
            ? await this.prisma.campaignVisit.count({ where: { campaignId: campaign.id, userId, isNewUser: true } })
            : 0;
        await this.prisma.campaignVisit.create({
            data: { campaignId: campaign.id, userId, isNewUser: isNewUser && !already },
        });
        return { targetPath: campaign.targetPath };
    }

    async create(input: CampaignInput) {
        const name = input.name?.trim();
        if (!name || name.length < 2) throw new BadRequestException('Nomini kiriting');
        let code = slug(input.code?.trim() || name) || 'video';
        if (!/^[a-z0-9-]{2,40}$/.test(code)) throw new BadRequestException("Kod faqat lotin harflari, raqam va '-' bo'lishi kerak");
        // Band bo'lsa raqam qo'shamiz
        for (let i = 2; await this.prisma.campaign.findUnique({ where: { code } }); i++) code = `${code.replace(/-\d+$/, '')}-${i}`;
        return this.prisma.campaign.create({ data: { name, code, targetPath: this.cleanPath(input.targetPath) } });
    }

    async update(id: string, input: Partial<CampaignInput>) {
        const exists = await this.prisma.campaign.findUnique({ where: { id } });
        if (!exists) throw new NotFoundException();
        return this.prisma.campaign.update({
            where: { id },
            data: {
                ...(input.name?.trim() ? { name: input.name.trim() } : {}),
                ...(input.targetPath !== undefined ? { targetPath: this.cleanPath(input.targetPath) } : {}),
                ...(typeof input.isActive === 'boolean' ? { isActive: input.isActive } : {}),
            },
        });
    }

    async remove(id: string) {
        await this.prisma.campaign.delete({ where: { id } }).catch(() => {
            throw new NotFoundException();
        });
        return { success: true };
    }

    private cleanPath(p?: string) {
        const v = (p || '/').trim();
        return v.startsWith('/') && v.length <= 120 ? v : '/';
    }

    /** Hisobot: ochishlar, yangi foydalanuvchilar, e'lon joylaganlar, oxirgi 14 kun */
    async list() {
        const campaigns = await this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
        const since = new Date(Date.now() - 13 * 86400000);
        since.setHours(0, 0, 0, 0);

        return Promise.all(
            campaigns.map(async (c) => {
                const [opens, unique, newUsers, posters, listings, approved, phones, daily] = await Promise.all([
                    this.prisma.campaignVisit.count({ where: { campaignId: c.id } }),
                    this.prisma.campaignVisit.findMany({ where: { campaignId: c.id, userId: { not: null } }, distinct: ['userId'], select: { userId: true } }),
                    this.prisma.user.count({ where: { campaignId: c.id } }),
                    this.prisma.user.count({ where: { campaignId: c.id, listings: { some: {} } } }),
                    this.prisma.horseListing.count({ where: { user: { campaignId: c.id } } }),
                    this.prisma.horseListing.count({
                        where: { user: { campaignId: c.id }, status: { in: [ListingStatus.APPROVED, ListingStatus.ARCHIVED] } },
                    }),
                    this.prisma.user.count({ where: { campaignId: c.id, phone: { not: null } } }),
                    this.prisma.campaignVisit.findMany({ where: { campaignId: c.id, createdAt: { gte: since } }, select: { createdAt: true } }),
                ]);
                const days: number[] = Array(14).fill(0);
                for (const v of daily) {
                    const d = Math.floor((v.createdAt.getTime() - since.getTime()) / 86400000);
                    if (d >= 0 && d < 14) days[d]++;
                }
                return {
                    ...c,
                    stats: { opens, uniqueUsers: unique.length, newUsers, posters, listings, approvedListings: approved, phones, daily: days },
                };
            }),
        );
    }
}
