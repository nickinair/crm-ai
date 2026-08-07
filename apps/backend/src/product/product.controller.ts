import { Controller, Get, Post, Body, Query, Put, Param, UseInterceptors, UploadedFile, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  /** 商品批量导入（PRD 4.5.2）：仅支持 .xlsx/.xls，5M 以内 */
  @RequirePermissions('product:create')
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importProducts(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('文件内容不能为空', HttpStatus.BAD_REQUEST);
    }
    const name = (file.originalname || '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      throw new HttpException('仅支持上传.xlsx  .xls 的文件', HttpStatus.BAD_REQUEST);
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new HttpException('仅支持上传5M内的文件', HttpStatus.BAD_REQUEST);
    }
    return this.productService.importProducts(file);
  }

  @RequirePermissions('product:edit')
  @Put(':id')
  updateProduct(@Param('id') id: string, @Body() updateDto: Partial<BizProduct>) {
    return this.productService.update(id, updateDto);
  }
}
