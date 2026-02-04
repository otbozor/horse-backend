import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BlogService } from '../blog/blog.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { AdminService } from './admin.service';
import { MediaService } from '../media/media.service';

@ApiTags('Admin - Blog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/blog')
export class AdminBlogController {
    constructor(
        private blogService: BlogService,
        private adminService: AdminService,
        private mediaService: MediaService,
    ) { }

    @Get('posts')
    @ApiOperation({
        summary: 'Barcha blog postlarni ko\'rish',
        description: 'Admin barcha blog postlarni ko\'rishi mumkin (DRAFT, PUBLISHED, ARCHIVED). Pagination bilan ro\'yxat qaytaradi.',
    })
    @ApiQuery({
        name: 'status',
        required: false,
        description: 'Post holati (DRAFT, PUBLISHED, ARCHIVED)',
        example: 'DRAFT',
    })
    @ApiQuery({
        name: 'limit',
        required: false,
        description: 'Bir sahifada nechta post ko\'rsatish (default: 20)',
        example: '20',
    })
    @ApiQuery({
        name: 'page',
        required: false,
        description: 'Sahifa raqami (default: 1)',
        example: '1',
    })
    @ApiResponse({
        status: 200,
        description: 'Blog postlar ro\'yxati qaytarildi',
        schema: {
            example: {
                success: true,
                data: [
                    {
                        id: '8c4bc7b4-bff4-4020-9266-127549d06d47',
                        title: 'Otni qanday boqish kerak',
                        slug: 'otni-qanday-boqish-kerak',
                        status: 'DRAFT',
                        viewCount: 0,
                        createdAt: '2026-02-03T13:39:53.717Z',
                    },
                ],
                pagination: {
                    page: 1,
                    limit: 20,
                    total: 1,
                    totalPages: 1,
                },
                message: 'Posts retrieved successfully',
                timestamp: '2026-02-03T13:39:53.733Z',
            },
        },
    })
    async getAllPosts(
        @CurrentUser() user: User,
        @Query('status') status?: string,
        @Query('limit') limit?: string,
        @Query('page') page?: string,
    ) {
        await this.adminService.requireAdmin(user.id);

        const result = await this.blogService.getAllPostsForAdmin({
            status: status as any,
            limit: limit ? parseInt(limit) : 20,
            page: page ? parseInt(page) : 1,
        });

        return {
            success: true,
            data: result.data,
            pagination: result.pagination,
            message: 'Posts retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Get('posts/:id')
    @ApiOperation({
        summary: 'Blog post ID bo\'ylab ko\'rish',
        description: 'Bitta blog post-ning to\'liq ma\'lumotlarini ko\'rish',
    })
    @ApiResponse({
        status: 200,
        description: 'Blog post ma\'lumotlari qaytarildi',
        schema: {
            example: {
                success: true,
                data: {
                    id: '8c4bc7b4-bff4-4020-9266-127549d06d47',
                    title: 'Otni qanday boqish kerak',
                    slug: 'otni-qanday-boqish-kerak',
                    excerpt: 'Otlarni to\'g\'ri boqish ularning sog\'lig\'i uchun juda muhim',
                    content: '# Otni boqish\n\nOtlar o\'txo\'r hayvonlar...',
                    coverImage: '/uploads/blog/036c01d8-b3b6-4715-9089-f327d3986957-1770125993710.png',
                    status: 'DRAFT',
                    viewCount: 0,
                    createdAt: '2026-02-03T13:39:53.717Z',
                    publishedAt: null,
                },
                message: 'Post retrieved successfully',
                timestamp: '2026-02-03T13:39:53.733Z',
            },
        },
    })
    @ApiResponse({
        status: 404,
        description: 'Post topilmadi',
    })
    async getPostById(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ) {
        await this.adminService.requireAdmin(user.id);

        const post = await this.blogService.getPostById(id);

        if (!post) {
            return {
                success: false,
                data: null,
                message: 'Post not found',
                timestamp: new Date().toISOString(),
            };
        }

        return {
            success: true,
            data: post,
            message: 'Post retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('posts')
    @UseInterceptors(FileInterceptor('coverImage'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Yangi blog post yaratish (file upload bilan)',
        description: 'Blog post yaratish va cover rasm yuklash bir vaqtada',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Blog post sarlavhasi',
                    example: 'Otni qanday boqish kerak',
                },
                slug: {
                    type: 'string',
                    description: 'URL slug',
                    example: 'otni-qanday-boqish-kerak',
                },
                excerpt: {
                    type: 'string',
                    description: 'Qisqa tavsif (ixtiyoriy)',
                    example: 'Otlarni to\'g\'ri boqish ularning sog\'lig\'i uchun juda muhim',
                },
                content: {
                    type: 'string',
                    description: 'To\'liq content (Markdown qo\'llanilishi mumkin)',
                    example: '# Otni boqish\n\nOtlar o\'txo\'r hayvonlar...',
                },
                coverImage: {
                    type: 'string',
                    format: 'binary',
                    description: 'Cover rasm fayli (JPEG, PNG, WebP, max 50MB) - ixtiyoriy',
                },
            },
            required: ['title', 'slug', 'content'],
        },
    })
    @ApiResponse({
        status: 201,
        description: 'Blog post muvaffaqiyatli yaratildi',
    })
    async createPost(
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser() user: User,
        @Body() body: any,
    ) {
        await this.adminService.requireAdmin(user.id);

        const { title, slug, excerpt, content } = body;

        if (!title || !slug || !content) {
            throw new BadRequestException('title, slug, va content talab qilinadi');
        }

        let coverImage: string | undefined;

        if (file) {
            const { filePath, fileUrl } = await this.mediaService.getUploadPath('blog', file);
            await this.mediaService.saveFile(file, filePath);
            coverImage = fileUrl;
        }

        const post = await this.blogService.createPost({
            title,
            slug,
            excerpt,
            content,
            coverImage,
            authorId: user.id,
        });

        return {
            success: true,
            data: post,
            message: 'Post created successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Patch('posts/:id')
    @ApiOperation({
        summary: 'Blog post tahrirlash',
        description: 'Blog post ma\'lumotlarini tahrirlash (ixtiyoriy field-lar)',
    })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: 'string',
                    description: 'Blog post sarlavhasi',
                    example: 'Otni qanday boqish kerak - Yangilangan',
                },
                slug: {
                    type: 'string',
                    description: 'URL slug',
                    example: 'otni-qanday-boqish-kerak-yangilangan',
                },
                excerpt: {
                    type: 'string',
                    description: 'Qisqa tavsif',
                    example: 'Yangilangan tavsif',
                },
                content: {
                    type: 'string',
                    description: 'To\'liq content',
                    example: '# Yangilangan content',
                },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Blog post muvaffaqiyatli tahrirlandi',
        schema: {
            example: {
                success: true,
                data: {
                    id: '8c4bc7b4-bff4-4020-9266-127549d06d47',
                    title: 'Otni qanday boqish kerak - Yangilangan',
                    slug: 'otni-qanday-boqish-kerak-yangilangan',
                    status: 'DRAFT',
                    updatedAt: '2026-02-03T13:40:00.000Z',
                },
                message: 'Post updated successfully',
                timestamp: '2026-02-03T13:40:00.000Z',
            },
        },
    })
    async updatePost(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Body() body: any,
    ) {
        await this.adminService.requireAdmin(user.id);

        const post = await this.blogService.updatePost(id, body);

        return {
            success: true,
            data: post,
            message: 'Post updated successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('posts/:id/publish')
    @ApiOperation({
        summary: 'Blog post publish qilish',
        description: 'DRAFT holatidagi post-ni PUBLISHED holatiga o\'tkazish',
    })
    @ApiResponse({
        status: 200,
        description: 'Blog post muvaffaqiyatli publish qilindi',
        schema: {
            example: {
                success: true,
                data: {
                    id: '8c4bc7b4-bff4-4020-9266-127549d06d47',
                    title: 'Otni qanday boqish kerak',
                    status: 'PUBLISHED',
                    publishedAt: '2026-02-03T13:40:00.000Z',
                },
                message: 'Post published successfully',
                timestamp: '2026-02-03T13:40:00.000Z',
            },
        },
    })
    async publishPost(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ) {
        await this.adminService.requireAdmin(user.id);

        const post = await this.blogService.publishPost(id);

        return {
            success: true,
            data: post,
            message: 'Post published successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('posts/:id/archive')
    @ApiOperation({
        summary: 'Blog post archive qilish',
        description: 'Post-ni ARCHIVED holatiga o\'tkazish (o\'chirilmaydi, faqat yashiriladi)',
    })
    @ApiResponse({
        status: 200,
        description: 'Blog post muvaffaqiyatli archive qilindi',
        schema: {
            example: {
                success: true,
                data: {
                    id: '8c4bc7b4-bff4-4020-9266-127549d06d47',
                    title: 'Otni qanday boqish kerak',
                    status: 'ARCHIVED',
                },
                message: 'Post archived successfully',
                timestamp: '2026-02-03T13:40:00.000Z',
            },
        },
    })
    async archivePost(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ) {
        await this.adminService.requireAdmin(user.id);

        const post = await this.blogService.archivePost(id);

        return {
            success: true,
            data: post,
            message: 'Post archived successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Delete('posts/:id')
    @ApiOperation({
        summary: 'Blog post o\'chirish',
        description: 'Blog post-ni database-dan to\'liq o\'chirish (qaytarib bo\'lmaydi)',
    })
    @ApiResponse({
        status: 200,
        description: 'Blog post muvaffaqiyatli o\'chirildi',
        schema: {
            example: {
                success: true,
                data: null,
                message: 'Post deleted successfully',
                timestamp: '2026-02-03T13:40:00.000Z',
            },
        },
    })
    @ApiResponse({
        status: 404,
        description: 'Post topilmadi',
    })
    async deletePost(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ) {
        await this.adminService.requireAdmin(user.id);

        await this.blogService.deletePost(id);

        return {
            success: true,
            data: null,
            message: 'Post deleted successfully',
            timestamp: new Date().toISOString(),
        };
    }
}
