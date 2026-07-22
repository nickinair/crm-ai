import { Controller, Get, Post, Body, Query, Put, Param } from '@nestjs/common';
import { ProductService } from './product.service';
import { BizProduct } from '../entities/BizProduct';
import { RequirePermissions } from '../auth/permissions.decorator';

@RequirePermissions('product')
@Controller('api/product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @RequirePermissions('product:create')
  @Post()
  createProduct(@Body() createDto: Partial<BizProduct>) {
    return this.productService.create(createDto);
  }

  @RequirePermissions('product', 'workbench')
  @Get()
  getProducts(@Query() query: any) {
    return this.productService.getProducts(query);
  }

  @RequirePermissions('product', 'workbench')
  @Get('coupon')
  getCoupons() {
    return this.productService.getCoupons();
  }

  @RequirePermissions('product:edit')
  @Put(':id')
  updateProduct(@Param('id') id: string, @Body() updateDto: Partial<BizProduct>) {
    return this.productService.update(id, updateDto);
  }
}
