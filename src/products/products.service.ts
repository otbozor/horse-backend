import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductStatus, Currency, Prisma } from '@prisma/client';
import { UserCreateProductDto } from './dto/user-create-product.dto';

@Injectable()
export class ProductsService {
    constructor(private prisma: PrismaService) { }

    // In-memory deduplication for anonymous sessions (24h window)
    private readonly sessionViewCache = new Map<string, number>();
    // In-memory deduplication for logged-in users (permanent per server run)
    private readonly userViewCache = new Set<string>();

    private hasUserViewed(productId: string, userId: string): boolean {
        return this.userViewCache.has(`${productId}:${userId}`);
    }

    private recordUserView(productId: string, userId: string) {
        this.userViewCache.add(`${productId}:${userId}`);
    }

    private hasRecentSessionView(productId: string, sessionId: string): boolean {
        const key = `${productId}:${sessionId}`;
        const last = this.sessionViewCache.get(key);
        if (!last) return false;
        if (Date.now() - last < 24 * 60 * 60 * 1000) return true;
        this.sessionViewCache.delete(key);
        return false;
    }

    private recordSessionView(productId: string, sessionId: string) {
        this.sessionViewCache.set(`${productId}:${sessionId}`, Date.now());
    }

    async findAll(options?: {
        categoryId?: string;
        priceMin?: number;
        priceMax?: number;
        hasDelivery?: boolean;
        stockStatus?: string;
        q?: string;
        page?: number;
        limit?: number;
    }) {
        const where: Prisma.ProductWhereInput = {
            status: ProductStatus.PUBLISHED,
        };

        if (options?.categoryId) where.categoryId = options.categoryId;
        if (options?.hasDelivery !== undefined) where.hasDelivery = options.hasDelivery;
        if (options?.stockStatus) where.stockStatus = options.stockStatus as any;

        if (options?.priceMin || options?.priceMax) {
            where.priceAmount = {};
            if (options?.priceMin) where.priceAmount.gte = options.priceMin;
            if (options?.priceMax) where.priceAmount.lte = options.priceMax;
        }

        if (options?.q) {
            where.OR = [
                { title: { contains: options.q, mode: 'insensitive' } },
                { description: { contains: options.q, mode: 'insensitive' } },
            ];
        }

        const page = options?.page || 1;
        const limit = Math.min(options?.limit || 12, 50);
        const skip = (page - 1) * limit;

        const [products, total] = await Promise.all([
            this.prisma.product.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    category: true,
                    media: {
                        orderBy: { sortOrder: 'asc' },
                        take: 1,
                    },
                },
            }),
            this.prisma.product.count({ where }),
        ]);

        return {
            data: products,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
        };
    }

    async findBySlug(slug: string) {
        const product = await this.prisma.product.findUnique({
            where: { slug },
            include: {
                category: true,
                media: {
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });

        if (!product || product.status !== ProductStatus.PUBLISHED) {
            throw new NotFoundException('Mahsulot topilmadi');
        }

        return product;
    }

    async incrementViewCount(slug: string, userId?: string, sessionId?: string) {
        const product = await this.prisma.product.findUnique({
            where: { slug },
            select: { id: true, status: true },
        });

        if (!product || product.status !== ProductStatus.PUBLISHED) return;

        // Logged-in user: count only once ever
        if (userId) {
            if (this.hasUserViewed(product.id, userId)) return;
            this.recordUserView(product.id, userId);
        } else if (sessionId) {
            // Anonymous: count once per 24 hours
            if (this.hasRecentSessionView(product.id, sessionId)) return;
            this.recordSessionView(product.id, sessionId);
        }

        await this.prisma.product.update({
            where: { id: product.id },
            data: { viewCount: { increment: 1 } },
        });
    }

    async getCategories() {
        return this.prisma.productCategory.findMany({
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: {
                        products: {
                            where: { status: ProductStatus.PUBLISHED }
                        }
                    }
                }
            }
        });
    }

    async getCategoryBySlug(slug: string) {
        const category = await this.prisma.productCategory.findUnique({
            where: { slug },
        });

        if (!category) {
            throw new NotFoundException('Kategoriya topilmadi');
        }

        return category;
    }

    async getMyProducts(userId: string) {
        return this.prisma.product.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                category: true,
                media: {
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                },
            },
        });
    }

    async deleteProduct(userId: string, productId: string) {
        const product = await this.prisma.product.findFirst({
            where: { id: productId, userId },
        });

        if (!product) {
            throw new NotFoundException('Mahsulot topilmadi');
        }

        return this.prisma.product.delete({
            where: { id: productId },
        });
    }

    async createProduct(userId: string, dto: UserCreateProductDto) {
        const slug = dto.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            + '-' + Date.now();

        return this.prisma.product.create({
            data: {
                title: dto.title,
                slug,
                categoryId: dto.categoryId || null,
                userId,
                description: dto.description || null,
                priceAmount: dto.priceAmount,
                priceCurrency: (dto.priceCurrency as Currency) || Currency.UZS,
                hasDelivery: dto.hasDelivery || false,
                stockStatus: (dto.stockStatus as any) || 'IN_STOCK',
                status: ProductStatus.DRAFT,
            },
            include: {
                category: true,
                media: true,
            },
        });
    }
}
