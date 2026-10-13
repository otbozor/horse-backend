import { Global, Module } from '@nestjs/common';
import { HandoverService } from './handover.service';

@Global()
@Module({
    providers: [HandoverService],
    exports: [HandoverService],
})
export class HandoverModule { }
