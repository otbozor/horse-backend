import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '@prisma/client';

// Response wrapper
interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message: string;
    timestamp: string;
}

@ApiTags('Users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Delete('me')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Delete own account' })
    @ApiResponse({ status: 200, description: 'Account deleted successfully' })
    async deleteAccount(@CurrentUser() user: User): Promise<ApiResponse<null>> {
        await this.usersService.deleteAccount(user.id);
        return {
            success: true,
            data: null,
            message: 'Account deleted successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Get(':id/profile')
    @Public()
    @ApiOperation({ summary: 'Get public user profile' })
    @ApiResponse({ status: 200, description: 'Returns public user profile' })
    async getPublicProfile(@Param('id') id: string): Promise<ApiResponse<any>> {
        const data = await this.usersService.getPublicProfile(id);
        return {
            success: true,
            data,
            message: 'User profile retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }
}
