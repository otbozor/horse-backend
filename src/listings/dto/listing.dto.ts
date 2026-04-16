import {
    IsString,
    IsOptional,
    IsNumber,
    IsBoolean,
    IsEnum,
    IsUUID,
    Min,
    Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { HorsePurpose, HorseGender, Currency } from '@prisma/client';

export class CreateListingDto {
    @ApiProperty({ description: 'Listing title' })
    @IsString()
    title: string;

    @ApiProperty({ description: 'Listing description' })
    @IsString()
    description: string;

    @ApiProperty({ description: 'Region ID' })
    @IsUUID()
    regionId: string;

    @ApiPropertyOptional({ description: 'District ID' })
    @IsOptional()
    @IsUUID()
    districtId?: string;

    @ApiPropertyOptional({ enum: HorsePurpose })
    @IsOptional()
    @IsEnum(HorsePurpose)
    purpose?: HorsePurpose;

    @ApiPropertyOptional({ enum: HorseGender })
    @IsOptional()
    @IsEnum(HorseGender)
    gender?: HorseGender;

    @ApiPropertyOptional({ description: 'Breed ID' })
    @IsOptional()
    @IsUUID()
    breedId?: string;

    @ApiPropertyOptional({ description: 'Age in years' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(40)
    ageYears?: number;

    @ApiProperty({ description: 'Horse color' })
    @IsString()
    color: string;

    @ApiProperty({ description: 'Price amount' })
    @IsNumber()
    @Min(0)
    priceAmount: number;

    @ApiPropertyOptional({ enum: Currency, default: 'UZS' })
    @IsOptional()
    @IsEnum(Currency)
    priceCurrency?: Currency;

    @ApiPropertyOptional({ description: 'Has passport document' })
    @IsOptional()
    @IsBoolean()
    hasPassport?: boolean;

    @ApiPropertyOptional({ description: 'Has vaccine' })
    @IsOptional()
    @IsBoolean()
    hasVaccine?: boolean;

    @ApiPropertyOptional({ description: 'Contact name for this listing' })
    @IsOptional()
    @IsString()
    contactName?: string;

    @ApiPropertyOptional({ description: 'Contact phone for this listing' })
    @IsOptional()
    @IsString()
    contactPhone?: string;

    @ApiPropertyOptional({ description: 'Contact telegram for this listing' })
    @IsOptional()
    @IsString()
    contactTelegram?: string;
}

export class UpdateListingDto {
    @ApiPropertyOptional({ description: 'Listing title' })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiPropertyOptional({ description: 'Listing description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ description: 'Region ID' })
    @IsOptional()
    @IsUUID()
    regionId?: string;

    @ApiPropertyOptional({ description: 'District ID' })
    @IsOptional()
    @IsUUID()
    districtId?: string;

    @ApiPropertyOptional({ enum: HorsePurpose })
    @IsOptional()
    @IsEnum(HorsePurpose)
    purpose?: HorsePurpose;

    @ApiPropertyOptional({ enum: HorseGender })
    @IsOptional()
    @IsEnum(HorseGender)
    gender?: HorseGender;

    @ApiPropertyOptional({ description: 'Breed ID' })
    @IsOptional()
    @IsUUID()
    breedId?: string;

    @ApiPropertyOptional({ description: 'Age in years' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(40)
    ageYears?: number;

    @ApiPropertyOptional({ description: 'Horse color' })
    @IsOptional()
    @IsString()
    color?: string;

    @ApiPropertyOptional({ description: 'Price amount' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    priceAmount?: number;

    @ApiPropertyOptional({ enum: Currency, default: 'UZS' })
    @IsOptional()
    @IsEnum(Currency)
    priceCurrency?: Currency;

    @ApiPropertyOptional({ description: 'Has passport document' })
    @IsOptional()
    @IsBoolean()
    hasPassport?: boolean;

    @ApiPropertyOptional({ description: 'Has vaccine' })
    @IsOptional()
    @IsBoolean()
    hasVaccine?: boolean;

    @ApiPropertyOptional({ description: 'Contact name for this listing' })
    @IsOptional()
    @IsString()
    contactName?: string;

    @ApiPropertyOptional({ description: 'Contact phone for this listing' })
    @IsOptional()
    @IsString()
    contactPhone?: string;

    @ApiPropertyOptional({ description: 'Contact telegram for this listing' })
    @IsOptional()
    @IsString()
    contactTelegram?: string;
}

export class ListingsFilterDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    regionId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    districtId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    breedId?: string;

    @ApiPropertyOptional({ enum: HorsePurpose })
    @IsOptional()
    @IsEnum(HorsePurpose)
    purpose?: HorsePurpose;

    @ApiPropertyOptional({ enum: HorseGender })
    @IsOptional()
    @IsEnum(HorseGender)
    gender?: HorseGender;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    priceMin?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    priceMax?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    ageMin?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    ageMax?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    hasPassport?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    hasVaccine?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    hasVideo?: boolean;

    @ApiPropertyOptional({ description: 'Search query' })
    @IsOptional()
    @IsString()
    q?: string;

    @ApiPropertyOptional({ enum: ['newest', 'oldest', 'price_asc', 'price_desc', 'views'] })
    @IsOptional()
    @IsString()
    sort?: 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'views';

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({ default: 20 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    @Max(50)
    limit?: number;
}
