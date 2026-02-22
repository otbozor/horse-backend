import { Injectable, NotFoundException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ListingStatus, HorseListing } from '@prisma/client';
import slugify from 'slugify';
import { v4 as uuidv4 } from 'uuid';
import { CreateListingDto, UpdateListingDto, ListingsFilterDto } from './dto/listing.dto';

@Injectable()
export class ListingsService {
    constructor(private prisma: PrismaService) { }

    async findAll(filter: ListingsFilterDto) {
        const where: Prisma.HorseListingWhereInput = {
            status: ListingStatus.APPROVED,
        };

        // Apply filters
        if (filter.regionId) where.regionId = filter.regionId;
        if (filter.districtId) where.districtId = filter.districtId;
        if (filter.breedId) where.breedId = filter.breedId;
        if (filter.purpose) where.purpose = filter.purpose;
        if (filter.gender) where.gender = filter.gender;
        if (filter.hasPassport !== undefined) where.hasPassport = filter.hasPassport;
        if (filter.hasVaccine !== undefined) where.hasVaccine = filter.hasVaccine;
        if (filter.hasVideo !== undefined) where.hasVideo = filter.hasVideo;

        // Price range
        if (filter.priceMin || filter.priceMax) {
            where.priceAmount = {};
            if (filter.priceMin) where.priceAmount.gte = filter.priceMin;
            if (filter.priceMax) where.priceAmount.lte = filter.priceMax;
        }

        // Age range
        if (filter.ageMin || filter.ageMax) {
            where.ageYears = {};
            if (filter.ageMin) where.ageYears.gte = filter.ageMin;
            if (filter.ageMax) where.ageYears.lte = filter.ageMax;
        }

        // Text search
        if (filter.q) {
            const searchTerm = filter.q.trim();
            where.OR = [
                { title: { contains: searchTerm, mode: 'insensitive' } },
                { description: { contains: searchTerm, mode: 'insensitive' } },
                { breed: { name: { contains: searchTerm, mode: 'insensitive' } } },
            ];
        }

        // Sorting — paid/top listings always first, then user-selected sort
        const orderBy: Prisma.HorseListingOrderByWithRelationInput[] = [
            { isPaid: 'desc' },
            { isTop: 'desc' },
        ];
        switch (filter.sort) {
            case 'price_asc':
                orderBy.push({ priceAmount: 'asc' });
                break;
            case 'price_desc':
                orderBy.push({ priceAmount: 'desc' });
                break;
            case 'oldest':
                orderBy.push({ publishedAt: 'asc' });
                break;
            case 'views':
                orderBy.push({ viewCount: 'desc' });
                break;
            default:
                orderBy.push({ publishedAt: 'desc' });
        }

        // Pagination
        const page = filter.page || 1;
        const limit = Math.min(filter.limit || 20, 50);
        const skip = (page - 1) * limit;

        const [listings, total] = await Promise.all([
            this.prisma.horseListing.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                include: {
                    region: { select: { nameUz: true, slug: true } },
                    district: { select: { nameUz: true, slug: true } },
                    breed: { select: { name: true, slug: true } },
                    user: { select: { displayName: true, isVerified: true } },
                    media: {
                        select: { url: true, thumbUrl: true, type: true },
                        orderBy: { sortOrder: 'asc' },
                        take: 1,
                    },
                },
            }),
            this.prisma.horseListing.count({ where }),
        ]);

        return {
            data: listings,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findById(id: string) {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id },
            include: {
                region: true,
                district: true,
                breed: true,
                user: {
                    select: {
                        id: true,
                        displayName: true,
                        telegramUsername: true,
                        phone: true,
                        isVerified: true,
                        avatarUrl: true,
                        createdAt: true,
                    },
                },
                media: {
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });

        if (!listing || listing.status !== ListingStatus.APPROVED) {
            throw new NotFoundException('Listing not found');
        }

        return listing;
    }

    async findBySlug(slug: string) {
        const listing = await this.prisma.horseListing.findUnique({
            where: { slug },
            include: {
                region: true,
                district: true,
                breed: true,
                user: {
                    select: {
                        id: true,
                        displayName: true,
                        telegramUsername: true,
                        phone: true,
                        isVerified: true,
                        avatarUrl: true,
                        createdAt: true,
                    },
                },
                media: {
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });

        if (!listing || listing.status !== ListingStatus.APPROVED) {
            throw new NotFoundException('Listing not found');
        }

        return listing;
    }

    async findSimilar(id: string, limit = 6) {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id },
            select: { regionId: true, purpose: true, breedId: true, priceAmount: true },
        });

        if (!listing) {
            return [];
        }

        return this.prisma.horseListing.findMany({
            where: {
                id: { not: id },
                status: ListingStatus.APPROVED,
                OR: [
                    { regionId: listing.regionId },
                    { purpose: listing.purpose },
                    { breedId: listing.breedId },
                ],
            },
            orderBy: { publishedAt: 'desc' },
            take: limit,
            include: {
                region: { select: { nameUz: true } },
                media: {
                    select: { url: true, thumbUrl: true },
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                },
            },
        });
    }

    async incrementViewCount(id: string, userId?: string, sessionId?: string) {
        // Logged-in user: count only once ever (no time limit)
        if (userId) {
            const existing = await this.prisma.viewLog.findFirst({
                where: { listingId: id, userId },
            });
            if (existing) return;
        } else if (sessionId) {
            // Anonymous: count once per 24 hours per session
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const existing = await this.prisma.viewLog.findFirst({
                where: { listingId: id, sessionId, createdAt: { gte: since } },
            });
            if (existing) return;
        }

        // Log view
        await this.prisma.viewLog.create({
            data: {
                listingId: id,
                userId,
                sessionId,
            },
        });

        // Increment counter
        await this.prisma.horseListing.update({
            where: { id },
            data: { viewCount: { increment: 1 } },
        });
    }

    // User's own listings
    async createDraft(userId: string, dto: CreateListingDto): Promise<HorseListing> {
        const baseSlug = slugify(dto.title, { lower: true, strict: true });
        const slug = `${baseSlug}-${uuidv4().substring(0, 8)}`;

        return this.prisma.horseListing.create({
            data: {
                userId,
                title: dto.title,
                slug,
                description: dto.description,
                regionId: dto.regionId,
                districtId: dto.districtId,
                purpose: dto.purpose,
                gender: dto.gender,
                breedId: dto.breedId,
                ageYears: dto.ageYears,
                color: dto.color,
                priceAmount: dto.priceAmount,
                priceCurrency: dto.priceCurrency || 'UZS',
                hasPassport: dto.hasPassport || false,
                hasVaccine: dto.hasVaccine,
                status: ListingStatus.DRAFT,
            },
        });
    }

    async updateDraft(userId: string, id: string, dto: UpdateListingDto): Promise<HorseListing> {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id },
        });

        if (!listing) {
            throw new NotFoundException('Listing not found');
        }

        if (listing.userId !== userId) {
            throw new ForbiddenException('You can only edit your own listings');
        }

        if (listing.status !== ListingStatus.DRAFT && listing.status !== ListingStatus.REJECTED) {
            throw new ForbiddenException('Can only edit draft or rejected listings');
        }

        return this.prisma.horseListing.update({
            where: { id },
            data: {
                ...dto,
                status: ListingStatus.DRAFT, // Reset to draft if editing rejected
            },
        });
    }

    async submitForReview(userId: string, id: string): Promise<HorseListing> {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id },
            include: { media: true },
        });

        if (!listing) {
            throw new NotFoundException('Listing not found');
        }

        if (listing.userId !== userId) {
            throw new ForbiddenException('You can only submit your own listings');
        }

        if (listing.status !== ListingStatus.DRAFT && listing.status !== ListingStatus.REJECTED) {
            throw new ForbiddenException('Listing already submitted');
        }

        // Validate minimum requirements
        if (!listing.title || !listing.regionId || !listing.priceAmount) {
            throw new ForbiddenException('Listing is incomplete');
        }

        if (listing.media.length === 0) {
            throw new ForbiddenException('At least one image is required');
        }

        // Listing credits check
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { listingCredits: true },
        });

        if (!user || user.listingCredits <= 0) {
            throw new HttpException(
                { requiresPayment: true, listingId: id },
                HttpStatus.PAYMENT_REQUIRED,
            );
        }

        // Decrement 1 credit and submit in transaction
        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: userId },
                data: { listingCredits: { decrement: 1 } },
            }),
            this.prisma.horseListing.update({
                where: { id },
                data: {
                    status: ListingStatus.PENDING,
                    hasVideo: listing.media.some((m) => m.type === 'VIDEO'),
                },
            }),
        ]);

        return this.prisma.horseListing.findUnique({ where: { id } }) as Promise<HorseListing>;
    }

    async getMyListingById(userId: string, id: string) {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id },
            include: {
                region: true,
                district: true,
                breed: true,
                media: {
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });

        if (!listing) {
            throw new NotFoundException('Listing not found');
        }

        if (listing.userId !== userId) {
            throw new ForbiddenException('You can only view your own listings');
        }

        return listing;
    }

    async getMyListings(userId: string, status?: ListingStatus) {
        const where: Prisma.HorseListingWhereInput = { userId };
        if (status) where.status = status;

        return this.prisma.horseListing.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            include: {
                region: { select: { nameUz: true } },
                media: {
                    select: { url: true, thumbUrl: true },
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                },
                payments: {
                    where: { status: 'COMPLETED', packageType: { not: null } },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { packageType: true },
                },
            },
        });
    }

    async archiveListing(userId: string, id: string): Promise<void> {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id },
        });

        if (!listing) {
            throw new NotFoundException('Listing not found');
        }

        if (listing.userId !== userId) {
            throw new ForbiddenException('You can only archive your own listings');
        }

        await this.prisma.horseListing.update({
            where: { id },
            data: { status: ListingStatus.ARCHIVED },
        });
    }

    async deleteListing(userId: string, id: string): Promise<void> {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id },
        });

        if (!listing) {
            throw new NotFoundException('Listing not found');
        }

        if (listing.userId !== userId) {
            throw new ForbiddenException('You can only delete your own listings');
        }

        if (listing.status !== ListingStatus.ARCHIVED) {
            throw new ForbiddenException('Faqat nofaol (arxivlangan) e\'lonni o\'chirish mumkin');
        }

        await this.prisma.horseListing.delete({ where: { id } });
    }

    // Favorites
    async addToFavorites(userId: string, listingId: string): Promise<void> {
        await this.prisma.favorite.create({
            data: { userId, listingId },
        });

        await this.prisma.horseListing.update({
            where: { id: listingId },
            data: { favoriteCount: { increment: 1 } },
        });
    }

    async removeFromFavorites(userId: string, listingId: string): Promise<void> {
        await this.prisma.favorite.delete({
            where: { userId_listingId: { userId, listingId } },
        });

        await this.prisma.horseListing.update({
            where: { id: listingId },
            data: { favoriteCount: { decrement: 1 } },
        });
    }

    async getFavorites(userId: string) {
        const favorites = await this.prisma.favorite.findMany({
            where: { userId },
            include: {
                listing: {
                    include: {
                        region: { select: { nameUz: true } },
                        media: {
                            select: { url: true, thumbUrl: true },
                            orderBy: { sortOrder: 'asc' },
                            take: 1,
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return favorites.map((f) => f.listing);
    }

    async isFavorite(userId: string, listingId: string): Promise<boolean> {
        const fav = await this.prisma.favorite.findUnique({
            where: { userId_listingId: { userId, listingId } },
        });
        return !!fav;
    }

    // Featured listings for homepage
    async getFeatured(limit = 12) {
        return this.prisma.horseListing.findMany({
            where: { status: ListingStatus.APPROVED, isPremium: true },
            orderBy: [{ viewCount: 'desc' }, { publishedAt: 'desc' }],
            take: limit,
            include: {
                region: { select: { nameUz: true, slug: true } },
                district: { select: { nameUz: true } },
                breed: { select: { name: true } },
                user: { select: { isVerified: true } },
                media: {
                    select: { url: true, thumbUrl: true, type: true },
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                },
            },
        });
    }
}
