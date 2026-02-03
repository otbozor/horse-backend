import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';

@Module({
    imports: [
        MulterModule.register({
            storage: memoryStorage(),
            limits: {
                fileSize: 50 * 1024 * 1024, // 50MB
            },
        }),
    ],
    controllers: [MediaController],
    providers: [MediaService],
    exports: [MediaService],
})
export class MediaModule { }
