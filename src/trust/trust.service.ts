import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, PriceOfferStatus, ReportReason, ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelService } from '../telegram/telegram-channel.service';
import { formatMoney, resolvePriceOffer } from './price-offer-core';

const REASON_LABELS: Record<ReportReason, string> = {
    FRAUD: 'Firibgarlik',
    SOLD: 'Ot sotilgan',
    WRONG_INFO: "Noto'g'ri ma'lumot",
    DUPLICATE: 'Takroriy e\'lon',
    OFFENSIVE: 'Haqoratli kontent',
    OTHER: 'Boshqa',
};

const userPublic = { id: true, displayName: true, avatarUrl: true, isVerified: true } as const;

@Injectable()
export class TrustService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly notifier: TelegramChannelService,
    ) { }

    // =================== Shikoyatlar ===================

    async createReport(reporterId: string, listingId: string, reason: ReportReason, comment?: string) {
        if (!Object.keys(REASON_LABELS).includes(reason)) throw new BadRequestException("Noto'g'ri sabab");
        const listing = await this.prisma.horseListing.findUnique({ where: { id: listingId }, select: { id: true, title: true, userId: true } });
        if (!listing) throw new NotFoundException("E'lon topilmadi");
        if (listing.userId === reporterId) throw new BadRequestException("O'z e'loningizga shikoyat qila olmaysiz");

        const existing = await this.prisma.listingReport.findUnique({ where: { listingId_reporterId: { listingId, reporterId } } });
        if (existing && existing.status === ReportStatus.PENDING) {
            throw new BadRequestException("Shikoyatingiz allaqachon ko'rib chiqilmoqda");
        }
        const text = comment?.trim().slice(0, 500) || null;
        const report = existing
            ? await this.prisma.listingReport.update({
                where: { id: existing.id },
                data: { reason, comment: text, status: ReportStatus.PENDING, resolvedAt: null, createdAt: new Date() },
            })
            : await this.prisma.listingReport.create({ data: { listingId, reporterId, reason, comment: text } });

        const reporter = await this.prisma.user.findUnique({ where: { id: reporterId }, select: { displayName: true } });
        this.notifier
            .notifyAdminReport({
                listingId,
                listingTitle: listing.title,
                reason: REASON_LABELS[reason],
                comment: text,
                reporterName: reporter?.displayName ?? '—',
            })
            .catch(() => { });
        return report;
    }

    async getReports(status: ReportStatus = ReportStatus.PENDING) {
        return this.prisma.listingReport.findMany({
            where: { status },
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: {
                reporter: { select: userPublic },
                listing: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        priceAmount: true,
                        priceCurrency: true,
                        user: { select: userPublic },
                        media: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true, thumbUrl: true } },
                        _count: { select: { reports: true } },
                    },
                },
            },
        });
    }

    async resolveReport(reportId: string, action: 'dismiss' | 'resolve' | 'archive') {
        const report = await this.prisma.listingReport.findUnique({ where: { id: reportId } });
        if (!report) throw new NotFoundException('Shikoyat topilmadi');
        const status = action === 'dismiss' ? ReportStatus.DISMISSED : ReportStatus.RESOLVED;
        if (action === 'archive') {
            await this.prisma.horseListing.update({ where: { id: report.listingId }, data: { status: ListingStatus.ARCHIVED } });
            // Shu e'londagi barcha ochiq shikoyatlar ham yopiladi
            await this.prisma.listingReport.updateMany({
                where: { listingId: report.listingId, status: ReportStatus.PENDING },
                data: { status: ReportStatus.RESOLVED, resolvedAt: new Date() },
            });
            return { success: true };
        }
        await this.prisma.listingReport.update({ where: { id: reportId }, data: { status, resolvedAt: new Date() } });
        return { success: true };
    }

    // =================== Sharhlar ===================

    async getSellerReviews(sellerId: string) {
        const [reviews, agg] = await Promise.all([
            this.prisma.sellerReview.findMany({
                where: { sellerId },
                orderBy: { createdAt: 'desc' },
                take: 100,
                include: {
                    reviewer: { select: userPublic },
                    listing: { select: { id: true, title: true } },
                },
            }),
            this.prisma.sellerReview.aggregate({ where: { sellerId }, _avg: { stars: true }, _count: true }),
        ]);
        const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: reviews.filter((r) => r.stars === stars).length }));
        return {
            summary: { average: agg._avg.stars ? Math.round(agg._avg.stars * 10) / 10 : 0, count: agg._count, distribution },
            reviews,
        };
    }

    async getRatingSummary(sellerId: string) {
        const agg = await this.prisma.sellerReview.aggregate({ where: { sellerId }, _avg: { stars: true }, _count: true });
        return { average: agg._avg.stars ? Math.round(agg._avg.stars * 10) / 10 : 0, count: agg._count };
    }

    async upsertReview(reviewerId: string, sellerId: string, stars: number, comment?: string, listingId?: string) {
        if (reviewerId === sellerId) throw new BadRequestException("O'zingizga baho qo'ya olmaysiz");
        const s = Math.round(Number(stars));
        if (!(s >= 1 && s <= 5)) throw new BadRequestException("Baho 1 dan 5 gacha bo'lishi kerak");
        const seller = await this.prisma.user.findUnique({ where: { id: sellerId }, select: { id: true, telegramUserId: true } });
        if (!seller) throw new NotFoundException('Sotuvchi topilmadi');
        if (listingId) {
            const l = await this.prisma.horseListing.findUnique({ where: { id: listingId }, select: { userId: true } });
            if (!l || l.userId !== sellerId) listingId = undefined;
        }
        const text = comment?.trim().slice(0, 1000) || null;
        const existing = await this.prisma.sellerReview.findUnique({ where: { sellerId_reviewerId: { sellerId, reviewerId } } });
        const review = await this.prisma.sellerReview.upsert({
            where: { sellerId_reviewerId: { sellerId, reviewerId } },
            create: { sellerId, reviewerId, stars: s, comment: text, listingId },
            update: { stars: s, comment: text, ...(listingId ? { listingId } : {}) },
        });
        if (!existing && seller.telegramUserId) {
            const reviewer = await this.prisma.user.findUnique({ where: { id: reviewerId }, select: { displayName: true } });
            this.notifier
                .notifyNewReview(seller.telegramUserId.toString(), sellerId, s, reviewer?.displayName ?? '—', text)
                .catch(() => { });
        }
        return review;
    }

    async replyToReview(reviewId: string, sellerId: string, reply: string) {
        const review = await this.prisma.sellerReview.findUnique({ where: { id: reviewId } });
        if (!review) throw new NotFoundException('Sharh topilmadi');
        if (review.sellerId !== sellerId) throw new ForbiddenException('Faqat sotuvchi javob yoza oladi');
        const text = reply?.trim().slice(0, 1000);
        return this.prisma.sellerReview.update({
            where: { id: reviewId },
            data: { sellerReply: text || null, sellerRepliedAt: text ? new Date() : null },
        });
    }

    async deleteReview(reviewId: string, userId: string, isAdmin: boolean) {
        const review = await this.prisma.sellerReview.findUnique({ where: { id: reviewId } });
        if (!review) throw new NotFoundException('Sharh topilmadi');
        if (review.reviewerId !== userId && !isAdmin) throw new ForbiddenException("Faqat muallif yoki admin o'chira oladi");
        await this.prisma.sellerReview.delete({ where: { id: reviewId } });
        return { success: true };
    }

    // =================== Narx takliflari ===================

    async createOffer(buyerId: string, listingId: string, amount: number, message?: string) {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id: listingId },
            include: { user: { select: { id: true, telegramUserId: true } } },
        });
        if (!listing || listing.status !== ListingStatus.APPROVED) throw new NotFoundException("E'lon topilmadi");
        if (listing.userId === buyerId) throw new ForbiddenException("O'z e'loningizga taklif bera olmaysiz");
        const price = Number(listing.priceAmount);
        const value = Math.round(Number(amount));
        if (!(value > 0)) throw new BadRequestException("Taklif summasini kiriting");
        if (price > 0 && value >= price) throw new BadRequestException("Taklif e'lon narxidan past bo'lishi kerak");
        if (price > 0 && value < price * 0.3) throw new BadRequestException("Taklif juda past — narxning kamida 30% bo'lsin");

        // Har bir xaridorda bitta faol taklif: eskisi bekor qilinadi
        await this.prisma.priceOffer.updateMany({
            where: { listingId, buyerId, status: PriceOfferStatus.PENDING },
            data: { status: PriceOfferStatus.CANCELLED, respondedAt: new Date() },
        });
        const offer = await this.prisma.priceOffer.create({
            data: { listingId, buyerId, amount: value, currency: listing.priceCurrency, message: message?.trim().slice(0, 300) || null },
        });

        if (listing.user.telegramUserId) {
            const buyer = await this.prisma.user.findUnique({ where: { id: buyerId }, select: { displayName: true } });
            this.notifier
                .notifyPriceOffer(
                    listing.user.telegramUserId.toString(),
                    { id: offer.id, amount: formatMoney(value, listing.priceCurrency), message: offer.message },
                    { id: listing.id, title: listing.title, price: formatMoney(listing.priceAmount, listing.priceCurrency) },
                    buyer?.displayName ?? 'Xaridor',
                )
                .catch(() => { });
        }
        return { ...offer, amount: Number(offer.amount) };
    }

    async getMyOfferForListing(buyerId: string, listingId: string) {
        const offer = await this.prisma.priceOffer.findFirst({
            where: { listingId, buyerId, status: { not: PriceOfferStatus.CANCELLED } },
            orderBy: { createdAt: 'desc' },
        });
        return offer ? { ...offer, amount: Number(offer.amount) } : null;
    }

    async getListingOffers(listingId: string, userId: string, isAdmin: boolean) {
        const listing = await this.prisma.horseListing.findUnique({ where: { id: listingId }, select: { userId: true } });
        if (!listing) throw new NotFoundException("E'lon topilmadi");
        if (listing.userId !== userId && !isAdmin) throw new ForbiddenException("Bu sizning e'loningiz emas");
        const offers = await this.prisma.priceOffer.findMany({
            where: { listingId, status: { not: PriceOfferStatus.CANCELLED } },
            orderBy: { createdAt: 'desc' },
            include: { buyer: { select: { ...userPublic, telegramUsername: true } } },
        });
        return offers.map((o) => ({ ...o, amount: Number(o.amount) }));
    }

    async getMyOffers(userId: string, direction: 'sent' | 'received') {
        const where =
            direction === 'sent'
                ? { buyerId: userId, status: { not: PriceOfferStatus.CANCELLED } }
                : { listing: { userId }, status: { not: PriceOfferStatus.CANCELLED } };
        const offers = await this.prisma.priceOffer.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 100,
            include: {
                buyer: { select: { ...userPublic, telegramUsername: true } },
                listing: {
                    select: {
                        id: true,
                        title: true,
                        priceAmount: true,
                        priceCurrency: true,
                        status: true,
                        media: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true, thumbUrl: true } },
                    },
                },
            },
        });
        return offers.map((o) => ({ ...o, amount: Number(o.amount) }));
    }

    resolveOffer(offerId: string, userId: string, isAdmin: boolean, accept: boolean) {
        return resolvePriceOffer(this.prisma, this.notifier, offerId, { userId, isAdmin }, accept);
    }

    async cancelOffer(offerId: string, buyerId: string) {
        const offer = await this.prisma.priceOffer.findUnique({ where: { id: offerId } });
        if (!offer || offer.buyerId !== buyerId) throw new NotFoundException('Taklif topilmadi');
        if (offer.status !== PriceOfferStatus.PENDING) throw new BadRequestException("Taklifni bekor qilib bo'lmaydi");
        await this.prisma.priceOffer.update({ where: { id: offerId }, data: { status: PriceOfferStatus.CANCELLED, respondedAt: new Date() } });
        return { success: true };
    }

    // =================== Narx tarixi ===================

    async getPriceHistory(listingId: string) {
        const rows = await this.prisma.priceHistory.findMany({ where: { listingId }, orderBy: { createdAt: 'asc' } });
        return rows.map((r) => ({ ...r, oldPrice: Number(r.oldPrice), newPrice: Number(r.newPrice) }));
    }

    /** Faol e'lon narxini moderatsiyasiz o'zgartirish (faqat narx - xavfsiz maydon) */
    async changePrice(userId: string, listingId: string, newPrice: number, isAdmin: boolean) {
        const listing = await this.prisma.horseListing.findUnique({ where: { id: listingId } });
        if (!listing) throw new NotFoundException("E'lon topilmadi");
        if (listing.userId !== userId && !isAdmin) throw new ForbiddenException("Bu sizning e'loningiz emas");
        const value = Math.round(Number(newPrice));
        if (!(value > 0)) throw new BadRequestException("Narxni kiriting");
        const old = Number(listing.priceAmount);
        if (value === old) return listing;
        await this.prisma.$transaction([
            this.prisma.priceHistory.create({ data: { listingId, oldPrice: old, newPrice: value, currency: listing.priceCurrency } }),
            this.prisma.horseListing.update({
                where: { id: listingId },
                // Narx tushsa eski narx kartochkada chizilgan holda ko'rinadi
                data: { priceAmount: value, previousPrice: value < old ? old : null },
            }),
        ]);
        return this.prisma.horseListing.findUnique({ where: { id: listingId } });
    }
}
