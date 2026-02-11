import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminProductsService } from './admin-products.service';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { UpdateProductDto } from '../products/dto/update-product.dto';
import { CreateCategoryDto } from '../products/dto/create-category.dto';

@ApiTags('Admin - Products')
@Controller('admin/products')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminProductsController {
    constructor(private readonly adminProductsService: AdminProductsService) { }

    // ============================================
    // PRODUCTS
    // ============================================

    @Get()
    @ApiOperation({ summary: 'Barcha mahsulotlarni olish (admin)' })
    async getAllProducts(
        @Query('status') status?: string,
        @Query('categoryId') categoryId?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.adminProductsService.getAllProducts({
            status,
            categoryId,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
        });
    }

    @Get(':id')
    @ApiOperation({ summary: 'Mahsulotni ID bo\'yicha olish' })
    async getProductById(@Param('id') id: string) {
        return this.adminProductsService.getProductById(id);
    }

    @Post()
    @ApiOperation({ summary: 'Yangi mahsulot yaratish' })
    async createProduct(@Body() dto: CreateProductDto) {
        return this.adminProductsService.createProduct(dto);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Mahsulotni tahrirlash' })
    async updateProduct(
        @Param('id') id: string,
        @Body() dto: UpdateProductDto,
    ) {
        return this.adminProductsService.updateProduct(id, dto);
    }

    @Put(':id/publish')
    @ApiOperation({ summary: 'Mahsulotni nashr qilish' })
    async publishProduct(@Param('id') id: string) {
        return this.adminProductsService.publishProduct(id);
    }

    @Put(':id/archive')
    @ApiOperation({ summary: 'Mahsulotni arxivlash' })
    async archiveProduct(@Param('id') id: string) {
        return this.adminProductsService.archiveProduct(id);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Mahsulotni o\'chirish' })
    async deleteProduct(@Param('id') id: string) {
        return this.adminProductsService.deleteProduct(id);
    }

    // ============================================
    // CATEGORIES
    // ============================================

    @Get('categories/all')
    @ApiOperation({ summary: 'Barcha kategoriyalarni olish' })
    async getAllCategories() {
        return this.adminProductsService.getAllCategories();
    }

    @Post('categories')
    @ApiOperation({ summary: 'Yangi kategoriya yaratish' })
    async createCategory(@Body() dto: CreateCategoryDto) {
        return this.adminProductsService.createCategory(dto);
    }

    @Put('categories/:id')
    @ApiOperation({ summary: 'Kategoriyani tahrirlash' })
    async updateCategory(
        @Param('id') id: string,
        @Body() dto: CreateCategoryDto,
    ) {
        return this.adminProductsService.updateCategory(id, dto);
    }

    @Delete('categories/:id')
    @ApiOperation({ summary: 'Kategoriyani o\'chirish' })
    async deleteCategory(@Param('id') id: string) {
        return this.adminProductsService.deleteCategory(id);
    }
}
