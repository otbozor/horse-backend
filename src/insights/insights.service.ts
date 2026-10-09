import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContactType, Currency, ListingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ViewDedupe } from '../common/viewer.util';

const DAY = 86400000;
const STATS_DAYS = 14;

function percentile(sorted: number[], p: number): number {
    if (!sorted.length) return 0;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
}

/** Toshkent vaqti bo'yicha kun kaliti: 2026-10-09 */
function tashkentDay(d: Date): string {
    return new Date(d.getTime() + 5 * 3600000).toISOString().slice(0, 10);
}

@Injectable()
export class InsightsService {
    private readonly contactDedupe = new ViewDedupe(6 * 3600000);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Bozor narxi: shu zot (va yaqin yosh) bo'yicha oxirgi bir yildagi e'lonlar narxining
     * 25–75 foizlik oralig'i. Kamida 3 ta namuna bo'lmasa — null.
     */
    async priceInsight(q: { breedId?: string; ageYears?: number; currency?: Currency; excludeId?: string }) {
        if (!q.breedId) return null;
        const currency = q.currency ?? Currency.UZS;
        const base: Prisma.HorseListingWhereInput = {
            breedId: q.breedId,
            priceCurrency: currency,
            priceAmount: { gt: 0 },
            status: { in: [ListingStatus.APPROVED, ListingStatus.ARCHIVED, ListingStatus.EXPIRED] },
            publishedAt: { gte: new Date(Date.now() - 365 * DAY) },
            ...(q.excludeId ? { id: { not: q.excludeId } } : {}),
        };
        const load = (where: Prisma.HorseListingWhereInput) =>
            this.prisma.horseListing.findMany({ where, select: { priceAmount: true }, take: 500, orderBy: { publishedAt: 'desc' } });

        let rows = q.ageYears != null
            ? await load({ ...base, ageYears: { gte: Math.max(0, q.ageYears - 2), lte: q.ageYears + 2 } })
            : [];
        let byAge = q.ageYears != null;
        if (rows.length < 3) {
            rows = await load(base);
            byAge = false;
        }
        if (rows.length < 3) return { count: rows.length, enough: false };

        const prices = rows.map((r) => Number(r.priceAmount)).sort((a, b) => a - b);
        // Juda chetga chiqqan qiymatlarni (xato kiritilgan narxlar) qisman chetlab o'tish uchun kvartillar ishlatiladi
        return {
            enough: true,
            count: prices.length,
            currency,
            byAge,
            p25: percentile(prices, 0.25),
            median: percentile(prices, 0.5),
            p75: percentile(prices, 0.75),
        };
    }

    async trackContact(listingId: string, type: ContactType, viewerKey: string, userId?: string) {
        const listing = await this.prisma.horseListing.findUnique({ where: { id: listingId }, select: { userId: true, status: true } });
        if (!listing || listing.status !== ListingStatus.APPROVED || listing.userId === userId) return;
        if (!this.contactDedupe.hit(`${listingId}:${type}:${viewerKey}`)) return;
        await this.prisma.listingContact.create({ data: { listingId, type, userId: userId ?? null } });
    }

    /** Sotuvchi uchun e'lon statistikasi: oxirgi 14 kun bo'yicha kunlik ko'rishlar va bog'lanishlar */
    async listingStats(listingId: string, userId: string, isAdmin: boolean) {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id: listingId },
            select: { userId: true, viewCount: true, favoriteCount: true, publishedAt: true, isTop: true, boostExpiresAt: true },
        });
        if (!listing) throw new NotFoundException("E'lon topilmadi");
        if (listing.userId !== userId && !isAdmin) throw new ForbiddenException();

        const since = new Date(Date.now() - STATS_DAYS * DAY);
        const [views, contacts, favorites, offers, contactTotals] = await Promise.all([
            this.prisma.viewLog.findMany({ where: { listingId, createdAt: { gte: since } }, select: { createdAt: true } }),
            this.prisma.listingContact.findMany({ where: { listingId, createdAt: { gte: since } }, select: { createdAt: true } }),
            this.prisma.favorite.findMany({ where: { listingId, createdAt: { gte: since } }, select: { createdAt: true } }),
            this.prisma.priceOffer.count({ where: { listingId } }),
            this.prisma.listingContact.groupBy({ by: ['type'], where: { listingId }, _count: { _all: true } }),
        ]);

        const days: { date: string; views: number; contacts: number; favorites: number }[] = [];
        const index = new Map<string, (typeof days)[number]>();
        for (let i = STATS_DAYS - 1; i >= 0; i--) {
            const d = { date: tashkentDay(new Date(Date.now() - i * DAY)), views: 0, contacts: 0, favorites: 0 };
            days.push(d);
            index.set(d.date, d);
        }
        for (const v of views) { const d = index.get(tashkentDay(v.createdAt)); if (d) d.views++; }
        for (const c of contacts) { const d = index.get(tashkentDay(c.createdAt)); if (d) d.contacts++; }
        for (const f of favorites) { const d = index.get(tashkentDay(f.createdAt)); if (d) d.favorites++; }

        const byType = Object.fromEntries(contactTotals.map((c) => [c.type, c._count._all])) as Partial<Record<ContactType, number>>;
        return {
            totals: {
                views: listing.viewCount,
                favorites: listing.favoriteCount,
                offers,
                phone: byType.PHONE ?? 0,
                telegram: byType.TELEGRAM ?? 0,
                chat: byType.CHAT ?? 0,
            },
            last14: {
                views: views.length,
                contacts: contacts.length,
                favorites: favorites.length,
            },
            days,
            boosted: Boolean(listing.isTop && (!listing.boostExpiresAt || listing.boostExpiresAt > new Date())),
            publishedAt: listing.publishedAt,
        };
    }
}
