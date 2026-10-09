import { Module } from '@nestjs/common';
import { GrowthController } from './growth.controller';
import { GrowthService } from './growth.service';
import { DigestService } from './digest.service';
import { DigestUpdate } from './digest.update';

@Module({
    controllers: [GrowthController],
    providers: [GrowthService, DigestService, DigestUpdate],
    exports: [GrowthService],
})
export class GrowthModule { }
