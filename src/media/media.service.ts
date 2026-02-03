import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MediaService {
    private uploadsDir = path.join(process.cwd(), 'uploads');
    private apiUrl: string;

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
    ) {
        // Get API URL from environment or use default
        this.apiUrl = this.configService.get<string>('API_URL') || 'http://localhost:5000';
        
        // Ensure uploads directory exists
        if (!fs.existsSync(this.uploadsDir)) {
            fs.mkdirSync(this.uploadsDir, { recursive: true });
        }
    }

    // Generate file path for upload
    async getUploadPath(
        entityType: 'listings' | 'blog' | 'events' | 'avatars',
        file: Express.Multer.File,
    ): Promise<{ filePath: string; fileUrl: string; fileName: string }> {
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

        const fileName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
        const entityDir = path.join(this.uploadsDir, entityType);
        
        // Create entity directory if not exists
        if (!fs.existsSync(entityDir)) {
            fs.mkdirSync(entityDir, { recursive: true });
        }

        const filePath = path.join(entityDir, fileName);
        const relativePath = `/uploads/${entityType}/${fileName}`;
        const fileUrl = `${this.apiUrl}${relativePath}`;

        return { filePath, fileUrl, fileName };
    }

    // Save file to disk
    async saveFile(file: Express.Multer.File, filePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            fs.writeFile(filePath, file.buffer, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // Delete file from disk
    async deleteFile(fileUrl: string): Promise<void> {
        try {
            const filePath = path.join(process.cwd(), 'public', fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            console.error('Error deleting file:', error);
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
