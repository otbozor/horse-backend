import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductStatus, Currency, Prisma } from '@prisma/client';
import { UserCreateProductDto } from './dto/user-create-product.dto';

@Injectable()
export class ProductsService {
    constructor(private prisma: PrismaService) { }

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

        // Increment view count
        await this.prisma.product.update({
            where: { id: product.id },
            data: { viewCount: { increment: 1 } },
        });

        return product;
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
