import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class MediaService {
    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
    ) {
        // Configure Cloudinary
        cloudinary.config({
            cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
            api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
            api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
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
            console.error('Cloudinary upload error:', error);
            throw new BadRequestException('Failed to upload file');
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
