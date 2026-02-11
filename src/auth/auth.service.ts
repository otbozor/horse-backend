import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { TelegramAuthDto, TelegramCallbackDto, AdminLoginDto } from './dto/auth.dto';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

export interface JwtPayload {
    sub: string;
    telegramUserId?: string;
    username?: string;
    isAdmin?: boolean;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private configService: ConfigService,
        private usersService: UsersService,
    ) { }

    // Admin login with username/password
    async adminLogin(dto: AdminLoginDto): Promise<TokenPair> {
        const user = await this.prisma.user.findUnique({
            where: { username: dto.username },
        });

        if (!user || !user.password) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!user.isAdmin) {
            throw new UnauthorizedException('Admin access required');
        }

        await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        return this.generateTokensForAdmin(user.id, user.username!);
    }

    // Start Telegram auth flow
    async startTelegramAuth(dto: TelegramAuthDto): Promise<{ botDeepLink: string; sessionId: string }> {
        const sessionId = uuidv4();
        const botUsername = this.configService.get<string>('TELEGRAM_BOT_USERNAME');

        // Clean expired sessions
        await this.cleanExpiredSessions();

        // Store session in DB (expires in 10 minutes)
        await this.prisma.telegramAuthSession.create({
            data: {
                id: sessionId,
                type: 'SESSION',
                data: dto.returnUrl || '',
                expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            },
        });

        const botDeepLink = `https://t.me/${botUsername}?start=${sessionId}`;
        return { botDeepLink, sessionId };
    }

    // Get user by username
    async getUserByUsername(username: string) {
        return this.prisma.user.findUnique({
            where: { username },
        });
    }

    // Handle callback from Telegram bot
    async handleTelegramCallback(dto: TelegramCallbackDto): Promise<{ success: boolean; code?: string; error?: string }> {
        try {
            console.log('📞 Telegram callback received:', {
                sessionId: dto.sessionId,
                telegramUserId: dto.telegramUserId,
                phone: dto.phone,
            });

            const session = await this.prisma.telegramAuthSession.findUnique({
                where: { id: dto.sessionId },
            });

            if (!session || session.type !== 'SESSION' || session.expiresAt < new Date()) {
                console.error('❌ Session not found or expired:', dto.sessionId);
                if (session) await this.prisma.telegramAuthSession.delete({ where: { id: dto.sessionId } });
                return { success: false, error: 'Session expired or not found. Please start authentication again.' };
            }

            if (!dto.phone) {
                return { success: false, error: 'Phone number is required for registration' };
            }

            if (!/^\+?[1-9]\d{1,14}$/.test(dto.phone)) {
                return { success: false, error: 'Invalid phone number format' };
            }

            const existingUserWithPhone = await this.prisma.user.findFirst({
                where: {
                    phone: dto.phone,
                    NOT: { telegramUserId: BigInt(dto.telegramUserId) },
                },
            });

            if (existingUserWithPhone) {
                return {
                    success: false,
                    error: 'This phone number is already registered. Please use a different phone number or login with your existing account.',
                };
            }

            let user = await this.prisma.user.findUnique({
                where: { telegramUserId: BigInt(dto.telegramUserId) },
            });

            if (!user) {
                console.log('✅ Creating new user:', dto.telegramUserId);
                user = await this.prisma.user.create({
                    data: {
                        telegramUserId: BigInt(dto.telegramUserId),
                        telegramUsername: dto.telegramUsername || `user_${dto.telegramUserId}`,
                        displayName: dto.displayName || dto.telegramUsername || `User ${dto.telegramUserId}`,
                        phone: dto.phone,
                        isVerified: true,
                        status: 'ACTIVE',
                    },
                });
            } else {
                console.log('✅ Updating existing user:', user.id);
                user = await this.prisma.user.update({
                    where: { id: user.id },
                    data: {
                        telegramUsername: dto.telegramUsername || user.telegramUsername,
                        phone: dto.phone,
                        isVerified: true,
                        lastLoginAt: new Date(),
                    },
                });
            }

            // Generate one-time code (valid for 5 minutes)
            const code = uuidv4().substring(0, 8).toUpperCase();

            // Remove original session
            await this.prisma.telegramAuthSession.delete({ where: { id: dto.sessionId } });

            // Store code in DB
            await this.prisma.telegramAuthSession.create({
                data: {
                    id: `code:${code}`,
                    type: 'CODE',
                    data: user.id,
                    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
                },
            });

            console.log('✅ Code generated:', code);
            return { success: true, code };
        } catch (error) {
            console.error('❌ Telegram callback error:', error);
            return { success: false, error: `Database error: ${error.message}` };
        }
    }

    // Verify code and issue tokens
    async verifyCode(code: string): Promise<TokenPair | null> {
        const session = await this.prisma.telegramAuthSession.findUnique({
            where: { id: `code:${code}` },
        });

        if (!session) {
            return null;
        }

        // Check expiry
        if (new Date() > session.expiresAt) {
            await this.prisma.telegramAuthSession.delete({ where: { id: `code:${code}` } });
            return null;
        }

        const userId = session.data;
        await this.prisma.telegramAuthSession.delete({ where: { id: `code:${code}` } });

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            return null;
        }

        await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        return this.generateTokens(user.id, user.telegramUserId);
    }

    // Generate access and refresh tokens
    async generateTokens(userId: string, telegramUserId: bigint): Promise<TokenPair> {
        const payload: JwtPayload = {
            sub: userId,
            telegramUserId: telegramUserId.toString(),
        };

        const accessToken = this.jwtService.sign(payload);

        const refreshToken = this.jwtService.sign(payload, {
            secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
        });

        await this.prisma.refreshToken.create({
            data: {
                userId,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        return { accessToken, refreshToken };
    }

    // Generate tokens for admin (username-based)
    async generateTokensForAdmin(userId: string, username: string): Promise<TokenPair> {
        const payload: JwtPayload = {
            sub: userId,
            username,
            isAdmin: true,
        };

        const accessToken = this.jwtService.sign(payload);

        const refreshToken = this.jwtService.sign(payload, {
            secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
        });

        await this.prisma.refreshToken.create({
            data: {
                userId,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        return { accessToken, refreshToken };
    }

    // Refresh tokens
    async refreshTokens(refreshToken: string): Promise<TokenPair> {
        const storedToken = await this.prisma.refreshToken.findUnique({
            where: { token: refreshToken },
        });

        if (!storedToken || storedToken.expiresAt < new Date()) {
            throw new UnauthorizedException('Invalid refresh token');
        }

        const user = await this.prisma.user.findUnique({
            where: { id: storedToken.userId },
        });

        if (!user || user.status !== 'ACTIVE') {
            throw new UnauthorizedException('User not found or banned');
        }

        await this.prisma.refreshToken.delete({
            where: { id: storedToken.id },
        });

        return this.generateTokens(user.id, user.telegramUserId);
    }

    // Logout - invalidate refresh token
    async logout(refreshToken: string): Promise<void> {
        await this.prisma.refreshToken.deleteMany({
            where: { token: refreshToken },
        });
    }

    // Set cookies on response
    setTokenCookies(res: Response, tokens: TokenPair): void {
        const isProduction = process.env.NODE_ENV === 'production';

        console.log('🍪 Setting cookies:', {
            isProduction,
            NODE_ENV: process.env.NODE_ENV,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
        });

        const cookieOptions = {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' as const : 'lax' as const,
        };

        res.cookie('accessToken', tokens.accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000,
            path: '/',
        });

        res.cookie('refreshToken', tokens.refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });

        console.log('✅ Cookies set successfully');
    }

    // Clear cookies
    clearTokenCookies(res: Response): void {
        const isProduction = process.env.NODE_ENV === 'production';

        const cookieOptions = {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' as const : 'lax' as const,
            path: '/',
        };

        res.clearCookie('accessToken', cookieOptions);
        res.clearCookie('refreshToken', cookieOptions);
    }

    // DEV ONLY: Telegram botni simulatsiya qilmasdan test login
    async devLogin(phone: string, displayName: string): Promise<TokenPair> {
        const fakeTelegramId = BigInt(9999999999);

        let user = await this.prisma.user.findUnique({
            where: { telegramUserId: fakeTelegramId },
        });

        if (!user) {
            user = await this.prisma.user.create({
                data: {
                    telegramUserId: fakeTelegramId,
                    telegramUsername: 'dev_test_user',
                    displayName,
                    phone,
                    isVerified: true,
                    status: 'ACTIVE',
                },
            });
        } else {
            user = await this.prisma.user.update({
                where: { id: user.id },
                data: { displayName, phone, lastLoginAt: new Date() },
            });
        }

        return this.generateTokens(user.id, user.telegramUserId);
    }

    // Clean expired sessions from DB
    private async cleanExpiredSessions(): Promise<void> {
        await this.prisma.telegramAuthSession.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });
    }
}
