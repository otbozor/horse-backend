import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { User } from '@prisma/client';
import { PaymentPackage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
    constructor(
        private readonly paymentService: PaymentService,
        private readonly prisma: PrismaService,
    ) { }

    @Get('reactivation-price')
    @Public()
    @ApiOperation({ summary: 'Get listing reactivation price (public)' })
    async getReactivationPrice() {
        const amount = await this.paymentService.getReactivationPrice();
        return { success: true, data: { amount } };
    }

    @Post('create-reactivation-invoice')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create reactivation invoice for EXPIRED listing' })
    async createReactivationInvoice(
        @Body() body: { listingId: string },
        @CurrentUser() user: User,
    ) {
        const result = await this.paymentService.createReactivationInvoice(user.id, body.listingId);
        return { success: true, data: result };
    }

    @Get('product-price')
    @Public()
    @ApiOperation({ summary: 'Get product listing price (public)' })
    async getProductPrice() {
        const setting = await this.prisma.appSetting.findUnique({
            where: { key: 'product_listing_price' },
        });
        return {
            success: true,
            data: { productListingPrice: setting ? Number(setting.value) : 35000 },
        };
    }

    @Get('packages')
    @Public()
    @ApiOperation({ summary: 'Get listing package prices with discounts (public)' })
    async getPackages() {
        const OSON_START = await this.paymentService.getPackagePrice('OSON_START');
        const TEZKOR_SAVDO = await this.paymentService.getPackagePrice('TEZKOR_SAVDO');
        const TURBO_SAVDO = await this.paymentService.getPackagePrice('TURBO_SAVDO');
        return {
            success: true,
            data: { OSON_START, TEZKOR_SAVDO, TURBO_SAVDO },
        };
    }

    @Post('create-invoice')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create Click payment invoice' })
    async createInvoice(
        @Body() body: { listingId: string; packageType: string },
        @CurrentUser() user: User,
    ) {
        const packageType = body.packageType as PaymentPackage;
        const result = await this.paymentService.createInvoice(user.id, body.listingId, packageType);
        return { success: true, data: result };
    }

    @Post('click/prepare')
    @Public()
    @ApiOperation({ summary: 'Click prepare webhook' })
    async clickPrepare(@Body() body: any) {
        return this.paymentService.handlePrepare(body);
    }

    @Post('click/complete')
    @Public()
    @ApiOperation({ summary: 'Click complete webhook' })
    async clickComplete(@Body() body: any) {
        return this.paymentService.handleComplete(body);
    }

    @Get('status/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get listing payment status' })
    async getStatus(@Param('id') id: string, @CurrentUser() user: User) {
        const data = await this.paymentService.getPaymentStatus(id, user.id);
        return { success: true, data };
    }

    @Post('create-product-invoice')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Create product payment invoice' })
    async createProductInvoice(
        @Body() body: { productId: string },
        @CurrentUser() user: User,
    ) {
        const result = await this.paymentService.createProductInvoice(user.id, body.productId);
        return { success: true, data: result };
    }

    @Get('product-status/:id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get product payment status' })
    async getProductStatus(@Param('id') id: string, @CurrentUser() user: User) {
        const data = await this.paymentService.getProductPaymentStatus(id, user.id);
        return { success: true, data };
    }
}
