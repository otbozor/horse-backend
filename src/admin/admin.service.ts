import { Injectable, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListingStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
    constructor(private prisma: PrismaService) { }

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

    // All listings with filters (admin)
    async getAdminListings(options?: {
        status?: ListingStatus;
        isPaid?: boolean;
        page?: number;
        limit?: number;
    }) {
        const where: Prisma.HorseListingWhereInput = {};

        if (options?.status) where.status = options.status;
        if (options?.isPaid !== undefined) where.isPaid = options.isPaid;

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
                    region: { select: { nameUz: true } },
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
        });

        // Log action
        await this.createAuditLog(adminUserId, 'listing.approve', 'HorseListing', listingId);

        return listing;
    }

    async rejectListing(listingId: string, adminUserId: string, reason: string) {
        await this.requireAdmin(adminUserId);

        const listing = await this.prisma.horseListing.update({
            where: { id: listingId },
            data: {
                status: ListingStatus.REJECTED,
                rejectReason: reason,
            },
        });

        // Log action
        await this.createAuditLog(adminUserId, 'listing.reject', 'HorseListing', listingId, { reason });

        return listing;
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
