import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { PaymentMethod, PaymentPackage, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from './payment.service';

export type StarsPurpose = 'boost' | 'credits' | 'listing-bundle' | 'product' | 'reactivation';

export interface StarsInvoiceInput {
    purpose: StarsPurpose;
    listingId?: string;
    productId?: string;
    packageType?: PaymentPackage;
    bundleSize?: 5 | 10 | 20;
}

const DEFAULT_RATE = 220; // 1 ⭐ ≈ 220 so'm (admin paneldan o'zgartiriladi)
const PAYLOAD_PREFIX = 'pay:';

/**
 * Telegram Stars (XTR) orqali to'lov. Hisob mavjud Click oqimidagi kabi
 * yaratiladi (narx va tekshiruvlar bir xil), faqat to'lov usuli STARS bo'ladi
 * va Telegram invoice havolasi qaytariladi. Muvaffaqiyatli to'lovdan so'ng
 * PaymentService.applyCompletedPayment() - Click bilan bir xil effekt.
 */
@Injectable()
export class StarsService {
    private readonly logger = new Logger(StarsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly payments: PaymentService,
        @InjectBot() private readonly bot: Telegraf,
    ) { }

    async getConfig() {
        const rows = await this.prisma.appSetting.findMany({ where: { key: { in: ['stars_rate_uzs', 'stars_enabled'] } } });
        const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
        const rate = Number(map['stars_rate_uzs']) > 0 ? Number(map['stars_rate_uzs']) : DEFAULT_RATE;
        return { rate, enabled: map['stars_enabled'] !== 'false' };
    }

    toStars(amountUzs: number, rate: number) {
        return Math.max(1, Math.ceil(amountUzs / rate));
    }

    async createInvoice(userId: string, input: StarsInvoiceInput) {
        const { rate, enabled } = await this.getConfig();
        if (!enabled) throw new BadRequestException("Telegram Stars orqali to'lov vaqtincha o'chirilgan");

        // Mavjud Click oqimi PENDING to'lovni yaratadi va barcha tekshiruvlarni bajaradi
        let created: { paymentId: string; amount: number };
        let title: string;
        switch (input.purpose) {
            case 'boost':
                if (!input.listingId || !input.packageType) throw new BadRequestException('listingId va packageType kerak');
                created = await this.payments.createBoostPackageInvoice(userId, input.packageType, input.listingId);
                title = `Reklama: ${{ OSON_START: 'Oson start', TEZKOR_SAVDO: 'Tezkor savdo', TURBO_SAVDO: 'Turbo savdo' }[input.packageType]}`;
                break;
            case 'credits':
                if (!input.bundleSize) throw new BadRequestException('bundleSize kerak');
                created = await this.payments.createCreditBundleInvoice(userId, input.bundleSize);
                title = `${input.bundleSize} ta e'lon paketi`;
                break;
            case 'listing-bundle':
                if (!input.listingId || !input.bundleSize) throw new BadRequestException('listingId va bundleSize kerak');
                created = await this.payments.createListingBundleInvoice(userId, input.listingId, input.bundleSize);
                title = `${input.bundleSize} ta e'lon paketi`;
                break;
            case 'product':
                if (!input.productId) throw new BadRequestException('productId kerak');
                created = await this.payments.createProductInvoice(userId, input.productId);
                title = "Anjom joylash";
                break;
            case 'reactivation':
                if (!input.listingId) throw new BadRequestException('listingId kerak');
                created = await this.payments.createReactivationInvoice(userId, input.listingId);
                title = "E'lonni qayta faollashtirish";
                break;
            default:
                throw new BadRequestException("Noto'g'ri to'lov turi");
        }

        const stars = this.toStars(created.amount, rate);
        await this.prisma.payment.update({
            where: { id: created.paymentId },
            data: { method: PaymentMethod.STARS, starsAmount: stars },
        });

        const invoiceUrl = await this.bot.telegram.createInvoiceLink({
            title: title.slice(0, 32),
            description: `Otbozor — ${title}`.slice(0, 255),
            payload: `${PAYLOAD_PREFIX}${created.paymentId}`,
            provider_token: '',
            currency: 'XTR',
            prices: [{ label: title.slice(0, 32), amount: stars }],
        });

        return { paymentId: created.paymentId, amount: created.amount, stars, invoiceUrl };
    }

    /** pre_checkout_query: to'lov hali kutilayotgan va summa mos kelishini tasdiqlash */
    async validatePreCheckout(payload: string, currency: string, totalAmount: number): Promise<string | null> {
        if (!payload.startsWith(PAYLOAD_PREFIX)) return "Noto'g'ri to'lov";
        const payment = await this.prisma.payment.findUnique({ where: { id: payload.slice(PAYLOAD_PREFIX.length) } });
        if (!payment || payment.method !== PaymentMethod.STARS) return "To'lov topilmadi";
        if (payment.status !== PaymentStatus.PENDING) return "Bu to'lov allaqachon yakunlangan";
        if (currency !== 'XTR' || totalAmount !== payment.starsAmount) return "To'lov summasi mos kelmadi";
        return null;
    }

    /** successful_payment: effektni qo'llash (idempotent - takroriy xabar e'tiborsiz) */
    async complete(payload: string, chargeId: string, totalAmount: number) {
        if (!payload.startsWith(PAYLOAD_PREFIX)) throw new NotFoundException('Payload');
        const payment = await this.prisma.payment.findUnique({ where: { id: payload.slice(PAYLOAD_PREFIX.length) } });
        if (!payment) throw new NotFoundException("To'lov topilmadi");
        if (payment.status === PaymentStatus.COMPLETED) return payment;
        if (totalAmount !== payment.starsAmount) {
            this.logger.error(`⚠️ Stars summasi mos emas: ${payment.id} kutilgan=${payment.starsAmount} keldi=${totalAmount}`);
        }
        await this.payments.applyCompletedPayment(payment, { telegramChargeId: chargeId });
        this.logger.log(`⭐ Stars to'lovi yakunlandi: ${payment.id} (${totalAmount} XTR)`);
        return payment;
    }
}
