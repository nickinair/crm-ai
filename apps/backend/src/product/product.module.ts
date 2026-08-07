import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { BizProduct } from '../entities/BizProduct';
import { BizCoupon } from '../entities/BizCoupon';
import { SysDictItem } from '../entities/SysDictItem';
import { SysDictType } from '../entities/SysDictType';

@Module({
  imports: [TypeOrmModule.forFeature([BizProduct, BizCoupon, SysDictItem, SysDictType])],
  controllers: [ProductController],
  providers: [ProductService],
})
export class ProductModule {}
