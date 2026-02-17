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
        const setting = await this.prisma.appSetting.findUnique({
            where: { key: 'product_listing_price' },
        });
        return {
            success: true,
            data: {
                productListingPrice: setting ? Number(setting.value) : 35000,
            },
        };
    }

    @Put('settings')
    @ApiOperation({ summary: 'Update finance settings' })
    async updateSettings(@CurrentUser() user: User, @Body() body: { productListingPrice: number }) {
        await this.adminService.requireAdmin(user.id);
        const price = Number(body.productListingPrice);
        if (!price || price <= 0) {
            return { success: false, message: 'Noto\'g\'ri narx' };
        }

        await this.prisma.appSetting.upsert({
            where: { key: 'product_listing_price' },
            update: { value: String(price) },
            create: { key: 'product_listing_price', value: String(price) },
        });

        return {
            success: true,
            data: { productListingPrice: price },
        };
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
