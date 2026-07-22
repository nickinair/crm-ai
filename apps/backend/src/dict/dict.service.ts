import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SysDictItem } from '../entities/SysDictItem';
import { SysDictType } from '../entities/SysDictType';

@Injectable()
export class DictService {
  constructor(
    @InjectRepository(SysDictItem)
    private readonly dictItemRepo: Repository<SysDictItem>,
    @InjectRepository(SysDictType)
    private readonly dictTypeRepo: Repository<SysDictType>,
  ) {}

  async findAllTypes() {
    return this.dictTypeRepo.find({ where: { status: 1 } });
  }

  async findItemsByType(typeCode: string) {
    const dictType = await this.dictTypeRepo.findOne({ where: { dictTypeCode: typeCode, status: 1 } });
    if (!dictType) return [];
    
    return this.dictItemRepo.find({
      where: { dictTypeId: dictType.id, status: 1 },
      order: { sortOrder: 'ASC' }
    });
  }

  async findAllGrouped() {
    const types = await this.findAllTypes();
    const result: Record<string, SysDictItem[]> = {};
    for (const t of types) {
      result[t.dictTypeCode] = await this.findItemsByType(t.dictTypeCode);
    }
    return result;
  }
}
