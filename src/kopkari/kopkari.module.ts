import { Module } from '@nestjs/common';
import { KopkariController } from './kopkari.controller';
import { KopkariService } from './kopkari.service';

@Module({
    controllers: [KopkariController],
    providers: [KopkariService],
})
export class KopkariModule { }
