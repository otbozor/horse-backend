import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelService } from '../telegram/telegram-channel.service';
import { PaymentStatus, PaymentPackage, ListingStatus, ProductStatus } from '@prisma/client';
import * as crypto from 'crypto';

const PACKAGE_DEFAULTS = {
    OSON_START: { amount: 41600, durationDays: 3 },
    TEZKOR_SAVDO: { amount: 85700, durationDays: 7 },
    TURBO_SAVDO: { amount: 249300, durationDays: 30 },
};

const PACKAGE_SLUGS: Record<string, string> = {
    OSON_START: 'oson_start',
    TEZKOR_SAVDO: 'tezkor_savdo',
    TURBO_SAVDO: 'turbo_savdo',
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
        private telegramChannel: TelegramChannelService,
    ) {
        this.serviceId = this.configService.get<string>('CLICK_SERVICE_ID') || '95967';
        this.merchantId = this.configService.get<string>('CLICK_MERCHANT_ID') || '44242';
        this.secretKey = this.configService.get<string>('CLICK_SECRET_KEY') || 'M6EQFmuA1qlIl';
        this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://otbozor.uz';
    }

    // Get package price: uses discount if set, otherwise original price from DB, fallback to hardcoded default
    async getPackagePrice(packageType: string): Promise<{ amount: number; originalAmount: number; hasDiscount: boolean }> {
        const slug = PACKAGE_SLUGS[packageType];
        const defaults = PACKAGE_DEFAULTS[packageType as keyof typeof PACKAGE_DEFAULTS];
        if (!slug || !defaults) throw new BadRequestException('Noto\'g\'ri tarif');

        const settings = await this.prisma.appSetting.findMany({
            where: { key: { in: [`listing_${slug}_price`, `listing_${slug}_discount`] } },
        });
        const map: Record<string, string> = {};
        settings.forEach(s => { map[s.key] = s.value; });

        const originalAmount = map[`listing_${slug}_price`] ? Number(map[`listing_${slug}_price`]) : defaults.amount;
        const discountAmount = map[`listing_${slug}_discount`] ? Number(map[`listing_${slug}_discount`]) : null;

        return {
            amount: discountAmount ?? originalAmount,
            originalAmount,
            hasDiscount: discountAmount !== null && discountAmount < originalAmount,
        };
    }

    // Get reactivation price from settings
    async getReactivationPrice(): Promise<number> {
        const setting = await this.prisma.appSetting.findUnique({
            where: { key: 'listing_reactivation_price' },
        });
        return setting ? Number(setting.value) : 50000;
    }

    // Create reactivation invoice for EXPIRED listings
    async createReactivationInvoice(userId: string, listingId: string) {
        const listing = await this.prisma.horseListing.findUnique({ where: { id: listingId } });

        if (!listing) throw new NotFoundException('Listing not found');
        if (listing.userId !== userId) throw new BadRequestException('Not your listing');
        if (listing.status !== ListingStatus.EXPIRED) {
            throw new BadRequestException("Faqat muddati tugagan e'lonni faollashtirish mumkin");
        }

        const amount = await this.getReactivationPrice();

        const payment = await this.prisma.payment.create({
            data: {
                listingId,
                userId,
                amount,
                // packageType intentionally null — marks this as reactivation, not a boost
                status: PaymentStatus.PENDING,
                merchantPrepareId: Math.floor(Math.random() * 2000000000) + 1,
            },
        });

        const returnUrl = `${this.frontendUrl}/elon/${listingId}/tolov/natija?paymentId=${payment.id}`;
        const clickUrl =
            `https://my.click.uz/services/pay` +
            `?service_id=${this.serviceId}` +
            `&merchant_id=${this.merchantId}` +
            `&amount=${amount}` +
            `&transaction_param=${payment.id}` +
            `&return_url=${encodeURIComponent(returnUrl)}`;

        return { paymentId: payment.id, amount, clickUrl };
    }

    // Create invoice and return Click payment URL
    async createInvoice(userId: string, listingId: string, packageType: PaymentPackage) {
        const listing = await this.prisma.horseListing.findUnique({ where: { id: listingId } });

        if (!listing) throw new NotFoundException('Listing not found');
        if (listing.userId !== userId) throw new BadRequestException('Not your listing');
        if (listing.status !== ListingStatus.APPROVED) {
            throw new BadRequestException("E'lon tasdiqlangandan keyin to'lov qilish mumkin");
        }
        if (listing.isPaid && listing.boostExpiresAt && listing.boostExpiresAt > new Date()) {
            throw new BadRequestException("E'lon allaqachon faol reklama paketiga ega");
        }

        const defaults = PACKAGE_DEFAULTS[packageType];
        if (!defaults) throw new BadRequestException('Noto\'g\'ri tarif');

        const { amount } = await this.getPackagePrice(packageType);

        // Create payment record
        const payment = await this.prisma.payment.create({
            data: {
                listingId,
                userId,
                packageType,
                amount,
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
            `&amount=${amount}` +
            `&transaction_param=${payment.id}` +
            `&return_url=${encodeURIComponent(returnUrl)}`;

        return {
            paymentId: payment.id,
            amount,
            clickUrl,
        };
    }

    // Get listing bundle prices from AppSettings
    async getListingBundlePrices(): Promise<{ bundle5: number; bundle10: number; bundle20: number }> {
        const settings = await this.prisma.appSetting.findMany({
            where: { key: { in: ['listing_bundle_5_price', 'listing_bundle_10_price', 'listing_bundle_20_price'] } },
        });
        const map: Record<string, number> = {};
        settings.forEach(s => { map[s.key] = Number(s.value); });
        return {
            bundle5: map['listing_bundle_5_price'] ?? 50000,
            bundle10: map['listing_bundle_10_price'] ?? 90000,
            bundle20: map['listing_bundle_20_price'] ?? 160000,
        };
    }

    // Create invoice for listing credits bundle purchase
    async createListingBundleInvoice(userId: string, listingId: string, bundleSize: 5 | 10 | 20) {
        const listing = await this.prisma.horseListing.findUnique({ where: { id: listingId } });

        if (!listing) throw new NotFoundException('E\'lon topilmadi');
        if (listing.userId !== userId) throw new BadRequestException('Bu sizning e\'loningiz emas');
        if (listing.status !== 'DRAFT') throw new BadRequestException('Faqat qoralama e\'lonlar uchun to\'lov qilish mumkin');

        const prices = await this.getListingBundlePrices();
        const amountMap: Record<number, number> = { 5: prices.bundle5, 10: prices.bundle10, 20: prices.bundle20 };
        const amount = amountMap[bundleSize];
        if (!amount) throw new BadRequestException('Noto\'g\'ri paket hajmi');

        const payment = await this.prisma.payment.create({
            data: {
                listingId,
                userId,
                amount,
                listingBundleSize: bundleSize,
                status: PaymentStatus.PENDING,
                merchantPrepareId: Math.floor(Math.random() * 2000000000) + 1,
            },
        });

        const returnUrl = `${this.frontendUrl}/elon/${listingId}/nashr-tolov/natija?paymentId=${payment.id}`;
        const clickUrl =
            `https://my.click.uz/services/pay` +
            `?service_id=${this.serviceId}` +
            `&merchant_id=${this.merchantId}` +
            `&amount=${amount}` +
            `&transaction_param=${payment.id}` +
            `&return_url=${encodeURIComponent(returnUrl)}`;

        return { paymentId: payment.id, amount, clickUrl };
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
        if (payment.listingBundleSize && payment.listingId) {
            // Listing credits bundle purchase — add credits to user + auto-submit listing
            const bundleSize = payment.listingBundleSize;
            await this.prisma.$transaction([
                this.prisma.payment.update({
                    where: { id: merchant_trans_id },
                    data: {
                        status: PaymentStatus.COMPLETED,
                        clickTransId: click_trans_id,
                        clickPaydocId: click_paydoc_id,
                    },
                }),
                // Add bundle credits to user (bundleSize - 1 because 1 will be used immediately)
                this.prisma.user.update({
                    where: { id: payment.userId },
                    data: { listingCredits: { increment: bundleSize - 1 } },
                }),
                // Auto-submit the listing that triggered the purchase
                this.prisma.horseListing.update({
                    where: { id: payment.listingId },
                    data: {
                        status: ListingStatus.PENDING,
                    },
                }),
            ]);
            console.log(`✅ Listing bundle (${bundleSize}) payment completed, listing auto-submitted:`, payment.listingId);
        } else if (payment.listingId && payment.packageType) {
            // Boost payment (OSON_START / TEZKOR_SAVDO / TURBO_SAVDO)
            const pkgDefaults = PACKAGE_DEFAULTS[payment.packageType as keyof typeof PACKAGE_DEFAULTS];
            const boostExpiresAt = new Date(Date.now() + (pkgDefaults?.durationDays ?? 7) * 24 * 60 * 60 * 1000);
            const isPremium = payment.packageType === PaymentPackage.TURBO_SAVDO;
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
                    data: { isPaid: true, isTop: true, isPremium, publishedAt: new Date(), boostExpiresAt },
                }),
            ]);
            console.log('✅ Listing boost payment completed:', payment.listingId);

            // Post to Telegram channel (fire-and-forget, does not affect payment response)
            const listingForChannel = await this.prisma.horseListing.findUnique({
                where: { id: payment.listingId },
                include: {
                    region: { select: { nameUz: true } },
                    district: { select: { nameUz: true } },
                    breed: { select: { name: true } },
                    user: { select: { phone: true } },
                    media: {
                        where: { type: 'IMAGE' },
                        orderBy: { sortOrder: 'asc' },
                        take: 1,
                    },
                },
            });
            if (listingForChannel) {
                this.telegramChannel.postListingToChannel(listingForChannel).catch(() => {});
            }
        } else if (payment.listingId && !payment.packageType) {
            // Reactivation (EXPIRED) or Publication fee (DRAFT) — both send to PENDING
            const listingForUpdate = await this.prisma.horseListing.findUnique({
                where: { id: payment.listingId },
                select: { status: true },
            });
            const updateData: any = { status: ListingStatus.PENDING };
            if (listingForUpdate?.status === 'DRAFT') {
                // Publication fee — mark as paid
                updateData.isPaid = true;
            }
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
                    data: updateData,
                }),
            ]);
            console.log('✅ Listing publication/reactivation payment completed:', payment.listingId);
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
                        // status stays DRAFT — admin must approve before publishing
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
