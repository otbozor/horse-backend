import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HorseGender, HorsePurpose, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelService } from '../telegram/telegram-channel.service';
import { formatMoney } from '../trust/price-offer-core';

export interface SearchFilters {
    q?: string;
    regionId?: string;
    districtId?: string;
    breedId?: string;
    purpose?: HorsePurpose;
    gender?: HorseGender;
    priceMin?: number;
    priceMax?: number;
    ageMin?: number;
    ageMax?: number;
    hasPassport?: boolean;
    hasVaccine?: boolean;
    hasVideo?: boolean;
}

const MAX_SEARCHES_PER_USER = 10;
const FILTER_KEYS: (keyof SearchFilters)[] = [
    'q', 'regionId', 'districtId', 'breedId', 'purpose', 'gender',
    'priceMin', 'priceMax', 'ageMin', 'ageMax', 'hasPassport', 'hasVaccine', 'hasVideo',
];

type ListingForMatch = Prisma.HorseListingGetPayload<{
    include: { breed: { select: { name: true } }; region: { select: { nameUz: true } }; district: { select: { nameUz: true } }; media: true };
}>;

@Injectable()
export class SavedSearchService {
    private readonly logger = new Logger(SavedSearchService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notifier: TelegramChannelService,
    ) { }

    /** Faqat ma'lum kalitlarni va bo'sh bo'lmagan qiymatlarni saqlaymiz */
    private clean(filters: Record<string, unknown>): SearchFilters {
        const out: Record<string, unknown> = {};
        for (const key of FILTER_KEYS) {
            const v = filters?.[key];
            if (v === undefined || v === null || v === '' || v === false) continue;
            out[key] = typeof v === 'string' ? v.trim().slice(0, 100) : v;
        }
        return out as SearchFilters;
    }

    async list(userId: string) {
        return this.prisma.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    }

    async create(userId: string, label: string, filters: Record<string, unknown>) {
        const clean = this.clean(filters);
        if (Object.keys(clean).length === 0) throw new BadRequestException('Kamida bitta filtr tanlang');
        const count = await this.prisma.savedSearch.count({ where: { userId } });
        if (count >= MAX_SEARCHES_PER_USER) throw new BadRequestException(`Ko'pi bilan ${MAX_SEARCHES_PER_USER} ta qidiruv saqlash mumkin`);
        return this.prisma.savedSearch.create({
            data: { userId, label: (label || 'Qidiruv').trim().slice(0, 60), filters: clean as Prisma.InputJsonValue },
        });
    }

    async update(userId: string, id: string, data: { isActive?: boolean; label?: string }) {
        const s = await this.prisma.savedSearch.findUnique({ where: { id } });
        if (!s || s.userId !== userId) throw new NotFoundException('Qidiruv topilmadi');
        return this.prisma.savedSearch.update({
            where: { id },
            data: {
                ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
                ...(data.label ? { label: data.label.trim().slice(0, 60) } : {}),
            },
        });
    }

    async remove(userId: string, id: string) {
        const s = await this.prisma.savedSearch.findUnique({ where: { id } });
        if (!s || s.userId !== userId) throw new NotFoundException('Qidiruv topilmadi');
        await this.prisma.savedSearch.delete({ where: { id } });
        return { success: true };
    }

    /** E'lon saqlangan qidiruv filtrlariga mos keladimi (saytdagi /listings filtri bilan bir xil mantiq) */
    matches(f: SearchFilters, l: ListingForMatch): boolean {
        if (f.regionId && l.regionId !== f.regionId) return false;
        if (f.districtId && l.districtId !== f.districtId) return false;
        if (f.breedId && l.breedId !== f.breedId) return false;
        if (f.purpose && l.purpose !== f.purpose) return false;
        if (f.gender && l.gender !== f.gender) return false;
        const price = Number(l.priceAmount);
        if (f.priceMin && price < Number(f.priceMin)) return false;
        if (f.priceMax && price > Number(f.priceMax)) return false;
        if (f.ageMin && (l.ageYears == null || l.ageYears < Number(f.ageMin))) return false;
        if (f.ageMax && (l.ageYears == null || l.ageYears > Number(f.ageMax))) return false;
        if (f.hasPassport && !l.hasPassport) return false;
        if (f.hasVaccine && !l.hasVaccine) return false;
        if (f.hasVideo && !l.hasVideo) return false;
        if (f.q) {
            const q = f.q.toLowerCase();
            const hay = `${l.title} ${l.description ?? ''} ${l.breed?.name ?? ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    }

    /**
     * Yangi tasdiqlangan e'lon uchun mos saqlangan qidiruvlar egalariga bot
     * xabari yuboradi. Bir foydalanuvchiga bitta e'lon uchun bitta xabar.
     */
    async notifyMatches(listingId: string): Promise<number> {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id: listingId },
            include: {
                breed: { select: { name: true } },
                region: { select: { nameUz: true } },
                district: { select: { nameUz: true } },
                media: { where: { type: 'IMAGE' }, orderBy: { sortOrder: 'asc' }, take: 1 },
            },
        });
        if (!listing || listing.status !== 'APPROVED') return 0;

        const searches = await this.prisma.savedSearch.findMany({
            where: { isActive: true, userId: { not: listing.userId } },
            include: { user: { select: { telegramUserId: true, status: true } } },
        });

        const notifiedUsers = new Set<string>();
        let sent = 0;
        for (const s of searches) {
            if (notifiedUsers.has(s.userId) || !s.user.telegramUserId || s.user.status !== 'ACTIVE') continue;
            if (!this.matches((s.filters ?? {}) as SearchFilters, listing)) continue;
            notifiedUsers.add(s.userId);
            const ok = await this.notifier.notifySavedSearchMatch(s.user.telegramUserId.toString(), s.label, {
                id: listing.id,
                title: listing.title,
                price: formatMoney(listing.priceAmount, listing.priceCurrency),
                place: [listing.region?.nameUz, listing.district?.nameUz].filter(Boolean).join(', ') || null,
                photoUrl: listing.media[0]?.url ?? null,
            });
            await this.prisma.savedSearch.update({
                where: { id: s.id },
                data: { matchCount: { increment: 1 }, ...(ok ? { lastNotifiedAt: new Date() } : {}) },
            });
            if (ok) sent++;
        }
        if (sent) this.logger.log(`🔔 ${sent} ta foydalanuvchiga saqlangan qidiruv xabari: ${listingId}`);
        return sent;
    }
}
