import { Module } from '@nestjs/common';
import { KopkariController } from './kopkari.controller';
import { KopkariService } from './kopkari.service';
import { KopkariRemindersService } from './kopkari-reminders.service';

@Module({
    controllers: [KopkariController],
    providers: [KopkariService, KopkariRemindersService],
})
export class KopkariModule { }
