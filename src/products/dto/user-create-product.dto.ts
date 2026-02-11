import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum StockStatusEnum {
    IN_STOCK = 'IN_STOCK',
    OUT_OF_STOCK = 'OUT_OF_STOCK',
    PREORDER = 'PREORDER',
}

export enum CurrencyEnum {
    UZS = 'UZS',
    USD = 'USD',
}

export class UserCreateProductDto {
    @IsString()
    title: string;

    @IsOptional()
    @IsString()
    categoryId?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    priceAmount: number;

    @IsOptional()
    @IsEnum(CurrencyEnum)
    priceCurrency?: string;

    @IsOptional()
    @IsBoolean()
    hasDelivery?: boolean;

    @IsOptional()
    @IsEnum(StockStatusEnum)
    stockStatus?: string;
}
