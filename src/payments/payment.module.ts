import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { StarsService } from './stars.service';
import { StarsUpdate } from './stars.update';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
    imports: [TelegramModule],
    controllers: [PaymentController],
    providers: [PaymentService, StarsService, StarsUpdate],
    exports: [PaymentService],
})
export class PaymentModule { }
