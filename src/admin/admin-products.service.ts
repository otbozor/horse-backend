import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductStatus, Currency, Prisma } from '@prisma/client';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { UpdateProductDto } from '../products/dto/update-product.dto';
import { CreateCategoryDto } from '../products/dto/create-category.dto';

@Injectable()
export class AdminProductsService {
    constructor(private prisma: PrismaService) { }

    // ============================================
    // PRODUCTS
    // ============================================

    async getAllProducts(options?: {
        status?: string;
        categoryId?: string;
        page?: number;
        limit?: number;
    }) {
        const where: Prisma.ProductWhereInput = {};

        if (options?.status) where.status = options.status as ProductStatus;
        if (options?.categoryId) where.categoryId = options.categoryId;

        const page = options?.page || 1;
        const limit = Math.min(options?.limit || 20, 100);
        const skip = (page - 1) * limit;

        const [products, total] = await Promise.all([
            this.prisma.product.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    category: true,
                    user: { select: { id: true, displayName: true, telegramUsername: true } },
                    media: {
                        orderBy: { sortOrder: 'asc' },
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
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async getProductById(id: string) {
        const product = await this.prisma.product.findUnique({
            where: { id },
            include: {
                category: true,
                media: {
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });

        if (!product) {
            throw new NotFoundException('Mahsulot topilmadi');
        }

        return product;
    }

    async createProduct(dto: CreateProductDto) {
        // Check if slug is unique
        const existing = await this.prisma.product.findUnique({
            where: { slug: dto.slug },
        });

        if (existing) {
            throw new BadRequestException('Bu slug allaqachon mavjud');
        }

        // Create product with media
        const product = await this.prisma.product.create({
            data: {
                title: dto.title,
                slug: dto.slug,
                categoryId: dto.categoryId,
                description: dto.description,
                priceAmount: dto.priceAmount,
                priceCurrency: (dto.priceCurrency as Currency) || Currency.UZS,
                hasDelivery: dto.hasDelivery || false,
                stockStatus: dto.stockStatus || 'IN_STOCK',
                status: ProductStatus.DRAFT,
                media: dto.mediaUrls ? {
                    create: dto.mediaUrls.map((url, index) => ({
                        url,
                        sortOrder: index,
                    })),
                } : undefined,
            },
            include: {
                category: true,
                media: true,
            },
        });

        return product;
    }

    async updateProduct(id: string, dto: UpdateProductDto) {
        const product = await this.getProductById(id);

        // Check slug uniqueness if changed
        if (dto.slug && dto.slug !== product.slug) {
            const existing = await this.prisma.product.findUnique({
                where: { slug: dto.slug },
            });

            if (existing) {
                throw new BadRequestException('Bu slug allaqachon mavjud');
            }
        }

        // Update product
        const updated = await this.prisma.product.update({
            where: { id },
            data: {
                title: dto.title,
                slug: dto.slug,
                categoryId: dto.categoryId,
                description: dto.description,
                priceAmount: dto.priceAmount,
                priceCurrency: dto.priceCurrency as Currency,
                hasDelivery: dto.hasDelivery,
                stockStatus: dto.stockStatus,
            },
            include: {
                category: true,
                media: true,
            },
        });

        // Update media if provided
        if (dto.mediaUrls) {
            // Delete old media
            await this.prisma.productMedia.deleteMany({
                where: { productId: id },
            });

            // Create new media
            await this.prisma.productMedia.createMany({
                data: dto.mediaUrls.map((url, index) => ({
                    productId: id,
                    url,
                    sortOrder: index,
                })),
            });
        }

        return this.getProductById(id);
    }

    async publishProduct(id: string) {
        await this.getProductById(id);

        return this.prisma.product.update({
            where: { id },
            data: {
                status: ProductStatus.PUBLISHED,
                publishedAt: new Date(),
            },
            include: {
                category: true,
                media: true,
            },
        });
    }

    async archiveProduct(id: string) {
        await this.getProductById(id);

        return this.prisma.product.update({
            where: { id },
            data: { status: ProductStatus.ARCHIVED },
            include: {
                category: true,
                media: true,
            },
        });
    }

    async deleteProduct(id: string) {
        await this.getProductById(id);

        await this.prisma.product.delete({
            where: { id },
        });

        return { message: 'Mahsulot o\'chirildi' };
    }

    // ============================================
    // CATEGORIES
    // ============================================

    async getAllCategories() {
        return this.prisma.productCategory.findMany({
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { products: true },
                },
            },
        });
    }

    async createCategory(dto: CreateCategoryDto) {
        const existing = await this.prisma.productCategory.findUnique({
            where: { slug: dto.slug },
        });

        if (existing) {
            throw new BadRequestException('Bu slug allaqachon mavjud');
        }

        return this.prisma.productCategory.create({
            data: {
                name: dto.name,
                slug: dto.slug,
            },
        });
    }

    async updateCategory(id: string, dto: CreateCategoryDto) {
        const category = await this.prisma.productCategory.findUnique({
            where: { id },
        });

        if (!category) {
            throw new NotFoundException('Kategoriya topilmadi');
        }

        // Check slug uniqueness if changed
        if (dto.slug !== category.slug) {
            const existing = await this.prisma.productCategory.findUnique({
                where: { slug: dto.slug },
            });

            if (existing) {
                throw new BadRequestException('Bu slug allaqachon mavjud');
            }
        }

        return this.prisma.productCategory.update({
            where: { id },
            data: {
                name: dto.name,
                slug: dto.slug,
            },
        });
    }

    async deleteCategory(id: string) {
        const category = await this.prisma.productCategory.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { products: true },
                },
            },
        });

        if (!category) {
            throw new NotFoundException('Kategoriya topilmadi');
        }

        if (category._count.products > 0) {
            throw new BadRequestException(
                'Bu kategoriyada mahsulotlar mavjud. Avval mahsulotlarni o\'chiring yoki boshqa kategoriyaga o\'tkazing',
            );
        }

        await this.prisma.productCategory.delete({
            where: { id },
        });

        return { message: 'Kategoriya o\'chirildi' };
    }
}
