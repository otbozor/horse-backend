import { Controller, Get, Post, Query, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
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

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Get('dashboard/stats')
    @ApiOperation({ summary: 'Get admin dashboard stats' })
    async getDashboard(@CurrentUser() user: User): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.adminService.getDashboardStats();
        return {
            success: true,
            data,
            message: 'Dashboard stats retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Get('dashboard/region-stats')
    @ApiOperation({ summary: 'Get listings and products count by region' })
    async getRegionStats(@CurrentUser() user: User): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.adminService.getRegionStats();
        return {
            success: true,
            data,
            message: 'Region stats retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Get('users')
    @ApiOperation({ summary: 'Get all users' })
    async getUsers(
        @CurrentUser() user: User,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('status') status?: string,
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.adminService.getUsers(page, limit, status);
        return {
            success: true,
            data,
            message: 'Users retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('users/:id/ban')
    @ApiOperation({ summary: 'Ban a user' })
    async banUser(
        @CurrentUser() user: User,
        @Param('id') userId: string,
    ): Promise<ApiResponse<any>> {
        await this.adminService.banUser(userId, user.id);
        return {
            success: true,
            data: null,
            message: 'User banned successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('users/:id/unban')
    @ApiOperation({ summary: 'Unban a user' })
    async unbanUser(
        @CurrentUser() user: User,
        @Param('id') userId: string,
    ): Promise<ApiResponse<any>> {
        await this.adminService.unbanUser(userId, user.id);
        return {
            success: true,
            data: null,
            message: 'User unbanned successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('users/:id/grant-unlimited-listings')
    @ApiOperation({ summary: 'Grant unlimited listings to a user' })
    async grantUnlimitedListings(
        @CurrentUser() user: User,
        @Param('id') userId: string,
    ): Promise<ApiResponse<any>> {
        const result = await this.adminService.grantUnlimitedListings(userId, user.id);
        return {
            success: true,
            data: null,
            message: result.message,
            timestamp: new Date().toISOString(),
        };
    }

    @Post('users/:id/revoke-unlimited-listings')
    @ApiOperation({ summary: 'Revoke unlimited listings from a user' })
    async revokeUnlimitedListings(
        @CurrentUser() user: User,
        @Param('id') userId: string,
    ): Promise<ApiResponse<any>> {
        const result = await this.adminService.revokeUnlimitedListings(userId, user.id);
        return {
            success: true,
            data: null,
            message: result.message,
            timestamp: new Date().toISOString(),
        };
    }

    @Post('users/:id/add-credits')
    @ApiOperation({ summary: 'Add listing credits to a user' })
    async addListingCredits(
        @CurrentUser() user: User,
        @Param('id') userId: string,
        @Body() body: { amount: number },
    ): Promise<ApiResponse<any>> {
        const result = await this.adminService.addListingCredits(userId, user.id, body.amount);
        return {
            success: true,
            data: null,
            message: result.message,
            timestamp: new Date().toISOString(),
        };
    }

    @Get('audit-logs')
    @ApiOperation({ summary: 'Get audit logs' })
    async getAuditLogs(
        @CurrentUser() user: User,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        const data = await this.adminService.getAuditLogs(page, limit);
        return {
            success: true,
            data,
            message: 'Audit logs retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('change-password')
    @ApiOperation({ summary: 'Change admin password' })
    async changePassword(
        @CurrentUser() user: User,
        @Body() body: { currentPassword: string; newPassword: string },
    ): Promise<ApiResponse<any>> {
        await this.adminService.requireAdmin(user.id);
        await this.adminService.changeAdminPassword(user.id, body.currentPassword, body.newPassword);
        return {
            success: true,
            message: 'Password changed successfully',
            timestamp: new Date().toISOString(),
        };
    }
}
