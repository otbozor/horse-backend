import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
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

            let user = await this.prisma.user.findUnique({
                where: { telegramUserId: BigInt(dto.telegramUserId) },
            });

            if (!user) {
                // New user — phone required
                if (!dto.phone) {
                    return { success: false, error: 'Phone number is required for new users' };
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
                        error: 'This phone number is already registered.',
                    };
                }

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
                // Existing user — just update metadata, phone not required
                console.log('✅ Existing user login:', user.id);
                user = await this.prisma.user.update({
                    where: { id: user.id },
                    data: {
                        telegramUsername: dto.telegramUsername || user.telegramUsername,
                        lastLoginAt: new Date(),
                    },
                });
            }

            // Generate 6-digit numeric one-time code (valid for 5 minutes)
            const code = Math.floor(100000 + Math.random() * 900000).toString();

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

        // Delete old refresh tokens for this user (optional - cleanup)
        await this.prisma.refreshToken.deleteMany({
            where: {
                userId,
                expiresAt: { lt: new Date() } // Only delete expired tokens
            },
        });

        // Create new refresh token with upsert to avoid duplicates
        await this.prisma.refreshToken.upsert({
            where: { token: refreshToken },
            create: {
                userId,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
            update: {
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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

        if (user.isAdmin && user.username) {
            return this.generateTokensForAdmin(user.id, user.username);
        }

        return this.generateTokens(user.id, user.telegramUserId!);
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
        // ngrok ishlatilganda ham secure cookie kerak
        const isNgrok = process.env.FRONTEND_URL?.includes('ngrok');
        const useSecure = isProduction || isNgrok;
        const useSameSite = useSecure ? 'none' as const : 'lax' as const;

        console.log('🍪 Setting cookies:', {
            isProduction,
            isNgrok,
            NODE_ENV: process.env.NODE_ENV,
            secure: useSecure,
            sameSite: useSameSite,
        });

        const cookieOptions = {
            httpOnly: true,
            secure: useSecure,
            sameSite: useSameSite,
        };

        res.cookie('accessToken', tokens.accessToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000,   // 7 kun
            path: '/',
        });

        res.cookie('refreshToken', tokens.refreshToken, {
            ...cookieOptions,
            maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 kun
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

    // Create Magic Link for existing users
    async createMagicLink(dto: TelegramCallbackDto): Promise<{ success: boolean; magicLink?: string; code?: string; error?: string }> {
        try {
            console.log('🔗 Creating magic link for existing user:', dto.telegramUserId);

            const session = await this.prisma.telegramAuthSession.findUnique({
                where: { id: dto.sessionId },
            });

            if (!session || session.type !== 'SESSION' || session.expiresAt < new Date()) {
                console.error('❌ Session not found or expired:', dto.sessionId);
                if (session) await this.prisma.telegramAuthSession.delete({ where: { id: dto.sessionId } });
                return { success: false, error: 'Session expired or not found' };
            }

            const user = await this.prisma.user.findUnique({
                where: { telegramUserId: BigInt(dto.telegramUserId) },
            });

            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Generate magic token
            const magicToken = uuidv4();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

            // Save magic token to database
            await this.prisma.telegramAuthSession.create({
                data: {
                    id: `magic:${magicToken}`,
                    type: 'MAGIC_LINK',
                    data: JSON.stringify({
                        userId: user.id,
                        telegramUserId: dto.telegramUserId,
                        originalSessionId: dto.sessionId
                    }),
                    expiresAt,
                },
            });

            const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://otbozor.uz';
            const magicLink = `${frontendUrl}/auth/magic?token=${magicToken}`;

            return { success: true, magicLink };
        } catch (error) {
            console.error('❌ Magic link creation error:', error);
            return { success: false, error: 'Failed to create magic link' };
        }
    }

    // Create Magic Link for new users (with phone)
    async createMagicLinkWithPhone(dto: TelegramCallbackDto): Promise<{ success: boolean; magicLink?: string; code?: string; error?: string }> {
        try {
            console.log('🔗 Creating magic link for new user:', dto.telegramUserId);

            if (!dto.phone) {
                return { success: false, error: 'Phone number is required' };
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
                return { success: false, error: 'This phone number is already registered' };
            }

            // Create new user
            const user = await this.prisma.user.create({
                data: {
                    telegramUserId: BigInt(dto.telegramUserId),
                    telegramUsername: dto.telegramUsername || `user_${dto.telegramUserId}`,
                    displayName: dto.displayName || dto.telegramUsername || `User ${dto.telegramUserId}`,
                    phone: dto.phone,
                    isVerified: true,
                    status: 'ACTIVE',
                },
            });

            // Generate magic token
            const magicToken = uuidv4();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

            // Save magic token to database
            await this.prisma.telegramAuthSession.create({
                data: {
                    id: `magic:${magicToken}`,
                    type: 'MAGIC_LINK',
                    data: JSON.stringify({
                        userId: user.id,
                        telegramUserId: dto.telegramUserId,
                        originalSessionId: dto.sessionId
                    }),
                    expiresAt,
                },
            });

            const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://otbozor.uz';
            const magicLink = `${frontendUrl}/auth/magic?token=${magicToken}`;

            return { success: true, magicLink };
        } catch (error) {
            console.error('❌ Magic link with phone creation error:', error);
            return { success: false, error: 'Failed to create magic link' };
        }
    }

    // Verify Magic Link and login user
    async verifyMagicLink(token: string): Promise<{ success: boolean; tokens?: TokenPair; error?: string }> {
        try {
            console.log('🔍 Verifying magic link token:', token);

            const magicSession = await this.prisma.telegramAuthSession.findUnique({
                where: { id: `magic:${token}` },
            });

            if (!magicSession || magicSession.type !== 'MAGIC_LINK' || magicSession.expiresAt < new Date()) {
                console.error('❌ Magic link not found or expired:', token);
                if (magicSession) {
                    await this.prisma.telegramAuthSession.delete({ where: { id: `magic:${token}` } });
                }
                return { success: false, error: 'Magic link expired or invalid' };
            }

            const { userId, telegramUserId, originalSessionId } = JSON.parse(magicSession.data);

            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });

            if (!user || user.status !== 'ACTIVE') {
                return { success: false, error: 'User not found or inactive' };
            }

            // Update last login
            await this.prisma.user.update({
                where: { id: user.id },
                data: { lastLoginAt: new Date() },
            });

            // Generate tokens
            const tokens = await this.generateTokens(user.id, BigInt(telegramUserId));

            // Clean up sessions
            await this.prisma.telegramAuthSession.deleteMany({
                where: {
                    OR: [
                        { id: `magic:${token}` },
                        { id: originalSessionId }
                    ]
                }
            });

            console.log('✅ Magic link login successful for user:', user.id);
            return { success: true, tokens };
        } catch (error) {
            console.error('❌ Magic link verification error:', error);
            return { success: false, error: 'Failed to verify magic link' };
        }
    }
}
