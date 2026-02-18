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
            const result = await this.prisma.horseListing.updateMany({
                where: {
                    status: 'APPROVED',
                    expiresAt: { lt: new Date() },
                },
                data: { status: 'EXPIRED' },
            });
            if (result.count > 0) {
                this.logger.log(`⏰ ${result.count} ta e'lon muddati tugadi (EXPIRED)`);
            }
        } catch (err) {
            this.logger.error('expireListings error:', err);
        }
    }
}
