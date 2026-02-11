import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsEnum, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { StockStatus } from '@prisma/client';

export class CreateProductDto {
    @ApiProperty({ example: 'Ot uchun egar' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ example: 'ot-uchun-egar' })
    @IsString()
    @IsNotEmpty()
    slug: string;

    @ApiProperty({ example: 'uuid', required: false })
    @IsString()
    @IsOptional()
    categoryId?: string;

    @ApiProperty({ example: 'Yuqori sifatli egar', required: false })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ example: 500000 })
    @IsNumber()
    @IsNotEmpty()
    priceAmount: number;

    @ApiProperty({ example: 'UZS', default: 'UZS' })
    @IsString()
    @IsOptional()
    priceCurrency?: string;

    @ApiProperty({ example: true, default: false })
    @IsBoolean()
    @IsOptional()
    hasDelivery?: boolean;

    @ApiProperty({ enum: StockStatus, default: 'IN_STOCK' })
    @IsEnum(StockStatus)
    @IsOptional()
    stockStatus?: StockStatus;

    @ApiProperty({ example: ['url1', 'url2'], required: false })
    @IsArray()
    @IsOptional()
    mediaUrls?: string[];
}
