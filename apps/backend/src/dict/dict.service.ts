import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
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

  /**
   * 查询某字典类型下的字典项
   * @param parentValue 联动字典的父级值（如商品属性按商品类型过滤）；不传则返回该类型全部字典项
   */
  async findItemsByType(typeCode: string, parentValue?: string) {
    const dictType = await this.dictTypeRepo.findOne({ where: { dictTypeCode: typeCode, status: 1 } });
    if (!dictType) return [];

    const where: any = { dictTypeId: dictType.id, status: 1 };
    if (parentValue) where.parentValue = parentValue;

    return this.dictItemRepo.find({
      where,
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

  // ============================================================
  // 配置管理（数据字典维护）
  // ============================================================

  /** 字典类型列表（含各类型下的字典项数量），管理页用；含停用项 */
  async listTypesForAdmin(keyword?: string) {
    const qb = this.dictTypeRepo.createQueryBuilder('t').orderBy('t.id', 'ASC');
    if (keyword) {
      qb.where('(t.dictTypeCode LIKE :kw OR t.dictTypeName LIKE :kw)', { kw: `%${keyword}%` });
    }
    const types = await qb.getMany();
    if (!types.length) return [];
    const counts = await this.dictItemRepo
      .createQueryBuilder('i')
      .select('i.dictTypeId', 'typeId')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('i.dictTypeId')
      .getRawMany();
    const map = new Map(counts.map((c: any) => [String(c.typeId), Number(c.cnt)]));
    return types.map(t => ({ ...t, itemCount: map.get(String(t.id)) || 0 }));
  }

  /** 某字典类型下的全部字典项（含停用），管理页用 */
  async listItemsForAdmin(typeId: string) {
    return this.dictItemRepo.find({
      where: { dictTypeId: typeId },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  async createItem(data: any) {
    const { dictTypeId, itemLabel, itemValue, parentValue, sortOrder, status } = data;
    if (!dictTypeId) throw new BadRequestException('缺少字典类型');
    if (!itemLabel || !String(itemLabel).trim()) throw new BadRequestException('请填写显示名称');
    if (itemValue === undefined || itemValue === null || String(itemValue).trim() === '') {
      throw new BadRequestException('请填写存储值');
    }
    const type = await this.dictTypeRepo.findOne({ where: { id: dictTypeId } });
    if (!type) throw new NotFoundException('字典类型不存在');

    const value = String(itemValue).trim();
    // 同类型下存储值唯一（uk_type_item_code 也依赖 item_code）
    const dup = await this.dictItemRepo.findOne({ where: { dictTypeId, itemValue: value } });
    if (dup) throw new BadRequestException(`存储值「${value}」在该字典下已存在`);

    const item = this.dictItemRepo.create({
      dictTypeId,
      itemCode: value,
      itemLabel: String(itemLabel).trim(),
      itemValue: value,
      parentValue: parentValue ? String(parentValue) : null,
      sortOrder: Number(sortOrder ?? 0),
      status: status === undefined ? 1 : Number(status),
    });
    return this.dictItemRepo.save(item);
  }

  async updateItem(id: string, data: any) {
    const item = await this.dictItemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('字典项不存在');

    if (data.itemValue !== undefined) {
      const value = String(data.itemValue).trim();
      if (!value) throw new BadRequestException('请填写存储值');
      const dup = await this.dictItemRepo.findOne({
        where: { dictTypeId: item.dictTypeId, itemValue: value, id: Not(id) },
      });
      if (dup) throw new BadRequestException(`存储值「${value}」在该字典下已存在`);
      item.itemValue = value;
      item.itemCode = value;
    }
    if (data.itemLabel !== undefined) {
      if (!String(data.itemLabel).trim()) throw new BadRequestException('请填写显示名称');
      item.itemLabel = String(data.itemLabel).trim();
    }
    if (data.parentValue !== undefined) item.parentValue = data.parentValue ? String(data.parentValue) : null;
    if (data.sortOrder !== undefined) item.sortOrder = Number(data.sortOrder);
    if (data.status !== undefined) item.status = Number(data.status);

    return this.dictItemRepo.save(item);
  }

  async deleteItem(id: string) {
    const item = await this.dictItemRepo.findOne({ where: { id } });
    if (!item) return { success: true };
    await this.dictItemRepo.delete(id);
    return { success: true };
  }
}
