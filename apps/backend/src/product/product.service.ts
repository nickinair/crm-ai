import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BizProduct } from '../entities/BizProduct';
import { BizCoupon } from '../entities/BizCoupon';
import { SysDictItem } from '../entities/SysDictItem';
import { SysDictType } from '../entities/SysDictType';

/** 商品批量导入模板表头（顺序即列顺序，PRD 4.5.2 配图 image42） */
export const PRODUCT_IMPORT_HEADERS = [
  { key: 'productCode', label: '商品编码', required: true, maxLength: 32 },
  { key: 'productName', label: '商品名称', required: true, maxLength: 30 },
  { key: 'productType', label: '商品类型', required: true, dict: 'product_type' },
  { key: 'productAttribute', label: '商品属性', required: false, dict: 'product_attribute', parentKey: 'productType' },
  { key: 'applicableModel', label: '适用车型', required: false, dict: 'product_applicable_model' },
  { key: 'installAttribute', label: '安装属性', required: false, dict: 'product_install_attribute' },
  { key: 'unit', label: '单位', required: true, dict: 'product_unit' },
  { key: 'costPrice', label: '成本价', required: false, numeric: true },
  { key: 'salePrice', label: '售价', required: true, numeric: true },
] as const;

/** 表头文案：必填列在模板中带「(必填)」后缀 */
export const headerTitle = (h: { label: string; required: boolean }) =>
  h.required ? `${h.label}(必填)` : h.label;

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(BizProduct)
    private readonly productRepo: Repository<BizProduct>,
    @InjectRepository(BizCoupon)
    private readonly couponRepo: Repository<BizCoupon>,
    @InjectRepository(SysDictItem)
    private readonly dictItemRepo: Repository<SysDictItem>,
    @InjectRepository(SysDictType)
    private readonly dictTypeRepo: Repository<SysDictType>,
  ) {}

  async create(createDto: any) {
    // Only pick known entity fields
    const allowed = ['productCode', 'productName', 'productType', 'productAttribute', 'productModel', 'specParams',
      'applicableModel', 'installAttribute', 'productRemark', 'unit', 'costPrice', 'salePrice', 'status'];
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

  /**
   * 商品列表查询（PRD 4.5.1）
   * 商品名称模糊查询；商品编码/商品类型/商品属性/状态精确查询；创建时间为闭区间
   */
  async getProducts(query: any = {}) {
    const qb = this.productRepo.createQueryBuilder('product');

    if (query.productName) {
      qb.andWhere('product.productName LIKE :productName', { productName: `%${query.productName}%` });
    }
    if (query.productCode) {
      qb.andWhere('product.productCode = :productCode', { productCode: query.productCode });
    }
    if (query.productType) {
      qb.andWhere('product.productType = :productType', { productType: query.productType });
    }
    if (query.productAttribute) {
      qb.andWhere('product.productAttribute = :productAttribute', { productAttribute: query.productAttribute });
    }
    if (query.status !== undefined && query.status !== '' && query.status !== null) {
      qb.andWhere('product.status = :status', { status: Number(query.status) });
    }
    // 创建时间区间：只要在该时间段内创建的均可查到（含当天）
    if (query.createdAtStart) {
      qb.andWhere('product.createdAt >= :createdAtStart', { createdAtStart: `${query.createdAtStart} 00:00:00` });
    }
    if (query.createdAtEnd) {
      qb.andWhere('product.createdAt <= :createdAtEnd', { createdAtEnd: `${query.createdAtEnd} 23:59:59` });
    }

    qb.orderBy('product.createdAt', 'DESC');
    return qb.getMany();
  }

  async getCoupons() {
    return this.couponRepo.find({ where: { status: 1 } });
  }

  /**
   * 商品批量导入（PRD 4.5.2）
   *
   * 校验顺序与 PRD 校验表一致：
   *   文件级：空表格 / 表头有误
   *   行 级：必填未填 → 字段超长 → 枚举不匹配 → 表内重复 → 系统已存在
   * 校验通过的行直接入库；失败行连同「错误信息」返回，供前端生成错误文件。
   */
  async importProducts(file: Express.Multer.File) {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const ws = workbook.worksheets[0];

    // ---- 文件级校验 1：空表格 ----
    if (!ws || ws.rowCount === 0) {
      throw new HttpException('文件内容不能为空', HttpStatus.BAD_REQUEST);
    }

    // ---- 文件级校验 2：表头必须与模板一致 ----
    const headerRow = ws.getRow(1);
    const actualHeaders: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell: any) => {
      actualHeaders.push(String(cell.text ?? cell.value ?? '').trim());
    });
    const expectedHeaders = PRODUCT_IMPORT_HEADERS.map(h => headerTitle(h));
    const headerMismatch =
      actualHeaders.length < expectedHeaders.length ||
      expectedHeaders.some((h, i) => actualHeaders[i] !== h);
    if (headerMismatch) {
      throw new HttpException('文件表头有误，请下载上传模板，根据模板表头进行上传', HttpStatus.BAD_REQUEST);
    }

    // ---- 读取数据行 ----
    type Row = { _rowNumber: number; [k: string]: any };
    const rows: Row[] = [];
    for (let i = 2; i <= ws.rowCount; i++) {
      const r = ws.getRow(i);
      const data: Row = { _rowNumber: i };
      let hasValue = false;
      PRODUCT_IMPORT_HEADERS.forEach((h, idx) => {
        const cell = r.getCell(idx + 1);
        const v = cell?.value;
        const text = v === null || v === undefined ? '' : String(cell.text ?? v).trim();
        data[h.key] = text;
        if (text) hasValue = true;
      });
      if (hasValue) rows.push(data); // 跳过完全空白行
    }

    if (rows.length === 0) {
      throw new HttpException('文件内容不能为空', HttpStatus.BAD_REQUEST);
    }

    // ---- 预取字典（枚举校验用），一次查完避免逐行查库 ----
    const dictCodes = [...new Set(PRODUCT_IMPORT_HEADERS.filter(h => (h as any).dict).map(h => (h as any).dict))];
    const dictTypes = await this.dictTypeRepo.find({ where: { dictTypeCode: In(dictCodes), status: 1 } });
    const typeIdToCode = new Map(dictTypes.map(t => [String(t.id), t.dictTypeCode]));
    const dictItems = dictTypes.length
      ? await this.dictItemRepo.find({ where: { dictTypeId: In(dictTypes.map(t => t.id)), status: 1 } })
      : [];
    /** dictCode -> 全部可选值 */
    const dictValues = new Map<string, string[]>();
    /** dictCode -> (parentValue -> 可选值)，用于商品属性随商品类型联动 */
    const dictValuesByParent = new Map<string, Map<string, string[]>>();
    for (const item of dictItems) {
      const code = typeIdToCode.get(String(item.dictTypeId));
      if (!code) continue;
      if (!dictValues.has(code)) dictValues.set(code, []);
      dictValues.get(code)!.push(item.itemValue);
      if (item.parentValue) {
        if (!dictValuesByParent.has(code)) dictValuesByParent.set(code, new Map());
        const m = dictValuesByParent.get(code)!;
        if (!m.has(item.parentValue)) m.set(item.parentValue, []);
        m.get(item.parentValue)!.push(item.itemValue);
      }
    }

    // ---- 预取系统中已存在的商品编码/名称（唯一性校验）----
    const codesInFile = rows.map(r => r.productCode).filter(Boolean);
    const namesInFile = rows.map(r => r.productName).filter(Boolean);
    const existing = await this.productRepo.find({
      where: [
        ...(codesInFile.length ? [{ productCode: In(codesInFile) }] : []),
        ...(namesInFile.length ? [{ productName: In(namesInFile) }] : []),
      ] as any,
      select: { productCode: true, productName: true },
    });
    const existingCodes = new Set(existing.map(p => p.productCode));
    const existingNames = new Set(existing.map(p => p.productName));

    // ---- 逐行校验 ----
    const firstRowOfCode = new Map<string, number>();
    const firstRowOfName = new Map<string, number>();
    const validRows: Row[] = [];
    const errorRows: Array<Row & { _error: string }> = [];

    for (const row of rows) {
      const errors: string[] = [];

      // 1) 必填未填 —— 「XXX未填写」，多个以「；」隔开
      const missing = PRODUCT_IMPORT_HEADERS.filter(h => h.required && !row[h.key]).map(h => h.label);
      if (missing.length) errors.push(missing.map(n => `${n}未填写`).join('；'));

      // 2) 字段超长 —— 「XXX超过最大长度X」
      const tooLong = PRODUCT_IMPORT_HEADERS
        .filter(h => (h as any).maxLength && row[h.key] && String(row[h.key]).length > (h as any).maxLength)
        .map(h => `${h.label}超过最大长度${(h as any).maxLength}`);
      if (tooLong.length) errors.push(tooLong.join('；'));

      // 3) 枚举不匹配 —— 「XXX值有误，仅支持输入：XX,XX,XX」
      for (const h of PRODUCT_IMPORT_HEADERS) {
        const dictCode = (h as any).dict;
        const val = row[h.key];
        if (!dictCode || !val) continue;
        const parentKey = (h as any).parentKey;
        let allowed: string[];
        if (parentKey) {
          // 联动字典（商品属性）：可选值取决于同行的商品类型
          const parentVal = row[parentKey];
          allowed = (dictValuesByParent.get(dictCode)?.get(parentVal) || []);
        } else {
          allowed = dictValues.get(dictCode) || [];
        }
        if (!allowed.includes(val)) {
          errors.push(`${h.label}值有误，仅支持输入：${allowed.join(',')}`);
        }
      }

      // 4) 价格必须为数字（PRD 校验表未列，但非数字会导致写库失败，故补充）
      for (const h of PRODUCT_IMPORT_HEADERS.filter(h => (h as any).numeric)) {
        const val = row[h.key];
        if (!val) continue;
        const num = Number(val);
        if (Number.isNaN(num) || num < 0) {
          errors.push(`${h.label}值有误，仅支持输入非负数字`);
        }
      }

      // 5) 表内重复 —— 「该商品与X行数据重复」（商品编码或商品名称重复即算重复）
      const dupRow = (row.productCode && firstRowOfCode.get(row.productCode))
        || (row.productName && firstRowOfName.get(row.productName));
      if (dupRow) {
        errors.push(`该商品与${dupRow}行数据重复`);
      } else {
        if (row.productCode) firstRowOfCode.set(row.productCode, row._rowNumber);
        if (row.productName) firstRowOfName.set(row.productName, row._rowNumber);
      }

      // 6) 系统已存在 —— 「该商品已存在，不可重复新增」
      if ((row.productCode && existingCodes.has(row.productCode))
        || (row.productName && existingNames.has(row.productName))) {
        errors.push('该商品已存在，不可重复新增');
      }

      if (errors.length) {
        errorRows.push({ ...row, _error: errors.join('；') });
      } else {
        validRows.push(row);
      }
    }

    // ---- 校验无误的数据直接导入 ----
    let successCount = 0;
    if (validRows.length) {
      const entities = validRows.map(r => ({
        productCode: r.productCode,
        productName: r.productName,
        productType: r.productType,
        productAttribute: r.productAttribute || null,
        applicableModel: r.applicableModel || null,
        installAttribute: r.installAttribute || null,
        // 兼容 V1.0.0 的读取方式，同步写一份到 spec_params
        specParams: { applicableModel: r.applicableModel || null, installAttr: r.installAttribute || null },
        unit: r.unit,
        costPrice: r.costPrice ? Number(r.costPrice) : 0,
        salePrice: Number(r.salePrice),
        status: 1, // 模板无「状态」列，导入商品默认为已生效
      }));
      // 分块写入，避免单条 SQL 过大
      const CHUNK = 500;
      for (let i = 0; i < entities.length; i += CHUNK) {
        const chunk = entities.slice(i, i + CHUNK);
        await this.productRepo.createQueryBuilder().insert().into(BizProduct).values(chunk as any).execute();
        successCount += chunk.length;
      }
    }

    return {
      total: rows.length,
      success: successCount,
      failed: errorRows.length,
      // 错误文件所需：原始行数据 + 错误信息
      errorRows: errorRows.map(r => {
        const o: any = {};
        PRODUCT_IMPORT_HEADERS.forEach(h => { o[h.label] = r[h.key] ?? ''; });
        o['错误信息'] = r._error;
        return o;
      }),
    };
  }

  async update(id: string, updateDto: any) {
    const allowed = ['productCode', 'productName', 'productType', 'productAttribute', 'productModel', 'specParams',
      'applicableModel', 'installAttribute', 'productRemark', 'unit', 'costPrice', 'salePrice', 'status'];
    const cleanDto: any = {};
    for (const key of allowed) {
      if (updateDto[key] !== undefined) cleanDto[key] = updateDto[key];
    }
    cleanDto.updatedAt = new Date(); // 列表展示「更新时间」，编辑时需刷新
    await this.productRepo.update(id, cleanDto);
    return this.productRepo.findOne({ where: { id } });
  }
}
