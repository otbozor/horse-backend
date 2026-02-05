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
    telegramUserId?: string; // Changed from bigint to string for JSON serialization
    username?: string;
    isAdmin?: boolean;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

@Injectable()
export class AuthService {
    private pendingSessions: Map<string, { returnUrl?: string; createdAt: Date }> = new Map();

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

        // Check if user is admin
        if (!user.isAdmin) {
            throw new UnauthorizedException('Admin access required');
        }

        // Update last login
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

        // Store session for verification
        this.pendingSessions.set(sessionId, {
            returnUrl: dto.returnUrl,
            createdAt: new Date(),
        });

        // Clean old sessions (older than 10 minutes)
        this.cleanOldSessions();

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
        const session = this.pendingSessions.get(dto.sessionId);

        if (!session) {
            return { success: false, error: 'Session expired or not found. Please start authentication again.' };
        }

        // Phone number is required
        if (!dto.phone) {
            return { success: false, error: 'Phone number is required for registration' };
        }

        // Validate phone number format
        if (!/^\+?[1-9]\d{1,14}$/.test(dto.phone)) {
            return { success: false, error: 'Invalid phone number format' };
        }

        // Check if phone number already exists for a different Telegram user
        const existingUserWithPhone = await this.prisma.user.findFirst({
            where: {
                phone: dto.phone,
                NOT: {
                    telegramUserId: BigInt(dto.telegramUserId)
                }
            },
        });

        if (existingUserWithPhone) {
            return {
                success: false,
                error: 'This phone number is already registered. Please use a different phone number or login with your existing account.'
            };
        }

        // Create or update user
        let user = await this.prisma.user.findUnique({
            where: { telegramUserId: BigInt(dto.telegramUserId) },
        });

        if (!user) {
            // New user registration
            user = await this.prisma.user.create({
                data: {
                    telegramUserId: BigInt(dto.telegramUserId),
                    telegramUsername: dto.telegramUsername || `user_${dto.telegramUserId}`,
                    displayName: dto.displayName || dto.telegramUsername || `User ${dto.telegramUserId}`,
                    phone: dto.phone,
                    isVerified: true, // Auto-verify since phone is from Telegram
                    status: 'ACTIVE',
                },
            });
        } else {
            // Existing user login
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
        const codeExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Store code with user ID and expiry
        this.pendingSessions.set(`code:${code}`, {
            returnUrl: user.id, // Using returnUrl field to store userId
            createdAt: codeExpiry,
        });

        // Remove original session
        this.pendingSessions.delete(dto.sessionId);

        return {
            success: true,
            code,
        };
    }

    // Verify code and issue tokens
    async verifyCode(code: string): Promise<TokenPair | null> {
        const session = this.pendingSessions.get(`code:${code}`);

        if (!session) {
            return null;
        }

        // Check if code has expired (createdAt field stores expiry time)
        if (new Date() > session.createdAt) {
            this.pendingSessions.delete(`code:${code}`);
            return null;
        }

        const userId = session.returnUrl; // We stored userId here
        this.pendingSessions.delete(`code:${code}`);

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            return null;
        }

        // Update last login
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
            telegramUserId: telegramUserId.toString(), // Convert BigInt to string
        };

        const accessToken = this.jwtService.sign(payload);

        const refreshToken = this.jwtService.sign(payload, {
            secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
        });

        // Store refresh token in database
        await this.prisma.refreshToken.create({
            data: {
                userId,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
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

        // Store refresh token in database
        await this.prisma.refreshToken.create({
            data: {
                userId,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
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

        // Delete old refresh token
        await this.prisma.refreshToken.delete({
            where: { id: storedToken.id },
        });

        // Generate new tokens
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

        res.cookie('accessToken', tokens.accessToken, {
            httpOnly: true,
            secure: isProduction, // HTTPS only in production
            sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-domain in production
            maxAge: 15 * 60 * 1000, // 15 minutes
        });

        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/api/auth/refresh',
        });
    }

    // Clear cookies
    clearTokenCookies(res: Response): void {
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    }

    // Clean old sessions (older than 10 minutes)
    private cleanOldSessions(): void {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        for (const [key, session] of this.pendingSessions.entries()) {
            if (session.createdAt < tenMinutesAgo) {
                this.pendingSessions.delete(key);
            }
        }
    }
}
