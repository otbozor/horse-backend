import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlogPostStatus } from '@prisma/client';

@Injectable()
export class BlogService {
    constructor(private prisma: PrismaService) { }

    // Public methods
    async getPosts(filters?: {
        limit?: number;
        page?: number;
    }) {
        const limit = filters?.limit || 20;
        const page = filters?.page || 1;
        const skip = (page - 1) * limit;

        const where: any = {
            status: BlogPostStatus.PUBLISHED,
        };

        const [posts, total] = await Promise.all([
            this.prisma.blogPost.findMany({
                where,
                orderBy: {
                    publishedAt: 'desc',
                },
                skip,
                take: limit,
            }),
            this.prisma.blogPost.count({ where }),
        ]);

        return {
            data: posts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async getPostBySlug(slug: string) {
        return this.prisma.blogPost.findUnique({ where: { slug } });
    }

    async incrementView(slug: string) {
        await this.prisma.blogPost.updateMany({
            where: { slug, status: BlogPostStatus.PUBLISHED },
            data: { viewCount: { increment: 1 } },
        });
    }

    async getRecentPosts(limit = 5) {
        return this.prisma.blogPost.findMany({
            where: {
                status: BlogPostStatus.PUBLISHED,
            },
            orderBy: {
                publishedAt: 'desc',
            },
            take: limit,
        });
    }

    // Admin methods
    async getAllPostsForAdmin(filters?: {
        status?: BlogPostStatus;
        limit?: number;
        page?: number;
    }) {
        const limit = filters?.limit || 20;
        const page = filters?.page || 1;
        const skip = (page - 1) * limit;

        const where: any = {};

        if (filters?.status) {
            where.status = filters.status;
        }

        const [posts, total] = await Promise.all([
            this.prisma.blogPost.findMany({
                where,
                orderBy: {
                    createdAt: 'desc',
                },
                skip,
                take: limit,
            }),
            this.prisma.blogPost.count({ where }),
        ]);

        return {
            data: posts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async getPostById(id: string) {
        return this.prisma.blogPost.findUnique({
            where: { id },
        });
    }

    async createPost(data: any) {
        return this.prisma.blogPost.create({
            data: {
                ...data,
                status: BlogPostStatus.PUBLISHED,
                publishedAt: new Date(),
            },
        });
    }

    async updatePost(id: string, data: any) {
        return this.prisma.blogPost.update({
            where: { id },
            data,
        });
    }

    async publishPost(id: string) {
        return this.prisma.blogPost.update({
            where: { id },
            data: {
                status: BlogPostStatus.PUBLISHED,
                publishedAt: new Date(),
            },
        });
    }

    async archivePost(id: string) {
        return this.prisma.blogPost.update({
            where: { id },
            data: {
                status: BlogPostStatus.ARCHIVED,
            },
        });
    }

    async deletePost(id: string) {
        return this.prisma.blogPost.delete({
            where: { id },
        });
    }
}
