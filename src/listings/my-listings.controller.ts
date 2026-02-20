import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ListingsService } from './listings.service';
import { CreateListingDto, UpdateListingDto } from './dto/listing.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, ListingStatus } from '@prisma/client';

@ApiTags('My Listings')
@Controller('my/listings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MyListingsController {
    constructor(private readonly listingsService: ListingsService) { }

    @Get()
    @ApiOperation({ summary: 'Get my listings' })
    @ApiResponse({ status: 200, description: 'Returns user listings' })
    async getMyListings(
        @CurrentUser() user: User,
        @Query('status') status?: ListingStatus,
    ) {
        return this.listingsService.getMyListings(user.id, status);
    }

    @Get('favorites')
    @ApiOperation({ summary: 'Get my favorite listings' })
    @ApiResponse({ status: 200, description: 'Returns favorite listings' })
    async getFavorites(@CurrentUser() user: User) {
        return this.listingsService.getFavorites(user.id);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get my listing by ID' })
    @ApiResponse({ status: 200, description: 'Returns single listing for editing' })
    async getMyListingById(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ) {
        const listing = await this.listingsService.getMyListingById(user.id, id);
        return {
            success: true,
            data: listing,
        };
    }

    @Post()
    @ApiOperation({ summary: 'Create new draft listing' })
    @ApiResponse({ status: 201, description: 'Draft created' })
    async createDraft(
        @CurrentUser() user: User,
        @Body() dto: CreateListingDto,
    ) {
        const listing = await this.listingsService.createDraft(user.id, dto);
        return {
            success: true,
            data: listing,
            message: 'Draft created successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update draft listing' })
    @ApiResponse({ status: 200, description: 'Draft updated' })
    async updateDraft(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Body() dto: UpdateListingDto,
    ) {
        const listing = await this.listingsService.updateDraft(user.id, id, dto);
        return {
            success: true,
            data: listing,
            message: 'Draft updated successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post(':id/submit')
    @ApiOperation({ summary: 'Submit listing for review' })
    @ApiResponse({ status: 200, description: 'Submitted for review' })
    async submitForReview(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ) {
        const listing = await this.listingsService.submitForReview(user.id, id);
        return {
            success: true,
            data: listing,
            message: 'Listing submitted for review',
            timestamp: new Date().toISOString(),
        };
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Archive listing' })
    @ApiResponse({ status: 200, description: 'Listing archived' })
    async archiveListing(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ) {
        await this.listingsService.archiveListing(user.id, id);
        return { success: true };
    }

    @Delete(':id/permanent')
    @ApiOperation({ summary: 'Permanently delete archived listing' })
    @ApiResponse({ status: 200, description: 'Listing deleted' })
    async deleteListing(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ) {
        await this.listingsService.deleteListing(user.id, id);
        return { success: true };
    }
}
