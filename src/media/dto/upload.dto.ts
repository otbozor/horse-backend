import { IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadFileDto {
    @ApiPropertyOptional({ enum: ['listings', 'blog', 'events', 'avatars'], default: 'listings' })
    @IsOptional()
    @IsIn(['listings', 'blog', 'events', 'avatars'])
    folder?: 'listings' | 'blog' | 'events' | 'avatars';
}
