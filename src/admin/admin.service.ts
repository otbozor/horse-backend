import { Injectable, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelService } from '../telegram/telegram-channel.service';
import { ListingStatus, SaleSource, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
    constructor(
        private prisma: PrismaService,
        private telegramNotify: TelegramChannelService,
    ) { }

    // Check if user is admin
    async checkIsAdmin(userId: string): Promise<boolean> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { isAdmin: true },
        });

        return user?.isAdmin ?? false;
    }

    async requireAdmin(userId: string): Promise<void> {
        const isAdmin = await this.checkIsAdmin(userId);
        if (!isAdmin) {
            throw new ForbiddenException('Admin access required');
        }
    }

    // Dashboard stats
    async getDashboardStats() {
        const [
            pendingListings,
            approvedListings,
            totalUsers,
            todayViews,
        ] = await Promise.all([
            this.prisma.horseListing.count({ where: { status: ListingStatus.PENDING } }),
            this.prisma.horseListing.count({ where: { status: ListingStatus.APPROVED } }),
            this.prisma.user.count(),
            this.prisma.viewLog.count({
                where: {
                    createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
                },
            }),
        ]);

        return {
            pendingListings,
            approvedListings,
            totalUsers,
            todayViews,
        };
    }

    // Region stats for dashboard charts
    async getRegionStats() {
        type RegionRow = { region_id: string; count: bigint };

        const [listingRows, productRows] = await Promise.all([
            this.prisma.$queryRaw<RegionRow[]>`
                SELECT region_id, COUNT(*) as count
                FROM horse_listings
                WHERE region_id IS NOT NULL
                GROUP BY region_id
                ORDER BY count DESC
                LIMIT 10
            `,
            this.prisma.$queryRaw<RegionRow[]>`
                SELECT region_id, COUNT(*) as count
                FROM products
                WHERE region_id IS NOT NULL
                GROUP BY region_id
                ORDER BY count DESC
                LIMIT 10
            `,
        ]);

        const regionIds = [
            ...new Set([
                ...listingRows.map(r => r.region_id),
                ...productRows.map(r => r.region_id),
            ]),
        ];

        const regions = regionIds.length > 0
            ? await this.prisma.region.findMany({
                where: { id: { in: regionIds } },
                select: { id: true, nameUz: true },
            })
            : [];

        const regionMap: Record<string, string> = {};
        regions.forEach(r => { regionMap[r.id] = r.nameUz; });

        return {
            listings: listingRows.map(r => ({
                regionId: r.region_id,
                name: regionMap[r.region_id] || r.region_id,
                count: Number(r.count),
            })),
            products: productRows.map(r => ({
                regionId: r.region_id,
                name: regionMap[r.region_id] || r.region_id,
                count: Number(r.count),
            })),
        };
    }

    // All listings with filters (admin)
    async getAdminListings(options?: {
        status?: ListingStatus;
        isPaid?: boolean;
        regionId?: string;
        saleSource?: SaleSource;
        page?: number;
        limit?: number;
    }) {
        const where: Prisma.HorseListingWhereInput = {};

        if (options?.status) where.status = options.status;
        if (options?.isPaid !== undefined) where.isPaid = options.isPaid;
        if (options?.regionId) where.regionId = options.regionId;
        if (options?.saleSource) where.saleSource = options.saleSource;

        const page = options?.page || 1;
        const limit = Math.min(options?.limit || 20, 50);
        const skip = (page - 1) * limit;

        const [listings, total] = await Promise.all([
            this.prisma.horseListing.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    user: { select: { displayName: true, telegramUsername: true } },
                    region: { select: { id: true, nameUz: true } },
                    breed: { select: { name: true } },
                    media: {
                        orderBy: { sortOrder: 'asc' },
                        take: 1,
                    },
                },
            }),
            this.prisma.horseListing.count({ where }),
        ]);

        return {
            data: listings,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    // Moderation queue
    async getPendingListings(page = 1, limit = 20) {
        const skip = (page - 1) * limit;

        const [listings, total] = await Promise.all([
            this.prisma.horseListing.findMany({
                where: { status: ListingStatus.PENDING },
                orderBy: { createdAt: 'asc' },
                skip,
                take: limit,
                include: {
                    user: { select: { displayName: true, telegramUsername: true } },
                    region: { select: { nameUz: true } },
                    media: { take: 1 },
                },
            }),
            this.prisma.horseListing.count({ where: { status: ListingStatus.PENDING } }),
        ]);

        return {
            data: listings,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    async getListingById(listingId: string) {
        const listing = await this.prisma.horseListing.findUnique({
            where: { id: listingId },
            include: {
                region: true,
                district: true,
                breed: true,
                user: {
                    select: {
                        id: true,
                        displayName: true,
                        telegramUsername: true,
                        isVerified: true,
                        avatarUrl: true,
                    },
                },
                media: {
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });

        if (!listing) {
            throw new NotFoundException('Listing not found');
        }

        return listing;
    }

    async approveListing(listingId: string, adminUserId: string) {
        await this.requireAdmin(adminUserId);

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const listing = await this.prisma.horseListing.update({
            where: { id: listingId },
            data: {
                status: ListingStatus.APPROVED,
                publishedAt: now,
                expiresAt,
            },
            include: { user: { select: { telegramUserId: true } } },
        });

        // Log action
        await this.createAuditLog(adminUserId, 'listing.approve', 'HorseListing', listingId);

        // Userage xabar yuborish (fire-and-forget)
        if (listing.user?.telegramUserId) {
            this.telegramNotify.notifyUserListingResult(
                listing.user.telegramUserId.toString(),
                'approved',
                { id: listing.id, title: listing.title },
            ).catch(() => { });
        }

        // Telegram kanalga e'lon yuborish (fire-and-forget)
        const listingForChannel = await this.prisma.horseListing.findUnique({
            where: { id: listingId },
            include: {
                region: { select: { nameUz: true } },
                district: { select: { nameUz: true } },
                breed: { select: { name: true } },
                user: { select: { phone: true } },
                media: {
                    where: { type: 'IMAGE' },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });
        if (listingForChannel) {
            this.telegramNotify.postListingToChannel(listingForChannel).catch(() => { });
        }

        const { user: _user, ...listingData } = listing;
        return listingData;
    }

    async deleteListing(listingId: string, adminUserId: string) {
        await this.requireAdmin(adminUserId);

        const listing = await this.prisma.horseListing.findUnique({
            where: { id: listingId },
            select: { id: true, title: true },
        });

        if (!listing) {
            throw new NotFoundException('Listing not found');
        }

        await this.prisma.horseListing.delete({ where: { id: listingId } });

        await this.createAuditLog(adminUserId, 'listing.delete', 'HorseListing', listingId);

        return { deleted: true };
    }

    async rejectListing(listingId: string, adminUserId: string, reason: string) {
        await this.requireAdmin(adminUserId);

        const listing = await this.prisma.horseListing.update({
            where: { id: listingId },
            data: {
                status: ListingStatus.REJECTED,
                rejectReason: reason,
            },
            include: { user: { select: { telegramUserId: true } } },
        });

        // Log action
        await this.createAuditLog(adminUserId, 'listing.reject', 'HorseListing', listingId, { reason });

        // Userage xabar yuborish (fire-and-forget)
        if (listing.user?.telegramUserId) {
            this.telegramNotify.notifyUserListingResult(
                listing.user.telegramUserId.toString(),
                'rejected',
                { id: listing.id, title: listing.title },
                reason,
            ).catch(() => { });
        }

        const { user: _user, ...listingData } = listing;
        return listingData;
    }

    // Users management
    async getUsers(page = 1, limit = 20, status?: string) {
        const where: Prisma.UserWhereInput = {};
        if (status) where.status = status as any;

        const skip = (page - 1) * limit;

        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    telegramUserId: true,
                    telegramUsername: true,
                    phone: true,
                    username: true,
                    displayName: true,
                    avatarUrl: true,
                    isVerified: true,
                    isAdmin: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    lastLoginAt: true,
                    _count: { select: { listings: true } },
                },
            }),
            this.prisma.user.count({ where }),
        ]);

        // Convert BigInt to string for JSON serialization
        const serializedUsers = users.map(user => ({
            ...user,
            telegramUserId: user.telegramUserId ? user.telegramUserId.toString() : null,
        }));

        return {
            data: serializedUsers,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    async banUser(userId: string, adminUserId: string) {
        await this.requireAdmin(adminUserId);

        await this.prisma.user.update({
            where: { id: userId },
            data: { status: 'BANNED' },
        });

        await this.createAuditLog(adminUserId, 'user.ban', 'User', userId);
    }

    async unbanUser(userId: string, adminUserId: string) {
        await this.requireAdmin(adminUserId);

        await this.prisma.user.update({
            where: { id: userId },
            data: { status: 'ACTIVE' },
        });

        await this.createAuditLog(adminUserId, 'user.unban', 'User', userId);
    }

    // Audit log
    async createAuditLog(
        actorUserId: string,
        action: string,
        entityType: string,
        entityId: string,
        diffJson?: any,
    ) {
        await this.prisma.auditLog.create({
            data: {
                actorUserId,
                action,
                entityType,
                entityId,
                diffJson,
            },
        });
    }

    async getAuditLogs(page = 1, limit = 50) {
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    actor: { select: { displayName: true } },
                },
            }),
            this.prisma.auditLog.count(),
        ]);

        return {
            data: logs,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    // Change admin password
    async changeAdminPassword(userId: string, currentPassword: string, newPassword: string) {
        await this.requireAdmin(userId);

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { password: true },
        });

        if (!user || !user.password) {
            throw new UnauthorizedException('Invalid user');
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Current password is incorrect');
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await this.prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });

        // Log action
        await this.createAuditLog(userId, 'admin.password_changed', 'User', userId);

        return { message: 'Password changed successfully' };
    }
}
