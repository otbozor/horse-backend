import {
    Controller,
    Post,
    Body,
    Res,
    Req,
    Get,
    HttpCode,
    HttpStatus,
    UnauthorizedException,
    ForbiddenException,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { TelegramAuthDto, TelegramCallbackDto, VerifyCodeDto, AdminLoginDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';

interface AuthResponse<T> {
    success: boolean;
    data?: T;
    message: string;
    timestamp: string;
}

interface AdminLoginResponse {
    user: {
        id: string;
        username: string;
        displayName: string;
        isVerified: boolean;
        isAdmin: boolean;
    };
    tokens: {
        accessToken: string;
        refreshToken: string;
        expiresIn: string;
    };
}

interface TelegramStartResponse {
    sessionId: string;
    botDeepLink: string;
    expiresIn: number;
}

interface TelegramCallbackResponse {
    success: boolean;
    code: string;
    expiresIn: number;
}

interface TokenRefreshResponse {
    tokens: {
        accessToken: string;
        refreshToken: string;
        expiresIn: string;
    };
}

interface UserMeResponse {
    id: string;
    username?: string;
    displayName: string;
    avatarUrl?: string;
    isVerified: boolean;
    phone?: string;
    isAdmin: boolean;
}

@ApiTags('Autentifikatsiya')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('admin/login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Admin Login',
        description: 'Admin foydalanuvchisi username va parol bilan login qiladi. Faqat admin roli bilan foydalanuvchilar kirishi mumkin.',
    })
    @ApiBody({
        type: AdminLoginDto,
        examples: {
            example1: {
                summary: 'Admin login misoli',
                value: {
                    username: 'admin',
                    password: 'admin123',
                },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Admin muvaffaqiyatli login qildi',
        schema: {
            example: {
                success: true,
                data: {
                    user: {
                        id: '550e8400-e29b-41d4-a716-446655440000',
                        username: 'admin',
                        displayName: 'Admin',
                        isVerified: true,
                        isAdmin: true,
                    },
                    tokens: {
                        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                        expiresIn: '15m',
                    },
                },
                message: 'Admin login successful',
                timestamp: '2026-02-03T18:22:40.000Z',
            },
        },
    })
    @ApiResponse({
        status: 401,
        description: 'Noto\'g\'ri credentials yoki admin roli yo\'q',
    })
    async adminLogin(
        @Body() dto: AdminLoginDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthResponse<AdminLoginResponse>> {
        const tokens = await this.authService.adminLogin(dto);
        this.authService.setTokenCookies(res, tokens);
        const user = await this.authService.getUserByUsername(dto.username);
        return {
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    isVerified: user.isVerified,
                    isAdmin: user.isAdmin,
                },
                tokens: {
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresIn: '15m',
                },
            },
            message: 'Admin login successful',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('telegram/start')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Telegram Login Boshlash',
        description: 'Telegram orqali autentifikatsiyani boshlaydi. Frontend foydalanuvchini qaytargan botDeepLink-ga yo\'naltiradi.',
    })
    @ApiBody({
        type: TelegramAuthDto,
        examples: {
            example1: {
                summary: 'Telegram auth boshlash',
                value: {
                    returnUrl: '/profil',
                },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Telegram auth session yaratildi',
        schema: {
            example: {
                success: true,
                data: {
                    sessionId: '550e8400-e29b-41d4-a716-446655440000',
                    botDeepLink: 'https://t.me/otbozor_bot?start=550e8400-e29b-41d4-a716-446655440000',
                    expiresIn: 600,
                },
                message: 'Telegram auth session created. Open the bot link to continue.',
                timestamp: '2026-02-03T18:22:40.000Z',
            },
        },
    })
    async startTelegramAuth(
        @Body() dto: TelegramAuthDto,
    ): Promise<AuthResponse<TelegramStartResponse>> {
        const result = await this.authService.startTelegramAuth(dto);
        return {
            success: true,
            data: {
                sessionId: result.sessionId,
                botDeepLink: result.botDeepLink,
                expiresIn: 600,
            },
            message: 'Telegram auth session created. Open the bot link to continue.',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('telegram/callback')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Telegram Bot Callback (Ichki)',
        description: 'Telegram bot tomonidan chaqiriladi. Frontend tomonidan to\'g\'ridan-to\'g\'ri ishlatilmasligi kerak.',
    })
    @ApiBody({
        type: TelegramCallbackDto,
        examples: {
            example1: {
                summary: 'Telegram callback misoli',
                value: {
                    sessionId: '550e8400-e29b-41d4-a716-446655440000',
                    telegramUserId: 123456789,
                    telegramUsername: 'john_doe',
                    displayName: 'John Doe',
                    phone: '+998901234567',
                },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Telegram callback muvaffaqiyatli qayta ishlandi',
    })
    async telegramCallback(
        @Body() dto: TelegramCallbackDto,
    ): Promise<AuthResponse<TelegramCallbackResponse>> {
        const result = await this.authService.handleTelegramCallback(dto);
        if (!result.success) {
            throw new UnauthorizedException(result.error || 'Telegram callback failed');
        }
        return {
            success: true,
            data: {
                success: true,
                code: result.code,
                expiresIn: 300,
            },
            message: 'Telegram verification successful. Use the code to complete login.',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('verify')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Kodni Tekshirish',
        description: 'Telegram botdan olingan bir martalik kodni tekshiradi va tokenlarni qaytaradi.',
    })
    @ApiBody({
        type: VerifyCodeDto,
        examples: {
            example1: {
                summary: 'Kod tekshirish misoli',
                value: {
                    code: 'A1B2C3D4',
                },
            },
        },
    })
    @ApiResponse({
        status: 200,
        description: 'Kod muvaffaqiyatli tekshirildi va tokenlar qaytarildi',
    })
    async verifyCode(
        @Body() dto: VerifyCodeDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthResponse<TokenRefreshResponse>> {
        if (!dto.code || dto.code.trim().length === 0) {
            throw new UnauthorizedException('Verification code is required');
        }
        const tokens = await this.authService.verifyCode(dto.code.trim());
        if (!tokens) {
            throw new UnauthorizedException('Invalid or expired verification code. Please start authentication again.');
        }
        this.authService.setTokenCookies(res, tokens);
        return {
            success: true,
            data: {
                tokens: {
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresIn: '15m',
                },
            },
            message: 'Verification successful. You are now logged in.',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Tokenni Yangilash',
        description: 'Refresh token-ni ishlatib yangi access token oladi. Refresh token cookies-da saqlanadi.',
    })
    @ApiResponse({
        status: 200,
        description: 'Yangi tokenlar qaytarildi',
    })
    async refreshToken(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthResponse<TokenRefreshResponse>> {
        const refreshToken = req.cookies?.refreshToken;
        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token not found in cookies');
        }
        const tokens = await this.authService.refreshTokens(refreshToken);
        this.authService.setTokenCookies(res, tokens);
        return {
            success: true,
            data: {
                tokens: {
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresIn: '15m',
                },
            },
            message: 'Access token refreshed successfully',
            timestamp: new Date().toISOString(),
        };
    }

    @Post('logout')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Logout',
        description: 'Foydalanuvchini logout qiladi va barcha tokenlarni bekor qiladi.',
    })
    @ApiResponse({
        status: 200,
        description: 'Muvaffaqiyatli logout qilindi',
    })
    async logout(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthResponse<null>> {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            await this.authService.logout(refreshToken);
        }
        this.authService.clearTokenCookies(res);
        return {
            success: true,
            message: 'Logged out successfully. All tokens have been invalidated.',
            timestamp: new Date().toISOString(),
        };
    }

    // ============================================================
    // DEV ONLY: Telegram botni simulatsiya qilmasdan test login
    // Faqat NODE_ENV !== 'production' bo'lganda ishlaydi
    // ============================================================
    @Post('dev-login')
    @HttpCode(HttpStatus.OK)
    async devLogin(
        @Body() body: { phone?: string; displayName?: string },
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthResponse<{ tokens: { accessToken: string; refreshToken: string; expiresIn: string } }>> {
        if (process.env.NODE_ENV === 'production') {
            throw new ForbiddenException('Dev login is not available in production');
        }

        const phone = body.phone || '+998901234567';
        const displayName = body.displayName || 'Test User';

        const tokens = await this.authService.devLogin(phone, displayName);
        this.authService.setTokenCookies(res, tokens);

        return {
            success: true,
            data: {
                tokens: {
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresIn: '15m',
                },
            },
            message: '[DEV] Login successful',
            timestamp: new Date().toISOString(),
        };
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Joriy Foydalanuvchi',
        description: 'Joriy autentifikatsiyalangan foydalanuvchining ma\'lumotlarini qaytaradi. JWT token bilan himoyalangan.',
    })
    @ApiResponse({
        status: 200,
        description: 'Foydalanuvchi ma\'lumotlari qaytarildi',
    })
    @ApiResponse({
        status: 401,
        description: 'Noto\'g\'ri yoki yo\'q token',
    })
    async getMe(@CurrentUser() user: User): Promise<AuthResponse<UserMeResponse>> {
        return {
            success: true,
            data: {
                id: user.id,
                username: user.username || undefined,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl || undefined,
                isVerified: user.isVerified,
                phone: user.phone ? `${user.phone.substring(0, 4)}****` : undefined,
                isAdmin: user.isAdmin,
            },
            message: 'User information retrieved successfully',
            timestamp: new Date().toISOString(),
        };
    }
}
