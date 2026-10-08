import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TelegramModule } from '../telegram/telegram.module';
import { ServicesCatalogController } from './services-catalog.controller';
import { ServicesCatalogService } from './services-catalog.service';

@Module({
    imports: [TelegramModule, JwtModule.register({})],
    controllers: [ServicesCatalogController],
    providers: [ServicesCatalogService],
    exports: [ServicesCatalogService],
})
export class ServicesCatalogModule { }
