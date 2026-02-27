import { Controller, Get, Param, Query } from '@nestjs/common';
import { BlogService } from './blog.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Blog')
@Controller('blog')
export class BlogController {
    constructor(private blogService: BlogService) { }

    @Get('posts')
    @ApiOperation({ summary: 'Get all published blog posts' })
    async getPosts(
        @Query('limit') limit?: string,
        @Query('page') page?: string,
    ) {
        const result = await this.blogService.getPosts({
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

    @Get('posts/recent')
    @ApiOperation({ summary: 'Get recent blog posts' })
    async getRecentPosts(@Query('limit') limit?: string) {
        const posts = await this.blogService.getRecentPosts(
            limit ? parseInt(limit) : 5
        );

        return {
            success: true,
            data: posts,
            message: 'Recent posts retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Get('posts/:slug')
    @ApiOperation({ summary: 'Get blog post by slug' })
    async getPostBySlug(@Param('slug') slug: string) {
        const post = await this.blogService.getPostBySlug(slug);

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
}
