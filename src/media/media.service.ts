import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class MediaService {
    private isCloudinaryConfigured = false;

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
    ) {
        const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
        const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
        const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

        if (!cloudName || !apiKey || !apiSecret) {
            console.error('❌ Cloudinary configuration missing:', {
                CLOUDINARY_CLOUD_NAME: !!cloudName,
                CLOUDINARY_API_KEY: !!apiKey,
                CLOUDINARY_API_SECRET: !!apiSecret,
            });
        } else {
            console.log('✅ Cloudinary configured:', cloudName);
            this.isCloudinaryConfigured = true;
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
        });
    }

    // Upload file to Cloudinary
    async uploadFile(
        file: Express.Multer.File,
        folder: 'listings' | 'blog' | 'events' | 'avatars',
    ): Promise<{ url: string; publicId: string; type: 'IMAGE' | 'VIDEO' }> {
        // Validate file type
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
        if (!allowedMimes.includes(file.mimetype)) {
            throw new BadRequestException('Invalid file type. Only JPEG, PNG, WebP, MP4, WebM allowed');
        }

        // Validate file size (max 50MB)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new BadRequestException('File too large. Max 50MB');
        }

        if (!this.isCloudinaryConfigured) {
            throw new BadRequestException(
                'Cloudinary is not configured. Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET environment variables.',
            );
        }

        const isVideo = file.mimetype.startsWith('video/');
        const resourceType = isVideo ? 'video' : 'image';

        try {
            // Upload to Cloudinary
            const result = await new Promise<any>((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        folder: `horse-marketplace/${folder}`,
                        resource_type: resourceType,
                        transformation: isVideo ? undefined : [
                            { width: 1920, height: 1080, crop: 'limit', quality: 'auto' },
                        ],
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    },
                );
                uploadStream.end(file.buffer);
            });

            return {
                url: result.secure_url,
                publicId: result.public_id,
                type: isVideo ? 'VIDEO' : 'IMAGE',
            };
        } catch (error) {
            console.error('❌ Cloudinary upload error:', {
                message: error.message,
                http_code: error.http_code,
                name: error.name,
            });
            throw new BadRequestException(
                `Failed to upload file: ${error.message || 'Cloudinary error'}`,
            );
        }
    }

    // Delete file from Cloudinary
    async deleteFile(publicId: string): Promise<void> {
        try {
            const isVideo = publicId.includes('video') || publicId.includes('.mp4');
            await cloudinary.uploader.destroy(publicId, {
                resource_type: isVideo ? 'video' : 'image',
            });
        } catch (error) {
            console.error('Error deleting file from Cloudinary:', error);
        }
    }

    async attachMediaToListing(
        listingId: string,
        media: Array<{ url: string; type: 'IMAGE' | 'VIDEO'; sortOrder: number }>,
    ) {
        // Delete existing media first
        await this.prisma.horseMedia.deleteMany({
            where: { listingId },
        });

        // Create new media entries
        return this.prisma.horseMedia.createMany({
            data: media.map((m, index) => ({
                listingId,
                url: m.url,
                type: m.type,
                sortOrder: m.sortOrder ?? index,
            })),
        });
    }

    async getListingMedia(listingId: string) {
        return this.prisma.horseMedia.findMany({
            where: { listingId },
            orderBy: { sortOrder: 'asc' },
        });
    }
}
