import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { HandoverService } from '../handover/handover.service';
import { AdminService } from './admin.service';

const ok = <T>(data: T) => ({ success: true, data, message: 'OK', timestamp: new Date().toISOString() });

class HandoverDto {
    @IsString() @MinLength(2) @MaxLength(80)
    name: string;

    @IsString() @MinLength(9) @MaxLength(20)
    phone: string;
}

/** Admin sotuvchi nomidan joylagan e'lon: sotuvchiga biriktirish, darhol tasdiqlash, QR havola */
@ApiTags('Admin')
@Controller('admin/listings')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminHandoverController {
    constructor(
        private readonly handover: HandoverService,
        private readonly admin: AdminService,
        private readonly prisma: PrismaService,
    ) { }

    @Post(':id/handover')
    async assign(@CurrentUser() me: User, @Param('id') id: string, @Body() body: HandoverDto) {
        const listing = await this.prisma.horseListing.findUnique({ where: { id }, select: { userId: true, user: { select: { isAdmin: true } } } });
        if (!listing) throw new NotFoundException("E'lon topilmadi");
        // Faqat admin akkauntidagi e'lon topshiriladi (boshqa sotuvchining e'lonini birovga o'tkazib yubormaslik uchun)
        if (!listing.user.isAdmin) throw new ForbiddenException("Bu e'lon allaqachon sotuvchiga tegishli");
        const seller = await this.handover.findOrCreateSeller(body.name, body.phone);
        await this.prisma.horseListing.update({
            where: { id },
            data: { userId: seller.id, contactName: body.name.trim(), contactPhone: seller.phone, contactTelegram: null, isPaid: true },
        });
        // Admin joyladi — moderatsiyadan o'tgan hisoblanadi, darhol bozorga chiqadi
        await this.admin.approveListing(id, me.id);
        return ok(await this.handover.info(id));
    }

    @Get(':id/handover')
    async info(@Param('id') id: string) {
        return ok(await this.handover.info(id));
    }
}
