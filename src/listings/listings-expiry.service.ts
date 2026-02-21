import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ListingsExpiryService implements OnModuleInit {
    private readonly logger = new Logger(ListingsExpiryService.name);

    constructor(private prisma: PrismaService) {}

    onModuleInit() {
        this.expireListings();
        // Run every 24 hours
        setInterval(() => this.expireListings(), 24 * 60 * 60 * 1000);
    }

    async expireListings() {
        try {
            const now = new Date();

            // 1. E'lon 30 kunlik muddati tugasa → EXPIRED
            const result = await this.prisma.horseListing.updateMany({
                where: {
                    status: 'APPROVED',
                    expiresAt: { lt: now },
                },
                data: { status: 'EXPIRED' },
            });
            if (result.count > 0) {
                this.logger.log(`⏰ ${result.count} ta e'lon muddati tugadi (EXPIRED)`);
            }

            // 2. Boost muddati tugasa → isPaid va isTop ni reset qilish
            const boostResult = await this.prisma.horseListing.updateMany({
                where: {
                    isPaid: true,
                    boostExpiresAt: { lt: now },
                },
                data: { isPaid: false, isTop: false, isPremium: false, boostExpiresAt: null },
            });
            if (boostResult.count > 0) {
                this.logger.log(`📦 ${boostResult.count} ta e'lon reklamasi muddati tugadi`);
            }
        } catch (err) {
            this.logger.error('expireListings error:', err);
        }
    }
}
