import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
    @ApiProperty({ example: 'Egarlar' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 'egarlar' })
    @IsString()
    @IsNotEmpty()
    slug: string;
}
