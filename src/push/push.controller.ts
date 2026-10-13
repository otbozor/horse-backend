import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PushService } from './push.service';

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

class PushTokenDto {
    @IsString() @MinLength(20) @MaxLength(4096)
    token: string;

    @IsOptional() @IsIn(['android'])
    platform?: string;
}

@ApiTags('Push')
@Controller('push')
export class PushController {
    constructor(private readonly push: PushService) { }

    /** Android ilova: Firebase tokenini foydalanuvchiga bog'lash (kirgandan keyin, har ochilishda) */
    @Post('register')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    async register(@CurrentUser() user: User, @Body() body: PushTokenDto) {
        await this.push.register(user.id, body.token, body.platform);
        return ok({ enabled: this.push.enabled });
    }

    /** Chiqishda: bu qurilmaga boshqa yuborilmasin (token egasi — shu qurilma) */
    @Delete('register')
    async unregister(@Body() body: PushTokenDto) {
        await this.push.unregister(body.token);
        return ok(true);
    }
}
