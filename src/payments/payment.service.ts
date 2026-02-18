import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus, PaymentPackage, ListingStatus, ProductStatus } from '@prisma/client';
import * as crypto from 'crypto';

const PACKAGES = {
    OSON_START: { amount: 41600, durationDays: 3 },
    TEZKOR_SAVDO: { amount: 85700, durationDays: 7 },
    TURBO_SAVDO: { amount: 249300, durationDays: 30 },
};

@Injectable()
export class PaymentService {
    private readonly serviceId: string;
    private readonly merchantId: string;
    private readonly secretKey: string;
    private readonly frontendUrl: string;

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
    ) {
        this.serviceId = this.configService.get<string>('CLICK_SERVICE_ID') || '95967';
        this.merchantId = this.configService.get<string>('CLICK_MERCHANT_ID') || '44242';
        this.secretKey = this.configService.get<string>('CLICK_SECRET_KEY') || 'M6EQFmuA1qlIl';
        this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://otbozor.uz';
    }

    // Create invoice and return Click payment URL
    async createInvoice(userId: string, listingId: string, packageType: PaymentPackage) {
        const listing = await this.prisma.horseListing.findUnique({ where: { id: listingId } });

        if (!listing) throw new NotFoundException('Listing not found');
        if (listing.userId !== userId) throw new BadRequestException('Not your listing');
        if (listing.status !== ListingStatus.APPROVED) {
            throw new BadRequestException("E'lon tasdiqlangandan keyin to'lov qilish mumkin");
        }
        if (listing.isPaid) throw new BadRequestException("E'lon allaqachon to'langan");

        const pkg = PACKAGES[packageType];
        if (!pkg) throw new BadRequestException('Noto\'g\'ri tarif');

        // Create payment record
        const payment = await this.prisma.payment.create({
            data: {
                listingId,
                userId,
                packageType,
                amount: pkg.amount,
                status: PaymentStatus.PENDING,
                merchantPrepareId: Math.floor(Math.random() * 2000000000) + 1,
            },
        });

        const returnUrl = `${this.frontendUrl}/elon/${listingId}/tolov/natija?paymentId=${payment.id}`;

        // Click payment URL
        const clickUrl =
            `https://my.click.uz/services/pay` +
            `?service_id=${this.serviceId}` +
            `&merchant_id=${this.merchantId}` +
            `&amount=${pkg.amount}` +
            `&transaction_param=${payment.id}` +
            `&return_url=${encodeURIComponent(returnUrl)}`;

        return {
            paymentId: payment.id,
            amount: pkg.amount,
            clickUrl,
        };
    }

    // Create invoice for product listing
    async createProductInvoice(userId: string, productId: string) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });

        if (!product) throw new NotFoundException('Mahsulot topilmadi');
        if (product.userId !== userId) throw new BadRequestException('Bu sizning mahsulotingiz emas');
        if (product.isPaid) throw new BadRequestException("Mahsulot allaqachon to'langan");

        // Get price from settings
        const setting = await this.prisma.appSetting.findUnique({
            where: { key: 'product_listing_price' },
        });
        const amount = setting ? Number(setting.value) : 35000;

        const payment = await this.prisma.payment.create({
            data: {
                productId,
                userId,
                amount,
                status: PaymentStatus.PENDING,
                merchantPrepareId: Math.floor(Math.random() * 2000000000) + 1,
            },
        });

        const returnUrl = `${this.frontendUrl}/mahsulot/${productId}/tolov/natija?paymentId=${payment.id}`;
        const clickUrl =
            `https://my.click.uz/services/pay` +
            `?service_id=${this.serviceId}` +
            `&merchant_id=${this.merchantId}` +
            `&amount=${amount}` +
            `&transaction_param=${payment.id}` +
            `&return_url=${encodeURIComponent(returnUrl)}`;

        return { paymentId: payment.id, amount, clickUrl };
    }

    // Click PREPARE webhook (action=0)
    // Click sends form-urlencoded data
    async handlePrepare(body: Record<string, string>) {
        const {
            click_trans_id,
            service_id,
            click_paydoc_id,
            merchant_trans_id,
            amount,
            action,
            sign_time,
            sign_string,
            error,
        } = body;

        console.log('📥 Click PREPARE:', { merchant_trans_id, amount, action, error });

        // Verify signature
        const expectedSign = crypto
            .createHash('md5')
            .update(`${click_trans_id}${service_id}${this.secretKey}${merchant_trans_id}${amount}${action}${sign_time}`)
            .digest('hex');

        if (expectedSign !== sign_string) {
            console.error('❌ Sign mismatch:', { expected: expectedSign, got: sign_string });
            return { error: -1, error_note: 'SIGN CHECK FAILED!' };
        }

        if (String(service_id) !== String(this.serviceId)) {
            return { error: -2, error_note: 'Incorrect parameter service_id' };
        }

        if (parseInt(action) !== 0) {
            return { error: -3, error_note: 'Action not found' };
        }

        const payment = await this.prisma.payment.findUnique({ where: { id: merchant_trans_id } });
        if (!payment) return { error: -5, error_note: 'Transaction not found' };
        if (payment.status === PaymentStatus.COMPLETED) {
            return { error: -4, error_note: 'Already paid' };
        }
        if (payment.status === PaymentStatus.CANCELLED) {
            return { error: -9, error_note: 'Transaction cancelled' };
        }

        // Verify amount (allow 1 sum margin)
        if (Math.abs(Number(payment.amount) - parseFloat(amount)) > 1) {
            return { error: -2, error_note: 'Incorrect parameter amount' };
        }

        if (parseInt(error) < 0) {
            await this.prisma.payment.update({
                where: { id: merchant_trans_id },
                data: { status: PaymentStatus.CANCELLED, clickTransId: click_trans_id },
            });
            return { error: 0, error_note: 'Success' };
        }

        // Save Click transaction IDs
        await this.prisma.payment.update({
            where: { id: merchant_trans_id },
            data: { clickTransId: click_trans_id, clickPaydocId: click_paydoc_id },
        });

        return {
            click_trans_id: click_trans_id,
            merchant_trans_id,
            merchant_prepare_id: payment.merchantPrepareId,
            error: 0,
            error_note: 'Success',
        };
    }

    // Click COMPLETE webhook (action=1)
    async handleComplete(body: Record<string, string>) {
        const {
            click_trans_id,
            service_id,
            click_paydoc_id,
            merchant_trans_id,
            merchant_prepare_id,
            amount,
            action,
            sign_time,
            sign_string,
            error,
        } = body;

        console.log('📥 Click COMPLETE:', { merchant_trans_id, amount, action, error });

        // Verify signature
        const expectedSign = crypto
            .createHash('md5')
            .update(`${click_trans_id}${service_id}${this.secretKey}${merchant_trans_id}${merchant_prepare_id}${amount}${action}${sign_time}`)
            .digest('hex');

        if (expectedSign !== sign_string) {
            console.error('❌ Sign mismatch:', { expected: expectedSign, got: sign_string });
            return { error: -1, error_note: 'SIGN CHECK FAILED!' };
        }

        if (String(service_id) !== String(this.serviceId)) {
            return { error: -2, error_note: 'Incorrect parameter service_id' };
        }

        if (parseInt(action) !== 1) {
            return { error: -3, error_note: 'Action not found' };
        }

        const payment = await this.prisma.payment.findUnique({ where: { id: merchant_trans_id } });
        if (!payment) return { error: -5, error_note: 'Transaction not found' };
        if (payment.status === PaymentStatus.COMPLETED) {
            return { error: -4, error_note: 'Already paid' };
        }
        if (payment.status === PaymentStatus.CANCELLED) {
            return { error: -9, error_note: 'Transaction cancelled' };
        }

        if (parseInt(error) < 0) {
            await this.prisma.payment.update({
                where: { id: merchant_trans_id },
                data: { status: PaymentStatus.CANCELLED },
            });
            return { error: 0, error_note: 'Success' };
        }

        // ✅ Complete payment
        const isTopPackage =
            payment.packageType === PaymentPackage.TEZKOR_SAVDO ||
            payment.packageType === PaymentPackage.TURBO_SAVDO;

        if (payment.listingId) {
            await this.prisma.$transaction([
                this.prisma.payment.update({
                    where: { id: merchant_trans_id },
                    data: {
                        status: PaymentStatus.COMPLETED,
                        clickTransId: click_trans_id,
                        clickPaydocId: click_paydoc_id,
                    },
                }),
                this.prisma.horseListing.update({
                    where: { id: payment.listingId },
                    data: { isPaid: true, isTop: isTopPackage, publishedAt: new Date() },
                }),
            ]);
            console.log('✅ Listing payment completed:', payment.listingId);
        } else if (payment.productId) {
            await this.prisma.$transaction([
                this.prisma.payment.update({
                    where: { id: merchant_trans_id },
                    data: {
                        status: PaymentStatus.COMPLETED,
                        clickTransId: click_trans_id,
                        clickPaydocId: click_paydoc_id,
                    },
                }),
                this.prisma.product.update({
                    where: { id: payment.productId },
                    data: {
                        isPaid: true,
                        status: ProductStatus.PUBLISHED,
                        publishedAt: new Date(),
                    },
                }),
            ]);
            console.log('✅ Product payment completed:', payment.productId);
        }

        return {
            click_trans_id: click_trans_id,
            merchant_trans_id,
            merchant_confirm_id: payment.merchantPrepareId,
            error: 0,
            error_note: 'Success',
        };
    }

    // Check product payment status
    async getProductPaymentStatus(paymentId: string, userId: string) {
        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
            include: { product: { select: { id: true, title: true, slug: true, isPaid: true } } },
        });
        if (!payment) throw new NotFoundException('Payment not found');
        if (payment.userId !== userId) throw new BadRequestException('Access denied');
        return {
            id: payment.id,
            status: payment.status,
            amount: Number(payment.amount),
            product: payment.product,
            createdAt: payment.createdAt,
        };
    }

    // Check listing payment status
    async getPaymentStatus(paymentId: string, userId: string) {
        const payment = await this.prisma.payment.findUnique({
            where: { id: paymentId },
            include: { listing: { select: { id: true, title: true, slug: true, isPaid: true } } },
        });

        if (!payment) throw new NotFoundException('Payment not found');
        if (payment.userId !== userId) throw new BadRequestException('Access denied');

        return {
            id: payment.id,
            status: payment.status,
            amount: Number(payment.amount),
            packageType: payment.packageType,
            listing: payment.listing,
            createdAt: payment.createdAt,
        };
    }
}
