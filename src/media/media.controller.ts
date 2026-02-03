import { Controller, Post, Body, UseGuards, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';

// Response wrapper
interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message: string;
    timestamp: string;
}

@ApiTags('Media')
@Controller('media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MediaController {
    constructor(private readonly mediaService: MediaService) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Upload file' })
    @ApiResponse({ status: 201, description: 'File uploaded successfully' })
    async uploadFile(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { entityType: 'listings' | 'blog' | 'events' | 'avatars' },
        @CurrentUser() user: User,
    ): Promise<ApiResponse<{ fileUrl: string; fileName: string }>> {
        if (!file) {
            throw new BadRequestException('No file provided');
        }

        const { filePath, fileUrl, fileName } = await this.mediaService.getUploadPath(
            body.entityType,
            file,
        );

        await this.mediaService.saveFile(file, filePath);

        return {
            success: true,
            data: { fileUrl, fileName },
            message: 'File uploaded successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('attach')
    @ApiOperation({ summary: 'Attach uploaded media to listing' })
    @ApiResponse({ status: 201, description: 'Media attached' })
    async attachMedia(
        @Body() body: {
            listingId: string;
            media: Array<{ url: string; type: 'IMAGE' | 'VIDEO'; sortOrder: number }>;
        },
        @CurrentUser() user: User,
    ): Promise<ApiResponse<null>> {
        await this.mediaService.attachMediaToListing(body.listingId, body.media);
        return {
            success: true,
            message: 'Media attached successfully',
            timestamp: new Date().toISOString(),
        };
    }
}
