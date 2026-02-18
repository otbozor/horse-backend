import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async findById(id: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { id },
        });
    }

    async findByTelegramId(telegramUserId: bigint): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { telegramUserId },
        });
    }

    async create(data: Prisma.UserCreateInput): Promise<User> {
        return this.prisma.user.create({ data });
    }

    async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
        return this.prisma.user.update({
            where: { id },
            data,
        });
    }

    async updateLastLogin(id: string): Promise<void> {
        await this.prisma.user.update({
            where: { id },
            data: { lastLoginAt: new Date() },
        });
    }

    async getPublicProfile(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                isVerified: true,
                telegramUsername: true,
                createdAt: true,
                _count: {
                    select: {
                        listings: {
                            where: { status: 'APPROVED' },
                        },
                    },
                },
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return {
            ...user,
            listingsCount: user._count.listings,
        };
    }

    async getUserWithRoles(id: string) {
        return this.prisma.user.findUnique({
            where: { id },
        });
    }

    async deleteAccount(id: string): Promise<void> {
        await this.prisma.user.delete({ where: { id } });
    }

    async hasPermission(userId: string, permissionKey: string): Promise<boolean> {
        const user = await this.getUserWithRoles(userId);

        if (!user) {
            return false;
        }

        // Only admin users have permissions
        return user.isAdmin;
    }
}
