import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { UserCreateProductDto } from './dto/user-create-product.dto';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
    constructor(private readonly productsService: ProductsService) { }

    @Get()
    @ApiOperation({ summary: 'Barcha mahsulotlarni olish' })
    @ApiResponse({ status: 200, description: 'Mahsulotlar ro\'yxati' })
    @ApiQuery({ name: 'categoryId', required: false })
    @ApiQuery({ name: 'priceMin', required: false })
    @ApiQuery({ name: 'priceMax', required: false })
    @ApiQuery({ name: 'hasDelivery', required: false })
    @ApiQuery({ name: 'stockStatus', required: false })
    @ApiQuery({ name: 'q', required: false })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    async findAll(
        @Query('categoryId') categoryId?: string,
        @Query('priceMin') priceMin?: string,
        @Query('priceMax') priceMax?: string,
        @Query('hasDelivery') hasDelivery?: string,
        @Query('stockStatus') stockStatus?: string,
        @Query('q') q?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.productsService.findAll({
            categoryId,
            priceMin: priceMin ? Number(priceMin) : undefined,
            priceMax: priceMax ? Number(priceMax) : undefined,
            hasDelivery: hasDelivery === 'true',
            stockStatus,
            q,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
        });
    }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Yangi mahsulot yuborish (foydalanuvchi)' })
    @ApiResponse({ status: 201, description: 'Mahsulot yaratildi (ko\'rib chiqish uchun)' })
    async createProduct(
        @Body() dto: UserCreateProductDto,
        @CurrentUser() user: User,
    ) {
        return this.productsService.createProduct(user.id, dto);
    }

    @Get('categories')
    @ApiOperation({ summary: 'Barcha kategoriyalarni olish' })
    @ApiResponse({ status: 200, description: 'Kategoriyalar ro\'yxati' })
    async getCategories() {
        return this.productsService.getCategories();
    }

    @Get('categories/:slug')
    @ApiOperation({ summary: 'Kategoriyani slug bo\'yicha olish' })
    @ApiResponse({ status: 200, description: 'Kategoriya ma\'lumotlari' })
    async getCategoryBySlug(@Param('slug') slug: string) {
        return this.productsService.getCategoryBySlug(slug);
    }

    @Get(':slug')
    @ApiOperation({ summary: 'Mahsulotni slug bo\'yicha olish' })
    @ApiResponse({ status: 200, description: 'Mahsulot ma\'lumotlari' })
    @ApiResponse({ status: 404, description: 'Mahsulot topilmadi' })
    async findBySlug(@Param('slug') slug: string) {
        return this.productsService.findBySlug(slug);
    }
}
