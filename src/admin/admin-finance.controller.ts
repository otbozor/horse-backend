import { Controller, Get, Put, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

@ApiTags('Admin Finance')
@Controller('admin/finance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminFinanceController {
    constructor(
        private prisma: PrismaService,
        private adminService: AdminService,
    ) {}

    @Get('settings')
    @ApiOperation({ summary: 'Get finance settings' })
    async getSettings(@CurrentUser() user: User) {
        await this.adminService.requireAdmin(user.id);

        const keys = [
            'product_listing_price',
            'listing_reactivation_price',
            'listing_oson_start_price', 'listing_oson_start_discount',
            'listing_tezkor_savdo_price', 'listing_tezkor_savdo_discount',
            'listing_turbo_savdo_price', 'listing_turbo_savdo_discount',
        ];
        const settings = await this.prisma.appSetting.findMany({ where: { key: { in: keys } } });
        const map: Record<string, string> = {};
        settings.forEach(s => { map[s.key] = s.value; });

        return {
            success: true,
            data: {
                productListingPrice: Number(map['product_listing_price'] || 35000),
                reactivationPrice: Number(map['listing_reactivation_price'] || 50000),
                listingPackages: {
                    OSON_START: {
                        price: Number(map['listing_oson_start_price'] || 41600),
                        discountPrice: map['listing_oson_start_discount'] ? Number(map['listing_oson_start_discount']) : null,
                    },
                    TEZKOR_SAVDO: {
                        price: Number(map['listing_tezkor_savdo_price'] || 85700),
                        discountPrice: map['listing_tezkor_savdo_discount'] ? Number(map['listing_tezkor_savdo_discount']) : null,
                    },
                    TURBO_SAVDO: {
                        price: Number(map['listing_turbo_savdo_price'] || 249300),
                        discountPrice: map['listing_turbo_savdo_discount'] ? Number(map['listing_turbo_savdo_discount']) : null,
                    },
                },
            },
        };
    }

    @Put('settings')
    @ApiOperation({ summary: 'Update finance settings' })
    async updateSettings(
        @CurrentUser() user: User,
        @Body() body: {
            productListingPrice?: number;
            reactivationPrice?: number;
            listingPackages?: {
                OSON_START?: { price?: number; discountPrice?: number | null };
                TEZKOR_SAVDO?: { price?: number; discountPrice?: number | null };
                TURBO_SAVDO?: { price?: number; discountPrice?: number | null };
            };
        },
    ) {
        await this.adminService.requireAdmin(user.id);

        const upserts: Promise<any>[] = [];

        const upsert = (key: string, value: string) =>
            this.prisma.appSetting.upsert({
                where: { key },
                update: { value },
                create: { key, value },
            });

        if (body.productListingPrice && body.productListingPrice > 0) {
            upserts.push(upsert('product_listing_price', String(body.productListingPrice)));
        }

        if (body.reactivationPrice && body.reactivationPrice > 0) {
            upserts.push(upsert('listing_reactivation_price', String(body.reactivationPrice)));
        }

        const pkgMap: Record<string, string> = {
            OSON_START: 'oson_start',
            TEZKOR_SAVDO: 'tezkor_savdo',
            TURBO_SAVDO: 'turbo_savdo',
        };

        for (const [pkg, slug] of Object.entries(pkgMap)) {
            const data = body.listingPackages?.[pkg as keyof typeof body.listingPackages];
            if (!data) continue;
            if (data.price && data.price > 0) {
                upserts.push(upsert(`listing_${slug}_price`, String(data.price)));
            }
            if (data.discountPrice !== undefined) {
                if (data.discountPrice === null || data.discountPrice === 0) {
                    // Remove discount
                    upserts.push(this.prisma.appSetting.deleteMany({ where: { key: `listing_${slug}_discount` } }));
                } else {
                    upserts.push(upsert(`listing_${slug}_discount`, String(data.discountPrice)));
                }
            }
        }

        await Promise.all(upserts);
        return { success: true };
    }

    @Get('payments')
    @ApiOperation({ summary: 'Get all payments' })
    async getPayments(
        @CurrentUser() user: User,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
        @Query('status') status?: string,
        @Query('type') type?: string,
    ) {
        await this.adminService.requireAdmin(user.id);
        const take = Number(limit);
        const skip = (Number(page) - 1) * take;

        const where: any = {};
        if (status) where.status = status;
        if (type === 'listing') where.listingId = { not: null };
        if (type === 'product') where.productId = { not: null };

        const [payments, total] = await Promise.all([
            this.prisma.payment.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take,
                skip,
                include: {
                    user: { select: { id: true, displayName: true, phone: true } },
                    listing: { select: { id: true, title: true } },
                    product: { select: { id: true, title: true } },
                },
            }),
            this.prisma.payment.count({ where }),
        ]);

        const totalRevenue = await this.prisma.payment.aggregate({
            where: { status: 'COMPLETED' },
            _sum: { amount: true },
        });

        return {
            success: true,
            data: {
                payments: payments.map(p => ({
                    id: p.id,
                    amount: Number(p.amount),
                    status: p.status,
                    type: p.listingId ? 'listing' : 'product',
                    packageType: p.packageType,
                    user: p.user,
                    subject: p.listing || p.product,
                    createdAt: p.createdAt,
                    clickTransId: p.clickTransId,
                })),
                total,
                totalRevenue: Number(totalRevenue._sum.amount || 0),
                page: Number(page),
                totalPages: Math.ceil(total / take),
            },
        };
    }
}
