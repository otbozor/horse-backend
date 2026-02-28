import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, ListingStatus, SaleSource } from '@prisma/client';

// Response wrapper
interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message: string;
    timestamp: string;
}

@ApiTags('Admin Listings')
@Controller('admin/listings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminListingsController {
    constructor(private readonly adminService: AdminService) { }

    @Get()
    @ApiOperation({ summary: 'Get all listings with filters (admin)' })
    async getAdminListings(
        @CurrentUser() user: User,
        @Query('status') status?: string,
        @Query('isPaid') isPaid?: string,
        @Query('regionId') regionId?: string,
        @Query('saleSource') saleSource?: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.adminService.getAdminListings({
            status: status as ListingStatus | undefined,
            isPaid: isPaid !== undefined ? isPaid === 'true' : undefined,
            regionId,
            saleSource: saleSource as SaleSource | undefined,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
        });
        return {
            success: true,
            data,
            message: 'Listings retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Get('pending')
    @ApiOperation({ summary: 'Get pending listings for moderation' })
    async getPendingListings(
        @CurrentUser() user: User,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.adminService.getPendingListings(page, limit);
        return {
            success: true,
            data,
            message: 'Pending listings retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get listing by ID (admin - any status)' })
    async getListingById(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.adminService.getListingById(id);
        return {
            success: true,
            data,
            message: 'Listing retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post(':id/approve')
    @ApiOperation({ summary: 'Approve a listing' })
    async approveListing(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.adminService.approveListing(id, user.id);
        return {
            success: true,
            data,
            message: 'Listing approved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Delete(':id')
    @ApiOperation({ summary: "E'lonni o'chirish (admin)" })
    async deleteListing(
        @CurrentUser() user: User,
        @Param('id') id: string,
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.adminService.deleteListing(id, user.id);
        return {
            success: true,
            data,
            message: "E'lon muvaffaqiyatli o'chirildi",
            timestamp: new Date().toISOString(),
        };
    }

    @Post(':id/reject')
    @ApiOperation({ summary: 'Reject a listing' })
    async rejectListing(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Body() body: { reason: string },
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.adminService.rejectListing(id, user.id, body.reason);
        return {
            success: true,
            data,
            message: 'Listing rejected successfully',
            timestamp: new Date().toISOString(),
        };
    }
}
