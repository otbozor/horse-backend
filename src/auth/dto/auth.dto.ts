import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Telegram autentifikatsiyani boshlash uchun DTO
 * 
 * Qo'llanish:
 * 1. Frontend bu DTO bilan POST /api/auth/telegram/start ga so'rov yuboradi
 * 2. Backend sessionId va botDeepLink qaytaradi
 * 3. Frontend foydalanuvchini Telegram botiga yo'naltiradi
 */
export class TelegramAuthDto {
    @ApiPropertyOptional({
        description: 'Autentifikatsiyadan keyin qaytarish uchun URL',
        example: '/profil',
    })
    @IsOptional()
    @IsString()
    returnUrl?: string;
}

/**
 * Telegram bot callback DTO (Telegram bot tomonidan yuboriladi)
 * 
 * Qo'llanish:
 * 1. Foydalanuvchi Telegram botda /start buyrug'ini beradi
 * 2. Bot foydalanuvchidan telefon raqamini so'raydi
 * 3. Bot bu ma'lumotlar bilan POST /api/auth/telegram/callback ga so'rov yuboradi
 * 4. Backend one-time code qaytaradi
 * 5. Frontend foydalanuvchiga kodni kiritishni so'raydi
 */
export class TelegramCallbackDto {
    @ApiProperty({
        description: 'Telegram autentifikatsiyani boshlashda olingan session ID',
        example: '550e8400-e29b-41d4-a716-446655440000',
    })
    @IsString()
    sessionId: string;

    @ApiProperty({
        description: 'Telegram foydalanuvchisining raqamli ID',
        example: 123456789,
    })
    @IsNumber()
    telegramUserId: number;

    @ApiPropertyOptional({
        description: 'Telegram foydalanuvchisining username (@bilan boshlanmagan)',
        example: 'john_doe',
    })
    @IsOptional()
    @IsString()
    telegramUsername?: string;

    @ApiPropertyOptional({
        description: 'Foydalanuvchining to\'liq ismi',
        example: 'John Doe',
    })
    @IsOptional()
    @IsString()
    displayName?: string;

    @ApiPropertyOptional({
        description: 'Telefon raqami (Telegram kontaktidan olingan)',
        example: '+998901234567',
    })
    @IsOptional()
    @IsString()
    phone?: string;
}

/**
 * Kod tekshirish DTO
 * 
 * Qo'llanish:
 * 1. Foydalanuvchi Telegram botdan olingan kodni kiritadi
 * 2. Frontend bu kodni POST /api/auth/verify ga yuboradi
 * 3. Backend access va refresh tokenlarni qaytaradi
 * 4. Tokenlar httpOnly cookies-ga saqlanadi
 */
export class VerifyCodeDto {
    @ApiProperty({
        description: 'Telegram botdan olingan bir martalik kod (5 daqiqa amal qiladi)',
        example: 'A1B2C3D4',
    })
    @IsString()
    code: string;
}

/**
 * Admin login DTO
 * 
 * Qo'llanish:
 * 1. Admin /admin/login sahifasida username va parolni kiritadi
 * 2. Frontend bu ma'lumotlar bilan POST /api/auth/admin/login ga so'rov yuboradi
 * 3. Backend admin foydalanuvchisini tekshiradi va tokenlarni qaytaradi
 * 4. Tokenlar httpOnly cookies-ga saqlanadi
 * 
 * Eslatma: Faqat isAdmin: true bo'lgan foydalanuvchilar login qila oladi
 */
export class AdminLoginDto {
    @ApiProperty({
        description: 'Admin foydalanuvchisining username',
        example: 'admin',
    })
    @IsString()
    username: string;

    @ApiProperty({
        description: 'Admin foydalanuvchisining parol',
        example: 'admin123',
    })
    @IsString()
    password: string;
}
