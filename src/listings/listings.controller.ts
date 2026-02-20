import {
    Controller,
    Get,
    Param,
    Query,
    Post,
    Delete,
    UseGuards,
    Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
import { ListingsService } from './listings.service';
import { ListingsFilterDto } from './dto/listing.dto';
import { Public } from '../common/decorators/public.decorator';
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

@ApiTags('Listings')
@Controller('listings')
export class ListingsController {
    constructor(private readonly listingsService: ListingsService) { }

    @Get()
    @Public()
    @ApiOperation({ summary: 'Get all approved listings with filters' })
    @ApiResponse({ status: 200, description: 'Returns paginated listings' })
    async findAll(@Query() filter: ListingsFilterDto): Promise<ApiResponse<any>> {
        const data = await this.listingsService.findAll(filter);
        return {
            success: true,
            data,
            message: 'Listings retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Get('featured')
    @Public()
    @ApiOperation({ summary: 'Get featured listings for homepage' })
    @ApiResponse({ status: 200, description: 'Returns featured listings' })
    async getFeatured(@Query('limit') limit?: number): Promise<ApiResponse<any>> {
        const data = await this.listingsService.getFeatured(limit);
        return {
            success: true,
            data,
            message: 'Featured listings retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Get(':id')
    @Public()
    @ApiOperation({ summary: 'Get listing by ID or slug' })
    @ApiResponse({ status: 200, description: 'Returns listing details' })
    async findById(@Param('id') idOrSlug: string): Promise<ApiResponse<any>> {
        let listing = await this.listingsService.findById(idOrSlug).catch(() => null);
        if (!listing) {
            listing = await this.listingsService.findBySlug(idOrSlug);
        }
        return {
            success: true,
            data: listing,
            message: 'Listing retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post(':id/view')
    @Public()
    @ApiOperation({ summary: 'Track listing view (called from browser)' })
    async trackView(@Param('id') id: string, @Req() req: Request): Promise<ApiResponse<null>> {
        const user = req.user as User | undefined;
        const sessionId = req.cookies?.sessionId;
        this.listingsService.incrementViewCount(id, user?.id, sessionId).catch(() => { });
        return {
            success: true,
            message: 'View tracked',
            timestamp: new Date().toISOString(),
        };
    }

    @Get(':id/similar')
    @Public()
    @ApiOperation({ summary: 'Get similar listings' })
    @ApiResponse({ status: 200, description: 'Returns similar listings' })
    async findSimilar(@Param('id') id: string): Promise<ApiResponse<any>> {
        const data = await this.listingsService.findSimilar(id);
        return {
            success: true,
            data,
            message: 'Similar listings retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post(':id/favorite')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Add listing to favorites' })
    @ApiResponse({ status: 201, description: 'Added to favorites' })
    async addToFavorites(
        @Param('id') id: string,
        @CurrentUser() user: User,
    ): Promise<ApiResponse<null>> {
        await this.listingsService.addToFavorites(user.id, id);
        return {
            success: true,
            message: 'Added to favorites successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Delete(':id/favorite')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Remove listing from favorites' })
    @ApiResponse({ status: 200, description: 'Removed from favorites' })
    async removeFromFavorites(
        @Param('id') id: string,
        @CurrentUser() user: User,
    ): Promise<ApiResponse<null>> {
        await this.listingsService.removeFromFavorites(user.id, id);
        return {
            success: true,
            message: 'Removed from favorites successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Get(':id/is-favorite')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Check if listing is in favorites' })
    async isFavorite(
        @Param('id') id: string,
        @CurrentUser() user: User,
    ): Promise<ApiResponse<{ isFavorite: boolean }>> {
        const isFav = await this.listingsService.isFavorite(user.id, id);
        return {
            success: true,
            data: { isFavorite: isFav },
            message: 'Favorite status retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }
}
