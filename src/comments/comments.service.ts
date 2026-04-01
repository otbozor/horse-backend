import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommentsService {
    constructor(private prisma: PrismaService) { }

    async getComments(listingId: string) {
        return this.prisma.comment.findMany({
            where: { listingId, parentId: null },
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        id: true,
                        displayName: true,
                        avatarUrl: true,
                        isVerified: true,
                    },
                },
                replies: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        user: {
                            select: {
                                id: true,
                                displayName: true,
                                avatarUrl: true,
                                isVerified: true,
                            },
                        },
                    },
                },
            },
        });
    }

    async addComment(userId: string, listingId: string, content: string, parentId?: string) {
        if (!content || content.trim().length === 0) {
            throw new BadRequestException('Komment bo\'sh bo\'lishi mumkin emas');
        }

        if (content.length > 1000) {
            throw new BadRequestException('Komment juda uzun (maksimal 1000 belgi)');
        }

        const listing = await this.prisma.horseListing.findUnique({
            where: { id: listingId },
        });

        if (!listing) {
            throw new NotFoundException('E\'lon topilmadi');
        }

        if (parentId) {
            const parentComment = await this.prisma.comment.findUnique({
                where: { id: parentId },
            });
            if (!parentComment || parentComment.listingId !== listingId) {
                throw new NotFoundException('Parent komment topilmadi');
            }
        }

        return this.prisma.comment.create({
            data: {
                userId,
                listingId,
                parentId,
                content: content.trim(),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        displayName: true,
                        avatarUrl: true,
                        isVerified: true,
                    },
                },
            },
        });
    }

    async deleteComment(userId: string, commentId: string) {
        const comment = await this.prisma.comment.findUnique({
            where: { id: commentId },
        });

        if (!comment) {
            throw new NotFoundException('Komment topilmadi');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { isAdmin: true },
        });

        if (comment.userId !== userId && !user?.isAdmin) {
            throw new ForbiddenException('Faqat o\'z kommentingizni o\'chirish mumkin');
        }

        await this.prisma.comment.delete({ where: { id: commentId } });

        return { deleted: true };
    }
}
