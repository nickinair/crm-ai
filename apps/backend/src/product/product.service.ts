import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BizProduct } from '../entities/BizProduct';
import { BizCoupon } from '../entities/BizCoupon';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(BizProduct)
    private readonly productRepo: Repository<BizProduct>,
    @InjectRepository(BizCoupon)
    private readonly couponRepo: Repository<BizCoupon>,
  ) {}

  async create(createDto: any) {
    // Only pick known entity fields
    const allowed = ['productCode', 'productName', 'productType', 'productModel', 'specParams', 'unit', 'costPrice', 'salePrice', 'status'];
    const cleanDto: any = {};
    for (const key of allowed) {
      if (createDto[key] !== undefined) cleanDto[key] = createDto[key];
    }

    if (cleanDto.productCode) {
      const existingCode = await this.productRepo.findOne({ where: { productCode: cleanDto.productCode } });
      if (existingCode) {
        throw new HttpException(`商品编码 ${cleanDto.productCode} 已存在！`, HttpStatus.BAD_REQUEST);
      }
    }
    if (cleanDto.productName) {
      const existingName = await this.productRepo.findOne({ where: { productName: cleanDto.productName } });
      if (existingName) {
        throw new HttpException(`商品名称 ${cleanDto.productName} 已存在！`, HttpStatus.BAD_REQUEST);
      }
    }
    const product = this.productRepo.create(cleanDto);
    return this.productRepo.save(product);
  }

  async getProducts(query: any = {}) {
    const qb = this.productRepo.createQueryBuilder('product');
    if (query.productName) {
      qb.andWhere('product.productName LIKE :productName', { productName: `%${query.productName}%` });
    }
    qb.orderBy('product.createdAt', 'DESC');
    return qb.getMany();
  }

  async getCoupons() {
    return this.couponRepo.find({ where: { status: 1 } });
  }

  async update(id: string, updateDto: any) {
    const allowed = ['productCode', 'productName', 'productType', 'productModel', 'specParams', 'unit', 'costPrice', 'salePrice', 'status'];
    const cleanDto: any = {};
    for (const key of allowed) {
      if (updateDto[key] !== undefined) cleanDto[key] = updateDto[key];
    }
    await this.productRepo.update(id, cleanDto);
    return this.productRepo.findOne({ where: { id } });
  }
}
