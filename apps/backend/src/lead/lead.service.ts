import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not, In } from 'typeorm';
import { BizLead } from '../entities/BizLead';
import { BizCustomer } from '../entities/BizCustomer';
import { BizVehicle } from '../entities/BizVehicle';
import { BizLeadProduct } from '../entities/BizLeadProduct';
import { BizProduct } from '../entities/BizProduct';
import { BizFollowRecord } from '../entities/BizFollowRecord';
import { SysAccount } from '../entities/SysAccount';
import { BizPrivateRelation } from '../entities/BizPrivateRelation';
import * as crypto from 'crypto';
import dayjs from 'dayjs';

// 数据库列名 → 导入表格列名，用于把 MySQL 报错定位到具体列
const DB_COLUMN_LABELS: Record<string, string> = {
  vin: '车架号',
  brand: '品牌',
  model: '车型',
  style: '款式',
  plate_no: '车牌号',
  mileage: '里程数',
  purchase_date: '发票日期',
  customer_name: '客户姓名',
  phone: '客户电话',
  id_card_no: '身份证号',
  channel_source: '渠道来源',
  source_method: '线索来源方式',
  source_date: '来源日期',
  remark: '备注',
};

// 从 MySQL 报错（如 "Data too long for column 'vin' at row 1"）中提取列的中文名
function extractDbColumnLabel(errorMsg: string): string {
  const match = errorMsg.match(/for column '([^']+)'/);
  if (!match) return '';
  return DB_COLUMN_LABELS[match[1]] || match[1];
}

// 把 MySQL 原始报错翻译成带列名的中文提示；无法识别时原样返回
export function friendlyDbError(errorMsg: string): string {
  if (!errorMsg) return '操作失败';
  const col = extractDbColumnLabel(errorMsg);
  if (errorMsg.includes('Data too long')) {
    return `${col ? `【${col}】` : ''}数据长度超出限制${col === '车架号' ? '（车架号最多17位）' : ''}`;
  }
  if (errorMsg.includes('Incorrect date value')) {
    return `${col ? `【${col}】` : ''}日期格式不正确，请使用 YYYY-MM-DD 格式`;
  }
  if (errorMsg.includes('Incorrect string value') || errorMsg.includes('Data truncated')) {
    return `${col ? `【${col}】` : ''}数据格式不正确`;
  }
  if (errorMsg.includes('Duplicate entry')) {
    return '数据重复';
  }
  return errorMsg;
}

// 批量导入进度（内存态；单进程部署下够用，完成30分钟后自动清理）
// 两阶段：validate=逐行校验，insert=逐行写库（耗时大头）
export interface ImportProgress {
  phase: 'parsing' | 'processing' | 'done' | 'error';
  fileName?: string;
  ownerAccountId?: string;
  stage?: 'validate' | 'insert';
  totalRows: number;
  stageTotal: number;
  stageProcessed: number;
  successCount: number;
  failCount: number;
  warnCount: number;
  startedAt: number;
  finishedAt?: number;
  message?: string;
}
const importProgressStore = new Map<string, ImportProgress>();

// 线索编码：毫秒时间戳后7位 + 进程内循环序号3位，规避高吞吐/并发下的唯一键碰撞
// （旧格式仅时间戳4位+随机2位，批量导入时碰撞率极高）
let leadCodeSeq = 0;
function genLeadCode(): string {
  leadCodeSeq = (leadCodeSeq + 1) % 1000;
  return 'L-' + String(Date.now()).slice(-7) + String(leadCodeSeq).padStart(3, '0');
}

function pruneImportProgress() {
  const now = Date.now();
  for (const [key, p] of importProgressStore) {
    if (p.finishedAt && now - p.finishedAt > 30 * 60 * 1000) {
      importProgressStore.delete(key);
    }
  }
}

@Injectable()
export class LeadService {
  constructor(
    @InjectRepository(BizLead)
    private readonly leadRepo: Repository<BizLead>,
    private readonly dataSource: DataSource,
  ) {}

  async getLeads(query: any) {
    const { page = 1, limit = 10, channelSource, customerName, customerPhone, leadStatus, leadCode, isAddWechat, purchaseIntention, communicationTendency, callResult, assignedAccountId, publicPool, sourceMethod, sortField, sortOrder } = query;

    const qb = this.leadRepo.createQueryBuilder('lead')
      .leftJoinAndMapOne('lead.customer', BizCustomer, 'customer', 'customer.id = lead.customerId')
      .leftJoinAndMapOne('lead.vehicle', BizVehicle, 'vehicle', 'vehicle.id = lead.vehicleId')
      .leftJoinAndMapMany('lead.products', BizLeadProduct, 'leadProduct', 'leadProduct.leadId = lead.id')
      .leftJoinAndMapOne('leadProduct.product', BizProduct, 'product', 'product.id = leadProduct.productId')
      .leftJoinAndMapOne('lead.assignee', SysAccount, 'assignee', 'assignee.id = lead.assignedAccountId')
      .orderBy('lead.createdAt', 'DESC');

    if (channelSource) {
      qb.andWhere('lead.channelSource = :channelSource', { channelSource });
    }
    
    if (leadStatus !== undefined && leadStatus !== null && leadStatus !== '') {
      // leadStatus might be an array if multiple selected
      const statuses = Array.isArray(leadStatus) ? leadStatus : String(leadStatus).split(',');
      qb.andWhere('lead.leadStatus IN (:...statuses)', { statuses });
    }

    if (customerName) {
      qb.andWhere('customer.customerName LIKE :customerName', { customerName: `%${customerName}%` });
    }

    if (customerPhone) {
      qb.andWhere('customer.phone LIKE :customerPhone', { customerPhone: `%${customerPhone}%` });
    }

    if (leadCode) {
      qb.andWhere('lead.leadCode LIKE :leadCode', { leadCode: `%${leadCode}%` });
    }
    if (isAddWechat) {
      qb.andWhere('lead.isAddWechat = :isAddWechat', { isAddWechat });
    }
    if (purchaseIntention) {
      qb.andWhere('lead.purchaseIntention = :purchaseIntention', { purchaseIntention });
    }
    if (communicationTendency) {
      qb.andWhere('lead.communicationTendency = :communicationTendency', { communicationTendency });
    }
    if (callResult) {
      qb.andWhere('lead.callResult = :callResult', { callResult });
    }
    if (sourceMethod) {
      qb.andWhere('lead.sourceMethod = :sourceMethod', { sourceMethod });
    }
    if (assignedAccountId) {
      qb.andWhere('lead.assignedAccountId = :assignedAccountId', { assignedAccountId });
    }

    // ===== 创建时间区间 / 跟进天数 =====
    const { createdAtStart, createdAtEnd, followDaysMin } = query;
    if (createdAtStart) {
      qb.andWhere('lead.createdAt >= :createdAtStart', { createdAtStart: `${createdAtStart} 00:00:00` });
    }
    if (createdAtEnd) {
      qb.andWhere('lead.createdAt <= :createdAtEnd', { createdAtEnd: `${createdAtEnd} 23:59:59` });
    }
    // 跟进天数：自首次跟进记录之日起至今的天数（含当天，与列表列口径一致：DATEDIFF+1），精确匹配
    // 未跟进过的线索（first_follow_at 为空，列表显示“-”）不参与
    if (followDaysMin !== undefined && followDaysMin !== null && followDaysMin !== '') {
      qb.andWhere('lead.first_follow_at IS NOT NULL AND (DATEDIFF(NOW(), lead.first_follow_at) + 1) = :followDaysMin', { followDaysMin: Number(followDaysMin) });
    }

    // ===== 车辆信息筛选 =====
    const { carModel, carStyle, vin, invoiceDate, invoiceDateStart, invoiceDateEnd, vehicleAgeMin, mileageMin, isMileageOver40k, isMileageOver95k, hasExtendedWarranty, hasBatteryWarranty, hasPeaceOfMind, hasTireProtection, intentProduct, intentGift } = query;
    if (carModel) {
      qb.andWhere('vehicle.model LIKE :carModel', { carModel: `%${carModel}%` });
    }
    if (carStyle) {
      qb.andWhere('vehicle.style LIKE :carStyle', { carStyle: `%${carStyle}%` });
    }
    if (vin) {
      qb.andWhere('vehicle.vin LIKE :vin', { vin: `%${vin}%` });
    }
    if (invoiceDate) {
      qb.andWhere('vehicle.purchaseDate = :invoiceDate', { invoiceDate });
    }
    // 发票日期区间搜索
    if (invoiceDateStart) {
      qb.andWhere('vehicle.purchaseDate >= :invoiceDateStart', { invoiceDateStart });
    }
    if (invoiceDateEnd) {
      qb.andWhere('vehicle.purchaseDate <= :invoiceDateEnd', { invoiceDateEnd });
    }
    if (vehicleAgeMin !== undefined && vehicleAgeMin !== null && vehicleAgeMin !== '') {
      qb.andWhere('TIMESTAMPDIFF(MONTH, vehicle.purchase_date, NOW()) >= :vehicleAgeMin', { vehicleAgeMin: Number(vehicleAgeMin) });
    }
    if (mileageMin !== undefined && mileageMin !== null && mileageMin !== '') {
      qb.andWhere('vehicle.mileage >= :mileageMin', { mileageMin: Number(mileageMin) });
    }
    const vehicleFlagFilters: Array<[any, string]> = [
      [isMileageOver40k, 'isMileageOver40k'],
      [isMileageOver95k, 'isMileageOver95k'],
      [hasExtendedWarranty, 'hasExtendedWarranty'],
      [hasBatteryWarranty, 'hasBatteryWarranty'],
      [hasPeaceOfMind, 'hasPeaceOfMind'],
      [hasTireProtection, 'hasTireProtection'],
    ];
    for (const [val, prop] of vehicleFlagFilters) {
      if (val !== undefined && val !== null && val !== '') {
        qb.andWhere(`vehicle.${prop} = :${prop}`, { [prop]: val });
      }
    }

    // ===== 意向商品/赠品筛选（按商品名称模糊匹配）=====
    if (intentProduct) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM biz_lead_product lp1 JOIN biz_product p1 ON p1.id = lp1.product_id WHERE lp1.lead_id = lead.id AND lp1.product_role = 1 AND p1.product_name LIKE :intentProduct)',
        { intentProduct: `%${intentProduct}%` },
      );
    }
    if (intentGift) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM biz_lead_product lp2 JOIN biz_product p2 ON p2.id = lp2.product_id WHERE lp2.lead_id = lead.id AND lp2.product_role = 2 AND p2.product_name LIKE :intentGift)',
        { intentGift: `%${intentGift}%` },
      );
    }

    // 公域池模式：排除已被分配且正在跟进的线索（状态1+有assignee的属于私池，不展示）
    if (publicPool === '1') {
      qb.andWhere('(lead.assignedAccountId IS NULL OR lead.leadStatus IN (0, 4, 6))');
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    // Dynamic sorting: support sortField=sourceDate
    const allowedSortFields: Record<string, string> = {
      sourceDate: 'lead.sourceDate',
      createdAt: 'lead.createdAt',
    };
    const orderField = allowedSortFields[sortField] || 'lead.createdAt';
    const orderDirection: 'ASC' | 'DESC' = sortOrder === 'ascend' ? 'ASC' : 'DESC';
    if (sortField === 'sourceDate') {
      // Use raw column name directly to avoid TypeORM quoting issues
      qb.orderBy('lead.source_date', orderDirection);
    } else {
      qb.orderBy(orderField, orderDirection);
    }
    const [items, total] = await qb.skip((pageNum - 1) * limitNum).take(limitNum).getManyAndCount();

    // 简单脱敏身份证号并填充商品
    if (items.length > 0) {
      const leadIds = items.map((l: any) => l.id);
      const leadProducts = await this.leadRepo.query(
        `SELECT lp.lead_id AS leadId, lp.product_role AS productRole, lp.product_id AS productId, p.product_name AS productName, p.product_code AS productCode
         FROM biz_lead_product lp
         LEFT JOIN biz_product p ON lp.product_id = p.id
         WHERE lp.lead_id IN (${leadIds.map(() => '?').join(',')})`,
        leadIds
      );
      
      items.forEach((item: any) => {
        if (item.customer && item.customer.idCardNo) {
          const idStr = item.customer.idCardNo;
          if (idStr.length > 14) {
            item.customer.idCardNo = idStr.substring(0, 10) + '****' + idStr.substring(idStr.length - 4);
          }
        }
        
        // Populate products manually
        item.products = leadProducts
          .filter((lp: any) => String(lp.leadId) === String(item.id))
          .map((lp: any) => ({
            productId: lp.productId,
            productRole: lp.productRole,
            product: {
              id: lp.productId,
              productName: lp.productName,
              productCode: lp.productCode,
            }
          }));
      });
    }

    return {
      items,
      total,
      page: Number(page),
      limit: Number(limit)
    };
  }

  async getWorkbenchStats(accountId: string) {
    const todayStart = dayjs().startOf('day').toDate();
    const todayEnd = dayjs().endOf('day').toDate();

    // 1. 今日待跟进数量
    const pendingFollowUpCount = await this.leadRepo.count({
      where: {
        assignedAccountId: accountId,
        leadStatus: 1, // 待跟进
      }
    });

    const followingUpTodayCount = await this.leadRepo.createQueryBuilder('lead')
      .where('lead.assignedAccountId = :accountId', { accountId })
      .andWhere('lead.leadStatus = :status', { status: 2 }) // 跟进中
      .andWhere('lead.nextFollowAt >= :start', { start: todayStart })
      .andWhere('lead.nextFollowAt <= :end', { end: todayEnd })
      .getCount();

    const todayPendingFollowUp = pendingFollowUpCount + followingUpTodayCount;

    // 2. 可抢公域池数量: 0=待分配, 4=已战败, 6=回收待分配
    const publicPoolCount = await this.leadRepo.createQueryBuilder('lead')
      .where('lead.leadStatus IN (:...statuses)', { statuses: [0, 4, 6] })
      .getCount();

    return {
      todayPendingFollowUp,
      publicPoolCount
    };
  }

  async assignLead(id: string, accountId: string) {
    const lead = await this.leadRepo.findOne({ where: { id } });
    if (!lead) throw new Error('Lead not found');

    // Check if this salesperson was previously assigned and returned
    const prevAssignees = lead.previousAssignees ? lead.previousAssignees.split(',') : [];
    if (prevAssignees.includes(accountId)) {
      const account = await this.dataSource.getRepository(SysAccount).findOne({ where: { id: accountId } });
      const salesName = account?.realName || account?.username || '未知销售';
      throw { code: 'ASSIGN_PREV_CONFLICT', message: `${lead.leadCode}曾被${salesName}销售跟进过，不可再次分配给该销售！`, leadCodes: [lead.leadCode], salesName };
    }

    if (lead.leadStatus === 4) {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const newLead = new BizLead();
        newLead.leadCode = genLeadCode();
        newLead.customerId = lead.customerId;
        newLead.vehicleId = lead.vehicleId;
        newLead.channelSource = lead.channelSource;
        newLead.sourceMethod = lead.sourceMethod;
        newLead.sourceDate = lead.sourceDate;
        newLead.isAddWechat = lead.isAddWechat;
        newLead.purchaseIntention = lead.purchaseIntention;
        newLead.communicationTendency = lead.communicationTendency;
        newLead.callResult = lead.callResult;
        newLead.remark = lead.remark;
        newLead.assignedAccountId = accountId;
        newLead.assignedAt = new Date();
        newLead.leadStatus = 1;
        newLead.parentLeadId = String(lead.id);
        
        await queryRunner.manager.save(BizLead, newLead);

        const products = await queryRunner.manager.find(BizLeadProduct, { where: { leadId: lead.id } });
        for (const p of products) {
          const newP = new BizLeadProduct();
          newP.leadId = newLead.id;
          newP.productId = p.productId;
          newP.productRole = p.productRole;
          await queryRunner.manager.save(BizLeadProduct, newP);
        }

        const followRecords = await queryRunner.manager.find(BizFollowRecord, { where: { leadId: lead.id } });
        for (const fr of followRecords) {
          const newFr = new BizFollowRecord();
          newFr.leadId = newLead.id;
          newFr.customerId = fr.customerId;
          newFr.accountId = fr.accountId;
          newFr.followType = fr.followType;
          newFr.followContent = fr.followContent;
          newFr.followTime = fr.followTime;
          newFr.callResult = fr.callResult;
          newFr.communicationTendency = fr.communicationTendency;
          await queryRunner.manager.save(BizFollowRecord, newFr);
        }

        if (lead.customerId) {
          const activeRelation = await queryRunner.manager.findOne(BizPrivateRelation, {
            where: { customerId: lead.customerId, status: 1 }
          });
          if (activeRelation && activeRelation.accountId !== accountId) {
            activeRelation.status = 0;
            activeRelation.updatedAt = new Date();
            await queryRunner.manager.save(activeRelation);
          }
          const existingRel = await queryRunner.manager.findOne(BizPrivateRelation, {
            where: { customerId: lead.customerId, accountId: accountId }
          });
          if (existingRel) {
            existingRel.status = 1;
            existingRel.updatedAt = new Date();
            await queryRunner.manager.save(existingRel);
          } else {
            const newRel = new BizPrivateRelation();
            newRel.customerId = lead.customerId;
            newRel.accountId = accountId;
            newRel.firstBindtime = new Date();
            newRel.status = 1;
            await queryRunner.manager.save(newRel);
          }
        }
        await queryRunner.commitTransaction();
        return this.leadRepo.findOne({ where: { id: newLead.id } });
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } else {
      // 0=待分配, 1=待跟进
      await this.leadRepo.update(id, {
        assignedAccountId: accountId,
        assignedAt: new Date(),
        leadStatus: 1
      });
      return this.leadRepo.findOne({ where: { id } });
    }
  }

  async createLead(data: any) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Handle Customer
      let customerId = data.customerId;
      let customer: BizCustomer | null = null;
      
      if (data.isNewCustomer) {
        // Validation 3.a: Check phone uniqueness if new customer
        const phoneHash = crypto.createHash('sha256').update(data.customerPhone).digest('hex');
        const existingCustomer = await queryRunner.manager.findOne(BizCustomer, {
          where: { phoneHash }
        });

        if (existingCustomer) {
          throw { code: 'CUSTOMER_PHONE_EXIST', customerName: existingCustomer.customerName, message: existingCustomer.customerName };
        }

        customer = new BizCustomer();
        customer.customerName = data.customerName || '';
        customer.phone = data.customerPhone;
        customer.phoneHash = phoneHash;
        customer = await queryRunner.manager.save(customer);
        customerId = customer.id;
      } else {
        customer = await queryRunner.manager.findOne(BizCustomer, { where: { id: customerId } });
        if (!customer) throw new Error('Selected customer not found');
      }

      // Validation 3.c: Check Active Lead
      const activeLeads = await queryRunner.manager.find(BizLead, {
        where: { customerId: customerId }
      });
      const activeLead = activeLeads.find(l => [0, 1, 2, 4, 6].includes(l.leadStatus));
      if (activeLead) {
        const statusMap: Record<number, string> = {
          0: '待分配',
          1: '待跟进',
          2: '跟进中',
          4: '已战败',
          6: '回收待分配'
        };
        throw { 
          code: 'LEAD_STATUS_CONFLICT', 
          customerName: customer.customerName,
          statusName: statusMap[activeLead.leadStatus] || '处理中',
          leadCode: activeLead.leadCode,
          message: `客户已存在【${statusMap[activeLead.leadStatus] || '处理中'}】状态的关联线索，无法重复分配`,
        };
      }

      // 2. Handle Vehicle - create/update when ANY vehicle field is provided
      let vehicleId = null;
      const hasAnyVehicleField = data.carVin || data.carBrand || data.carModel || data.carStyle || data.carPlate || data.carMileage || data.purchaseDate || data.invoiceDate || data.remark;
      if (hasAnyVehicleField) {
        if (data.carVin) {
          // VIN already bound to another customer: ask for confirmation first;
          // with forceBindVehicle the vehicle is bound to this customer as well (multi-customer)
          if (!data.forceBindVehicle) {
            const vinConflict = await queryRunner.manager.findOne(BizVehicle, {
              where: { vin: data.carVin, customerId: Not(String(customerId)) }
            });
            if (vinConflict) {
              const vinOwner = await queryRunner.manager.findOne(BizCustomer, { where: { id: vinConflict.customerId } });
              throw { code: 'VEHICLE_VIN_EXIST', customerName: vinOwner?.customerName || '', message: `该车辆已存在并绑定了客户【${vinOwner?.customerName || ''}】` };
            }
          }
          // If VIN is provided, try to find existing vehicle by VIN
          const existingVehicle = await queryRunner.manager.findOne(BizVehicle, {
            where: { vin: data.carVin, customerId: customerId }
          });

          if (existingVehicle) {
            existingVehicle.model = data.carStyle ? `${data.carModel || ''} ${data.carStyle}`.trim() : (data.carModel || existingVehicle.model);
            if (data.carStyle) existingVehicle.style = data.carStyle;
            if (data.carPlate) existingVehicle.plateNo = data.carPlate;
            let pDate = data.purchaseDate || data.invoiceDate;
            if (pDate && pDate.length > 10) pDate = pDate.substring(0, 10);
            if (pDate) existingVehicle.purchaseDate = pDate;
            if (data.carBrand !== undefined) existingVehicle.brand = data.carBrand;
            if (data.carMileage !== undefined) existingVehicle.mileage = Number(data.carMileage) || 0;
            if (data.remark !== undefined) existingVehicle.remark = data.remark;
            if (data.isMileageOver40k !== undefined) existingVehicle.isMileageOver40k = data.isMileageOver40k;
            if (data.isMileageOver95k !== undefined) existingVehicle.isMileageOver95k = data.isMileageOver95k;
            if (data.hasExtendedWarranty !== undefined) existingVehicle.hasExtendedWarranty = data.hasExtendedWarranty;
            if (data.hasBatteryWarranty !== undefined) existingVehicle.hasBatteryWarranty = data.hasBatteryWarranty;
            if (data.hasPeaceOfMind !== undefined) existingVehicle.hasPeaceOfMind = data.hasPeaceOfMind;
            if (data.hasTireProtection !== undefined) existingVehicle.hasTireProtection = data.hasTireProtection;

            await queryRunner.manager.save(existingVehicle);
            vehicleId = existingVehicle.id;
          } else {
            let vehicle = new BizVehicle();
            vehicle.vin = data.carVin;
            vehicle.model = data.carStyle ? `${data.carModel || ''} ${data.carStyle}`.trim() : data.carModel;
            vehicle.style = data.carStyle;
            vehicle.plateNo = data.carPlate;
            let pDate = data.purchaseDate || data.invoiceDate;
            if (pDate && pDate.length > 10) pDate = pDate.substring(0, 10);
            vehicle.purchaseDate = pDate;
            vehicle.customerId = customerId;
            if (data.carBrand !== undefined) vehicle.brand = data.carBrand;
            if (data.carMileage !== undefined) vehicle.mileage = Number(data.carMileage) || 0;
            if (data.remark !== undefined) vehicle.remark = data.remark;
            if (data.isMileageOver40k !== undefined) vehicle.isMileageOver40k = data.isMileageOver40k;
            if (data.isMileageOver95k !== undefined) vehicle.isMileageOver95k = data.isMileageOver95k;
            if (data.hasExtendedWarranty !== undefined) vehicle.hasExtendedWarranty = data.hasExtendedWarranty;
            if (data.hasBatteryWarranty !== undefined) vehicle.hasBatteryWarranty = data.hasBatteryWarranty;
            if (data.hasPeaceOfMind !== undefined) vehicle.hasPeaceOfMind = data.hasPeaceOfMind;
            if (data.hasTireProtection !== undefined) vehicle.hasTireProtection = data.hasTireProtection;

            vehicle = await queryRunner.manager.save(vehicle);
            vehicleId = vehicle.id;
          }
        } else {
          // No VIN provided, but other vehicle fields exist — create vehicle without VIN
          let vehicle = new BizVehicle();
          vehicle.model = data.carStyle ? `${data.carModel || ''} ${data.carStyle}`.trim() : (data.carModel || null);
          vehicle.style = data.carStyle || null;
          vehicle.plateNo = data.carPlate || null;
          let pDate = data.purchaseDate || data.invoiceDate;
          if (pDate && pDate.length > 10) pDate = pDate.substring(0, 10);
          vehicle.purchaseDate = pDate || null;
          vehicle.customerId = customerId;
          if (data.carBrand !== undefined) vehicle.brand = data.carBrand;
          if (data.carMileage !== undefined) vehicle.mileage = Number(data.carMileage) || 0;
          if (data.remark !== undefined) vehicle.remark = data.remark;
          if (data.isMileageOver40k !== undefined) vehicle.isMileageOver40k = data.isMileageOver40k;
          if (data.isMileageOver95k !== undefined) vehicle.isMileageOver95k = data.isMileageOver95k;
          if (data.hasExtendedWarranty !== undefined) vehicle.hasExtendedWarranty = data.hasExtendedWarranty;
          if (data.hasBatteryWarranty !== undefined) vehicle.hasBatteryWarranty = data.hasBatteryWarranty;
          if (data.hasPeaceOfMind !== undefined) vehicle.hasPeaceOfMind = data.hasPeaceOfMind;
          if (data.hasTireProtection !== undefined) vehicle.hasTireProtection = data.hasTireProtection;

          vehicle = await queryRunner.manager.save(vehicle);
          vehicleId = vehicle.id;
        }
      }

      // 3. Handle Lead
      const lead = new BizLead();
      lead.leadCode = genLeadCode();
      lead.customerId = customerId;
      lead.vehicleId = vehicleId;
      lead.channelSource = data.channelSource;
      lead.sourceMethod = data.sourceMethod;
      let sDate = data.sourceDate;
      if (sDate && sDate.length > 10) sDate = sDate.substring(0, 10);
      lead.sourceDate = sDate;
      lead.isAddWechat = data.isAddWechat;
      if (data.assigneeId) {
        lead.assignedAccountId = data.assigneeId;
        lead.leadStatus = 1; // 待跟进
        lead.assignedAt = new Date();
      } else {
        lead.leadStatus = 0; // 待分配
      }
      // New lead fields
      lead.callResult = data.callResult;
      lead.communicationTendency = data.communicationTendency;
      lead.purchaseIntention = data.purchaseIntention;
      
      const savedLead = await queryRunner.manager.save(lead);

      // 4. Handle Products and Gifts
      if (data.intentProducts?.length) {
        const lpList = data.intentProducts.map((pId: string) => {
          const lp = new BizLeadProduct();
          lp.leadId = savedLead.id;
          lp.productId = pId;
          lp.productRole = 1;
          return lp;
        });
        await queryRunner.manager.save(BizLeadProduct, lpList);
      }

      if (data.intentGifts?.length) {
        const lgList = data.intentGifts.map((pId: string) => {
          const lg = new BizLeadProduct();
          lg.leadId = savedLead.id;
          lg.productId = pId;
          lg.productRole = 2;
          return lg;
        });
        await queryRunner.manager.save(BizLeadProduct, lgList);
      }

      // 5. Handle Private Relation if assigned
      if (data.assigneeId) {
        const existingRel = await queryRunner.manager.findOne(BizPrivateRelation, {
          where: { accountId: data.assigneeId, customerId: customerId }
        });
        if (!existingRel) {
          const newRel = new BizPrivateRelation();
          newRel.accountId = data.assigneeId;
          newRel.customerId = customerId;
          await queryRunner.manager.save(newRel);
        }
      }

      await queryRunner.commitTransaction();
      return savedLead;
    } catch (err: any) {
      await queryRunner.rollbackTransaction();
      // If our custom code error, throw it so controller can return it
      if (err.code) {
        throw err;
      }
      throw new Error(err.message || 'Error creating lead');
    } finally {
      await queryRunner.release();
    }
  }

  // 任务按发起人隔离：仅任务归属账号可查询
  getImportProgress(id: string, requesterAccountId?: string): ImportProgress | null {
    const p = importProgressStore.get(id);
    if (!p) return null;
    if (p.ownerAccountId && requesterAccountId && p.ownerAccountId !== requesterAccountId) return null;
    return p;
  }

  // 返回当前进行中的导入任务（供前端浮窗跨页面/跨会话发现任务）；仅返回请求者本人发起的任务
  getActiveImportTask(requesterAccountId?: string): (ImportProgress & { progressId: string }) | null {
    for (const [id, p] of importProgressStore) {
      if ((p.phase === 'parsing' || p.phase === 'processing')
        && (!p.ownerAccountId || !requesterAccountId || p.ownerAccountId === requesterAccountId)) {
        return { progressId: id, ...p };
      }
    }
    return null;
  }

  markImportProgressError(id: string | undefined, message: string) {
    if (!id) return;
    const p = importProgressStore.get(id);
    if (p && p.phase !== 'done') {
      p.phase = 'error';
      p.message = message;
      p.finishedAt = Date.now();
    }
  }

  async importLeads(file: Express.Multer.File, accountId: string, progressId?: string, ownerAccountId?: string) {
    let progress: ImportProgress | null = null;
    if (progressId) {
      pruneImportProgress();
      let fileName = file.originalname || '导入文件';
      try { fileName = Buffer.from(fileName, 'latin1').toString('utf8'); } catch { /* 保留原名 */ }
      progress = { phase: 'parsing', fileName, ownerAccountId, totalRows: 0, stageTotal: 0, stageProcessed: 0, successCount: 0, failCount: 0, warnCount: 0, startedAt: Date.now() };
      importProgressStore.set(progressId, progress);
    }
    const failProgress = (message: string) => {
      if (progress) {
        progress.phase = 'error';
        progress.message = message;
        progress.finishedAt = Date.now();
      }
    };

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    
    const rows: any[] = [];
    const headers: string[] = [];

    // Try XLSX first, fall back to CSV
    const isCSV = file.originalname?.endsWith('.csv') || file.mimetype === 'text/csv';
    if (isCSV) {
      // Parse CSV
      const content = file.buffer.toString('utf-8').replace(/^\uFEFF/, ''); // Strip BOM
      const lines = content.split(/\r?\n/).filter(l => l.trim());
      if (lines.length > 0) {
        headers.push('__placeholder__'); // 1-indexed: headers[1], headers[2], ...
        const headerCells = lines[0].split(',');
        headerCells.forEach((h, idx) => {
          headers[idx + 1] = h.replace(/\*/g, '').trim();
        });
        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split(',');
          const rowData: any = { _rowNumber: i + 1 };
          cells.forEach((val, idx) => {
            const header = headers[idx + 1];
            if (header) rowData[header] = (val || '').trim();
          });
          rows.push(rowData);
        }
      }
    } else {
      // Parse XLSX
      await workbook.xlsx.load(file.buffer);
      const worksheet = workbook.worksheets[0];
      worksheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber === 1) {
          row.eachCell((cell: any, colNumber: number) => {
            let val = cell.value;
            if (val && typeof val === 'object' && val.richText) {
              val = val.richText.map((t: any) => t.text).join('');
            }
            headers[colNumber] = val ? val.toString().replace(/\*/g, '').trim() : `Col${colNumber}`;
          });
        } else {
          const rowData: any = { _rowNumber: rowNumber };
          row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
            const header = headers[colNumber];
            if (header) {
              if (cell.value instanceof Date) {
                rowData[header] = dayjs(cell.value).format('YYYY-MM-DD');
              } else {
                rowData[header] = cell.value !== null ? cell.value.toString().trim() : '';
              }
            }
          });
          rows.push(rowData);
        }
      });
    }

    // 空文件校验
    if (rows.length === 0) {
      failProgress('文件内容不能为空');
      return { error: true, message: '文件内容不能为空' };
    }

    // 行数限制校验
    if (rows.length > 500000) {
      failProgress('文件条数不能超过50万条');
      return { error: true, message: '文件条数不能超过50万条' };
    }

    // 文件内手机号首次出现行号索引（O(n)，替代逐行 findIndex 的 O(n²)，50万行规模必需）
    const phoneFirstRowNo = new Map<string, number>();
    for (const r of rows) {
      const p = r['客户电话'];
      if (p && !phoneFirstRowNo.has(p)) {
        phoneFirstRowNo.set(p, r._rowNumber);
      }
    }

    // 表头字段匹配校验
    const requiredFields = ['渠道来源', '线索来源方式', '来源日期', '客户电话'];
    const headerValues = headers.filter(h => h && h !== '__placeholder__');
    const missingHeaders = requiredFields.filter(f => !headerValues.includes(f));
    if (missingHeaders.length > 0) {
      failProgress(`表格字段不匹配，缺少必需列：${missingHeaders.join('、')}`);
      return { error: true, message: `表格字段不匹配，缺少必需列：${missingHeaders.join('、')}` };
    }

    // 获取字典校验数据
    const validDictItems = await this.dataSource.manager.query(`
      SELECT i.item_label, t.dict_type_code 
      FROM sys_dict_item i 
      JOIN sys_dict_type t ON i.dict_type_id = t.id 
      WHERE t.dict_type_code IN ('channel_source', 'lead_source_method') AND i.status = 1
    `);
    const validChannelSources = validDictItems.filter((i: any) => i.dict_type_code === 'channel_source').map((i: any) => i.item_label);
    const validLeadSourceMethods = validDictItems.filter((i: any) => i.dict_type_code === 'lead_source_method').map((i: any) => i.item_label);

    const booleanFields = [
      '里程≥4万公里（1：是；0：否）', 
      '里程≥9.5万公里（1：是；0：否）', 
      '是否已购整车延保（1：是；0：否）', 
      '是否已购电池延保（1：是；0：否）', 
      '是否已购安心保（1：是；0：否）', 
      '是否已购轮胎保障（1：是；0：否）'
    ];

    const successRows = [];
    const warnRows: any[] = [];
    const failRows = [];

    const batchNo = 'IMP-' + Date.now();

    // ===== 批量预查：一次性把校验需要的数据全部拉入内存 =====
    // 生产库为外网端点（单次往返 ~24ms），逐行查库是导入缓慢的根源；预查后循环内零查库
    const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
    const phoneHashOf = new Map<string, string>();
    for (const r of rows) {
      const ph = r['客户电话'];
      if (ph && !phoneHashOf.has(ph)) phoneHashOf.set(ph, sha256(String(ph)));
    }
    const IN_CHUNK = 800;
    const chunked = <T>(arr: T[]): T[][] => {
      const out: T[][] = [];
      for (let s = 0; s < arr.length; s += IN_CHUNK) out.push(arr.slice(s, s + IN_CHUNK));
      return out;
    };
    // 已有客户（按手机号哈希）
    const customerByPhoneHash = new Map<string, BizCustomer>();
    for (const part of chunked([...new Set(phoneHashOf.values())])) {
      const found = await this.dataSource.manager.find(BizCustomer, { where: { phoneHash: In(part) } });
      found.forEach(c => customerByPhoneHash.set(c.phoneHash, c));
    }
    const matchedCustomerIds = [...customerByPhoneHash.values()].map(c => c.id);
    // 已有客户的未完结线索
    const activeLeadByCustomerId = new Map<string, BizLead>();
    for (const part of chunked(matchedCustomerIds)) {
      const leadsOfCustomers = await this.dataSource.manager.find(BizLead, { where: { customerId: In(part) } });
      for (const l of leadsOfCustomers) {
        if ([0, 1, 2, 4, 6].includes(l.leadStatus) && !activeLeadByCustomerId.has(String(l.customerId))) {
          activeLeadByCustomerId.set(String(l.customerId), l);
        }
      }
    }
    // 已有客户的车辆（按 vin+客户 定位）
    const vehicleByVinCustomer = new Map<string, BizVehicle>();
    for (const part of chunked(matchedCustomerIds)) {
      const vehiclesOfCustomers = await this.dataSource.manager.find(BizVehicle, { where: { customerId: In(part) } });
      vehiclesOfCustomers.forEach(v => { if (v.vin) vehicleByVinCustomer.set(`${v.vin}|${v.customerId}`, v); });
    }
    // 意向商品/赠品名称 → 商品ID
    const productNames = new Set<string>();
    rows.forEach(r => {
      if (r['意向商品名称']) productNames.add(r['意向商品名称']);
      if (r['意向赠品名称']) productNames.add(r['意向赠品名称']);
    });
    const productIdByName = new Map<string, string>();
    for (const part of chunked([...productNames])) {
      const prods = await this.dataSource.manager.find(BizProduct, { where: { productName: In(part) } });
      prods.forEach(pr => { if (!productIdByName.has(pr.productName)) productIdByName.set(pr.productName, pr.id); });
    }

    if (progress) {
      progress.phase = 'processing';
      progress.stage = 'validate';
      progress.totalRows = rows.length;
      progress.stageTotal = rows.length;
    }

    for (let i = 0; i < rows.length; i++) {
      if (progress) {
        progress.stageProcessed = i;
        progress.failCount = failRows.length;
        progress.warnCount = warnRows.length;
      }
      const row = rows[i];
      let hasError = false;
      let errorMsg = '';

      // 1. 必填字段校验
      for (const field of requiredFields) {
        if (!row[field]) {
          hasError = true;
          errorMsg = `${field}字段不能为空！`;
          break;
        }
      }

      // 条件必填：存在意向商品编码时，商品名称必填
      if (!hasError) {
        if (row['意向商品编码'] && !row['意向商品名称']) {
          hasError = true;
          errorMsg = '存在意向商品信息时，意向商品名称为必填项';
        }
      }

      // 字典值校验
      if (!hasError) {
        if (row['渠道来源'] && !validChannelSources.includes(row['渠道来源'])) {
          hasError = true;
          errorMsg = `渠道来源不正确，请填写系统配置中的有效值`;
        }
      }

      if (!hasError) {
        if (row['线索来源方式'] && !validLeadSourceMethods.includes(row['线索来源方式'])) {
          hasError = true;
          errorMsg = `线索来源方式不正确，请填写系统配置中的有效值`;
        }
      }

      // 布尔值校验
      if (!hasError) {
        for (const bField of booleanFields) {
          if (row[bField] !== undefined && row[bField] !== null && row[bField] !== '') {
            const val = String(row[bField]).trim();
            if (val !== '1' && val !== '0') {
              hasError = true;
              errorMsg = `${bField.split('（')[0]} 只能填 1 或 0`;
              break;
            }
          }
        }
      }

      if (hasError) {
        row['错误信息'] = errorMsg;
        failRows.push(row);
        continue;
      }

      // 2. 重复数据校验 (当前文件内，仅首次出现的行通过)
      if (row['客户电话'] && phoneFirstRowNo.get(row['客户电话']) !== row._rowNumber) {
        row['错误信息'] = `与第 ${phoneFirstRowNo.get(row['客户电话'])} 行数据手机号重复`;
        failRows.push(row);
        continue;
      }

      // 3. 分层客户/车辆冲突校验（使用批量预查结果，循环内零查库）
      const existingCustomer = customerByPhoneHash.get(phoneHashOf.get(row['客户电话']) || '') || null;

      // 3a. 客户冲突：电话匹配到客户但姓名不同（导入姓名为空时不视为冲突，沿用系统姓名）
      if (existingCustomer && row['客户姓名'] && existingCustomer.customerName !== row['客户姓名']) {
        warnRows.push({
          row,
          warnType: 'customer_name_mismatch',
          conflictCustomerId: existingCustomer.id,
          conflictVehicleId: null,
          warnDetail: `电话相同，姓名不同（系统：${existingCustomer.customerName}，导入：${row['客户姓名']}）`
        });
        continue;
      }

      // 3c-1. 检查客户是否存在未完结的线索
      if (existingCustomer) {
        const activeLead = activeLeadByCustomerId.get(String(existingCustomer.id));
        if (activeLead) {
          const statusMap: Record<number, string> = { 0: '待分配', 1: '待跟进', 2: '跟进中', 4: '已战败', 6: '回收待分配' };
          warnRows.push({
            row,
            warnType: 'customer_active_lead',
            conflictCustomerId: existingCustomer.id,
            conflictVehicleId: null,
            warnDetail: `客户(${existingCustomer.customerName})存在未完结的线索（${statusMap[activeLead.leadStatus] || '处理中'}）`
          });
          continue;
        }
      }

      // 3b. 车架号核心字段校验 (仅校验本客户的车辆)
      if (row['车架号'] && existingCustomer) {
        const existingVehicle = vehicleByVinCustomer.get(`${row['车架号']}|${existingCustomer.id}`) || null;

        if (existingVehicle) {
            // 车架号归属同一客户 → 检查核心字段(品牌、车型、款式、发票日期)是否一致
            const coreFieldsMatch = (() => {
              const importBrand = (row['品牌'] || '').trim();
              const importModel = (row['车型'] || '').trim();
              const importStyle = (row['款式'] || '').trim();
              const importInvoice = (row['发票日期'] || '').trim();
              // 仅在导入数据中有值的核心字段才参与比对
              const expectedCombinedModel = importStyle ? `${importModel} ${importStyle}` : importModel;
              if (importBrand && importBrand !== (existingVehicle.brand || '')) return false;
              if (importModel && importModel !== (existingVehicle.model || '') && expectedCombinedModel !== (existingVehicle.model || '')) return false;
              if (importStyle && importStyle !== (existingVehicle.style || '')) return false;
              if (importInvoice && importInvoice !== (existingVehicle.purchaseDate || '')) return false;
              return true;
            })();

            if (!coreFieldsMatch) {
              // 核心字段不一致 → 列入警告
              warnRows.push({
                row,
                warnType: 'vehicle_info_mismatch',
                conflictCustomerId: existingCustomer?.id || null,
                conflictVehicleId: existingVehicle.id,
                warnDetail: `车架号(${row['车架号']})归属同一客户，但车辆品牌/车型/款式/发票日期信息不一致`
              });
              continue;
            }
            // 核心字段一致 → 非核心字段直接覆盖，继续成功导入
        }
      }

      // 3c-2. 客户存在但无活跃线索 → 警告让用户确认关联
      if (existingCustomer) {
        warnRows.push({
          row,
          warnType: 'customer_exists',
          conflictCustomerId: existingCustomer.id,
          conflictVehicleId: null,
          warnDetail: `客户(${existingCustomer.customerName})已存在，需确认是否关联`
        });
        continue;
      }

      // 4. 商品信息匹配
      if (row['意向商品名称'] && !productIdByName.has(row['意向商品名称'])) {
        row['意向商品名称'] = '';
        row['意向商品编码'] = '';
      }

      successRows.push(row);
    }

    // Save warning rows（整批 INSERT；save() 逐条写在外网库延迟下过慢）
    if (warnRows.length > 0) {
      const BizLeadImportTemp = require('../entities/BizLeadImportTemp').BizLeadImportTemp;
      for (const part of chunked(warnRows)) {
        await this.dataSource.createQueryBuilder()
          .insert()
          .into(BizLeadImportTemp)
          .values(part.map(w => ({
            batchNo,
            rawData: w.row,
            warnType: w.warnType,
            warnDetail: w.warnDetail,
            conflictCustomerId: w.conflictCustomerId,
            conflictVehicleId: w.conflictVehicleId,
          })))
          .execute();
      }
    }

    // Process success rows
    let actualSuccessCount = 0;
    if (progress) {
      progress.stage = 'insert';
      progress.stageTotal = successRows.length;
      progress.stageProcessed = 0;
    }

    // ===== 批量写入 =====
    // 经过校验的 successRows 均为「全新客户 + 全新线索」（命中已有客户的行已进入冲突/失败列表），
    // 因此可安全地整批 INSERT：单条多值 INSERT 的自增 ID 连续分配，据此推算每行的客户/车辆/线索 ID。
    // 任何一批失败（如并发期间他人抢先创建了同号客户触发唯一键），该批自动降级为逐行 createLead，保证行级错误定位。
    const rowHasVehicle = (d: any) => d['车架号'] || d['品牌'] || d['车型'] || d['款式'] || d['车牌号'] || d['发票日期'] || d['里程数'];
    const trimDate = (v: any) => {
      if (!v) return null;
      const s = String(v);
      return s.length > 10 ? s.substring(0, 10) : s;
    };
    const flag01 = (v: any) => (v === '1' || v === 1) ? '1' : '0';

    // 单行导入（降级路径，走完整 createLead 校验逻辑）
    const importOneRow = async (data: any) => {
      try {
        const intentProductIds: string[] = [];
        if (data['意向商品名称'] && productIdByName.has(data['意向商品名称'])) {
          intentProductIds.push(productIdByName.get(data['意向商品名称'])!);
        }
        const intentGiftIds: string[] = [];
        if (data['意向赠品名称'] && productIdByName.has(data['意向赠品名称'])) {
          intentGiftIds.push(productIdByName.get(data['意向赠品名称'])!);
        }

        await this.createLead({
          isNewCustomer: true,
          customerName: data['客户姓名'],
          customerPhone: data['客户电话'],
          carVin: data['车架号'],
          carBrand: data['品牌'],
          carModel: data['车型'],
          carStyle: data['款式'],
          carPlate: data['车牌号'],
          purchaseDate: data['发票日期'],
          carMileage: data['里程数'],
          isMileageOver40k: data['里程≥4万公里（1：是；0：否）'],
          isMileageOver95k: data['里程≥9.5万公里（1：是；0：否）'],
          hasExtendedWarranty: data['是否已购整车延保（1：是；0：否）'],
          hasBatteryWarranty: data['是否已购电池延保（1：是；0：否）'],
          hasPeaceOfMind: data['是否已购安心保（1：是；0：否）'],
          hasTireProtection: data['是否已购轮胎保障（1：是；0：否）'],
          channelSource: data['渠道来源'],
          sourceMethod: data['线索来源方式'],
          sourceDate: data['来源日期'],
          intentProducts: intentProductIds,
          intentGifts: intentGiftIds,
        });
        actualSuccessCount++;
      } catch (err: any) {
        // Capture the error and move this row to failRows
        let errorMsg = err.message || '导入失败';
        if (err.code === 'CUSTOMER_PHONE_EXIST') {
          errorMsg = `客户电话已存在（已关联客户：${err.message}）`;
        } else if (err.code === 'LEAD_STATUS_CONFLICT') {
          errorMsg = `该客户已有活跃线索（${err.statusName}）`;
        } else if (err.code === 'VEHICLE_BIND_CONFLICT') {
          errorMsg = `车辆已绑定其他客户（${err.message}）`;
        } else if (errorMsg.includes('Incorrect date value')) {
          const col = extractDbColumnLabel(errorMsg);
          errorMsg = `${col ? `【${col}】列` : ''}日期格式不正确，请使用 YYYY-MM-DD 格式`;
        } else if (errorMsg.includes('Data too long')) {
          const col = extractDbColumnLabel(errorMsg);
          errorMsg = `${col ? `【${col}】列` : ''}数据长度超出限制${col === '车架号' ? '（车架号最多17位）' : ''}`;
        } else if (errorMsg.includes('Duplicate entry')) {
          errorMsg = '数据重复';
        } else if (errorMsg.includes('Incorrect string value') || errorMsg.includes('Data truncated')) {
          const col = extractDbColumnLabel(errorMsg);
          errorMsg = `${col ? `【${col}】列` : ''}数据格式不正确`;
        }
        
        data['错误信息'] = errorMsg;
        failRows.push(data);
      }
    };

    const BULK_CHUNK = 500;
    for (let start = 0; start < successRows.length; start += BULK_CHUNK) {
      const chunk = successRows.slice(start, start + BULK_CHUNK);
      try {
        await this.dataSource.transaction(async (em) => {
          // 1) 批量创建客户；单语句多值 INSERT 的自增 ID 连续，firstId + 行下标 即每行客户 ID
          const custValues = chunk.map(d => ({
            customerName: d['客户姓名'] || '',
            phone: String(d['客户电话']),
            phoneHash: phoneHashOf.get(d['客户电话'])!,
          }));
          const custRes = await em.createQueryBuilder().insert().into(BizCustomer).values(custValues).execute();
          const firstCustId = Number(custRes.raw.insertId);

          // 2) 批量创建车辆（仅含车辆信息的行）
          const vehRowIdx: number[] = [];
          const vehValues: any[] = [];
          chunk.forEach((d, idx) => {
            if (!rowHasVehicle(d)) return;
            const model = d['款式'] ? `${d['车型'] || ''} ${d['款式']}`.trim() : (d['车型'] || null);
            vehRowIdx.push(idx);
            vehValues.push({
              vin: d['车架号'] || null,
              brand: d['品牌'] || null,
              model,
              style: d['款式'] || null,
              plateNo: d['车牌号'] || null,
              purchaseDate: trimDate(d['发票日期']),
              mileage: d['里程数'] ? Number(d['里程数']) || 0 : 0,
              customerId: String(firstCustId + idx),
              isMileageOver40k: flag01(d['里程≥4万公里（1：是；0：否）']),
              isMileageOver95k: flag01(d['里程≥9.5万公里（1：是；0：否）']),
              hasExtendedWarranty: flag01(d['是否已购整车延保（1：是；0：否）']),
              hasBatteryWarranty: flag01(d['是否已购电池延保（1：是；0：否）']),
              hasPeaceOfMind: flag01(d['是否已购安心保（1：是；0：否）']),
              hasTireProtection: flag01(d['是否已购轮胎保障（1：是；0：否）']),
            });
          });

          // 3) 批量创建线索（待分配状态）
          const leadValues: any[] = chunk.map((d, idx) => ({
            leadCode: genLeadCode(),
            customerId: String(firstCustId + idx),
            vehicleId: null as string | null,
            channelSource: d['渠道来源'],
            sourceMethod: d['线索来源方式'],
            sourceDate: trimDate(d['来源日期']),
            leadStatus: 0,
          }));
          if (vehValues.length > 0) {
            const vehRes = await em.createQueryBuilder().insert().into(BizVehicle).values(vehValues).execute();
            const firstVehId = Number(vehRes.raw.insertId);
            vehRowIdx.forEach((rowIdx, j) => { leadValues[rowIdx].vehicleId = String(firstVehId + j); });
          }
          const leadRes = await em.createQueryBuilder().insert().into(BizLead).values(leadValues).execute();
          const firstLeadId = Number(leadRes.raw.insertId);

          // 4) 批量创建意向商品/赠品关联
          const lpValues: any[] = [];
          chunk.forEach((d, idx) => {
            const pid = d['意向商品名称'] ? productIdByName.get(d['意向商品名称']) : undefined;
            if (pid) lpValues.push({ leadId: String(firstLeadId + idx), productId: pid, productRole: 1 });
            const gid = d['意向赠品名称'] ? productIdByName.get(d['意向赠品名称']) : undefined;
            if (gid) lpValues.push({ leadId: String(firstLeadId + idx), productId: gid, productRole: 2 });
          });
          if (lpValues.length > 0) {
            await em.createQueryBuilder().insert().into(BizLeadProduct).values(lpValues).execute();
          }
        });
        actualSuccessCount += chunk.length;
      } catch (bulkErr: any) {
        // 整批失败 → 降级为逐行导入，保证行级错误定位（每行成功/失败独立计入）
        for (const data of chunk) {
          await importOneRow(data);
        }
      }
      if (progress) {
        progress.stageProcessed = Math.min(start + BULK_CHUNK, successRows.length);
        progress.successCount = actualSuccessCount;
        progress.failCount = failRows.length;
      }
    }

    if (progress) {
      progress.phase = 'done';
      progress.stageProcessed = progress.stageTotal;
      progress.successCount = actualSuccessCount;
      progress.failCount = failRows.length;
      progress.warnCount = warnRows.length;
      progress.finishedAt = Date.now();
    }

    return {
      successCount: actualSuccessCount,
      warnCount: warnRows.length,
      failCount: failRows.length,
      failRows: failRows,
      batchNo: warnRows.length > 0 ? batchNo : undefined,
    };
  }

  async getWarnData(batchNo: string) {
    const BizLeadImportTemp = require('../entities/BizLeadImportTemp').BizLeadImportTemp;
    const items: any[] = await this.dataSource.manager.find(BizLeadImportTemp, {
      where: { batchNo, resolveStatus: 0 },
      order: { id: 'DESC' } as any,
    });
    
    const result = [];
    for (const item of items) {
      const enriched: any = { ...item };
      
      // Enrich conflict customer + all their vehicles
      if (item.conflictCustomerId) {
        const customer = await this.dataSource.manager.findOne(BizCustomer, { where: { id: item.conflictCustomerId } });
        enriched.conflictCustomer = customer ? { id: customer.id, customerName: customer.customerName, phone: customer.phone } : null;
        // Get all vehicles of this customer
        if (customer) {
          const vehicles = await this.dataSource.manager.find(BizVehicle, { where: { customerId: customer.id } });
          enriched.customerVehicles = vehicles.map(v => ({ id: v.id, vin: v.vin, model: v.model, plateNo: v.plateNo, style: v.style }));
        }
      }
      
      // Enrich conflict vehicle + all customers who own this VIN
      if (item.conflictVehicleId) {
        const vehicle = await this.dataSource.manager.findOne(BizVehicle, { where: { id: item.conflictVehicleId } });
        enriched.conflictVehicle = vehicle ? { id: vehicle.id, vin: vehicle.vin, model: vehicle.model, plateNo: vehicle.plateNo, style: vehicle.style, customerId: vehicle.customerId } : null;
        // Get the owner customer
        if (vehicle) {
          const owner = await this.dataSource.manager.findOne(BizCustomer, { where: { id: vehicle.customerId } });
          enriched.vehicleOwners = owner ? [{ id: owner.id, customerName: owner.customerName, phone: owner.phone }] : [];
        }
      }
      
      result.push(enriched);
    }
    return result;
  }

  async resolveWarnItem(id: string, action: string, accountId?: string) {
    const BizLeadImportTemp = require('../entities/BizLeadImportTemp').BizLeadImportTemp;
    const item: any = await this.dataSource.manager.findOne(BizLeadImportTemp, { where: { id } });
    if (!item) throw new Error('警告记录不存在');
    if (item.resolveStatus === 1) throw new Error('该记录已处理');

    const rawData = item.rawData;

    // 沿用/更新系统客户数据时，若该客户已有未完结线索（待分配/待跟进/跟进中/回收待分配），
    // 按约定沿用系统现有客户信息、完全忽略本行导入数据（不创建线索、不改客户资料），直接标记已处理
    if ((action === 'use_system' || action === 'update_system') && item.conflictCustomerId) {
      const activeLead = await this.dataSource.manager.findOne(BizLead, {
        where: { customerId: item.conflictCustomerId, leadStatus: In([0, 1, 2, 6]) },
      });
      if (activeLead) {
        await this.dataSource.manager.update(BizLeadImportTemp, id, {
          resolveStatus: 1,
          resolveAction: action,
          resolvedAt: new Date(),
        } as any);
        return { success: true, skippedLead: true, message: '该客户已存在处理中的线索，已沿用系统客户信息并忽略本行导入数据' };
      }
    }

    switch (action) {
      case 'use_system': {
        // 沿用系统客户数据：线索绑定系统已有客户
        const hasCustomer_use = !!item.conflictCustomerId;
        await this.createLead({
          isNewCustomer: !hasCustomer_use,
          customerId: hasCustomer_use ? item.conflictCustomerId : undefined,
          customerName: rawData['客户姓名'],
          customerPhone: rawData['客户电话'],
          carVin: rawData['车架号'],
          carModel: rawData['车型'],
          carPlate: rawData['车牌号'],
          purchaseDate: rawData['发票日期'],
          channelSource: rawData['渠道来源'],
          sourceMethod: rawData['线索来源方式'],
          sourceDate: rawData['来源日期'],
          isAddWechat: rawData['添加微信状态'],
          purchaseIntention: rawData['购买意向'],
          communicationTendency: rawData['客户沟通倾向'],
          callResult: rawData['呼叫结果'],
          intentProducts: [],
          intentGifts: [],
          forceBindVehicle: true,
        });
        break;
      }
      case 'update_system': {
        // 更新系统客户信息：用导入数据覆盖系统客户有值字段，线索绑定该客户
        // 注意顺序：先校验、再建线索、线索成功后才更新客户资料，避免"报错但资料已被改"的半成功状态
        const updateData: any = {};
        if (item.conflictCustomerId) {
          if (rawData['客户姓名']) updateData.customerName = rawData['客户姓名'];
          if (rawData['身份证号']) {
            updateData.idCardNo = rawData['身份证号'];
            updateData.idCardHash = crypto.createHash('sha256').update(rawData['身份证号']).digest('hex');

            const existIdCard = await this.dataSource.manager.findOne(BizCustomer, { where: { idCardHash: updateData.idCardHash } });
            if (existIdCard && existIdCard.id !== item.conflictCustomerId) {
              throw new Error(`导入的身份证号已被系统客户【${existIdCard.customerName}】绑定，无法用于更新当前客户`);
            }
          }
        }
        const hasCustomer_upd = !!item.conflictCustomerId;
        await this.createLead({
          isNewCustomer: !hasCustomer_upd,
          customerId: hasCustomer_upd ? item.conflictCustomerId : undefined,
          customerName: rawData['客户姓名'],
          customerPhone: rawData['客户电话'],
          carVin: rawData['车架号'],
          carModel: rawData['车型'],
          carPlate: rawData['车牌号'],
          purchaseDate: rawData['发票日期'],
          channelSource: rawData['渠道来源'],
          sourceMethod: rawData['线索来源方式'],
          sourceDate: rawData['来源日期'],
          isAddWechat: rawData['添加微信状态'],
          purchaseIntention: rawData['购买意向'],
          communicationTendency: rawData['客户沟通倾向'],
          callResult: rawData['呼叫结果'],
          intentProducts: [],
          intentGifts: [],
          forceBindVehicle: true,
        });
        if (item.conflictCustomerId && Object.keys(updateData).length > 0) {
          updateData.updatedAt = new Date();
          await this.dataSource.manager.update(BizCustomer, item.conflictCustomerId, updateData);
        }
        break;
      }
      case 'bind_new': {
        // 绑定新客户信息：将车辆绑定到线索中的客户
        if (item.conflictVehicleId && item.conflictCustomerId) {
          // Re-bind vehicle to the import's customer
          await this.dataSource.manager.update(BizVehicle, item.conflictVehicleId, {
            customerId: item.conflictCustomerId,
            updatedAt: new Date(),
          });
        }
        await this.createLead({
          isNewCustomer: item.conflictCustomerId ? false : true,
          customerId: item.conflictCustomerId || undefined,
          customerName: rawData['客户姓名'],
          customerPhone: rawData['客户电话'],
          carVin: rawData['车架号'],
          carModel: rawData['车型'],
          carPlate: rawData['车牌号'],
          purchaseDate: rawData['发票日期'],
          channelSource: rawData['渠道来源'],
          sourceMethod: rawData['线索来源方式'],
          sourceDate: rawData['来源日期'],
          isAddWechat: rawData['添加微信状态'],
          purchaseIntention: rawData['购买意向'],
          communicationTendency: rawData['客户沟通倾向'],
          callResult: rawData['呼叫结果'],
          intentProducts: [],
          intentGifts: [],
          forceBindVehicle: true,
        });
        break;
      }
      case 'overwrite_vehicle': {
        // 覆盖系统车辆信息：用导入数据更新车辆有值字段
        if (item.conflictVehicleId) {
          const updateData: any = { updatedAt: new Date() };
          if (rawData['车牌号']) updateData.plateNo = rawData['车牌号'];
          if (rawData['车型']) updateData.model = rawData['车型'];
          if (rawData['款式']) updateData.style = rawData['款式'];
          if (rawData['发票日期']) updateData.purchaseDate = rawData['发票日期'];
          await this.dataSource.manager.update(BizVehicle, item.conflictVehicleId, updateData);
        }
        await this.createLead({
          isNewCustomer: item.conflictCustomerId ? false : true,
          customerId: item.conflictCustomerId || undefined,
          customerName: rawData['客户姓名'],
          customerPhone: rawData['客户电话'],
          carVin: rawData['车架号'],
          carModel: rawData['车型'],
          carPlate: rawData['车牌号'],
          purchaseDate: rawData['发票日期'],
          channelSource: rawData['渠道来源'],
          sourceMethod: rawData['线索来源方式'],
          sourceDate: rawData['来源日期'],
          isAddWechat: rawData['添加微信状态'],
          purchaseIntention: rawData['购买意向'],
          communicationTendency: rawData['客户沟通倾向'],
          callResult: rawData['呼叫结果'],
          intentProducts: [],
          intentGifts: [],
          forceBindVehicle: true,
        });
        break;
      }
      case 'discard': {
        // 弃用：直接标记处理完成，不创建线索
        break;
      }
      default:
        throw new Error(`未知操作类型：${action}`);
    }

    // Mark as resolved
    await this.dataSource.manager.update(BizLeadImportTemp, id, {
      resolveStatus: 1,
      resolveAction: action,
      resolvedAt: new Date(),
    } as any);

    return { success: true };
  }
  async getLeadById(id: string) {
    return this.leadRepo.createQueryBuilder('lead')
      .leftJoinAndMapOne('lead.customer', BizCustomer, 'customer', 'customer.id = lead.customerId')
      .leftJoinAndMapOne('lead.vehicle', BizVehicle, 'vehicle', 'vehicle.id = lead.vehicleId')
      .leftJoinAndMapMany('lead.products', BizLeadProduct, 'leadProduct', 'leadProduct.leadId = lead.id')
      .leftJoinAndMapOne('leadProduct.product', BizProduct, 'product', 'product.id = leadProduct.productId')
      .where('lead.id = :id', { id })
      .getOne();
  }

  async updateLead(id: string, data: any) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const lead = await queryRunner.manager.findOne(BizLead, { where: { id } });
      if (!lead) throw new Error('Lead not found');

      let customerId = data.customerId || lead.customerId;
      if (data.customerName || data.customerPhone) {
         if (customerId) {
            const customer = await queryRunner.manager.findOne(BizCustomer, { where: { id: customerId }});
            if (customer) {
               if (data.customerPhone && data.customerPhone !== customer.phone) {
                  const phoneHash = crypto.createHash('sha256').update(data.customerPhone).digest('hex');
                  const exist = await queryRunner.manager.findOne(BizCustomer, { where: { phoneHash }});
                  if (exist && exist.id !== customer.id) throw { code: 'CUSTOMER_PHONE_EXIST', customerName: exist.customerName, message: exist.customerName };
                  customer.phoneHash = phoneHash;
               }
               customer.customerName = data.customerName || customer.customerName;
               customer.phone = data.customerPhone || customer.phone;
               await queryRunner.manager.save(customer);
            }
         }
      }

      let vehicleId = lead.vehicleId;
      // Always update vehicle if lead already has one, or if any new vehicle field is provided
      const hasAnyVehicleField = vehicleId || data.carVin || data.carBrand || data.carModel || data.carStyle || data.carPlate || data.carMileage || data.purchaseDate || data.invoiceDate || data.remark;
      if (hasAnyVehicleField) {
         // VIN already bound to another customer: ask for confirmation first;
         // with forceBindVehicle the vehicle is bound to this customer as well (multi-customer)
         if (data.carVin && !data.forceBindVehicle) {
           const vinConflict = await queryRunner.manager.findOne(BizVehicle, {
             where: { vin: data.carVin, customerId: Not(String(lead.customerId)) }
           });
           if (vinConflict) {
             const vinOwner = await queryRunner.manager.findOne(BizCustomer, { where: { id: vinConflict.customerId } });
             throw { code: 'VEHICLE_VIN_EXIST', customerName: vinOwner?.customerName || '', message: `该车辆已存在并绑定了客户【${vinOwner?.customerName || ''}】` };
           }
         }
         if (vehicleId) {
            // Update existing vehicle
            let vehicle = await queryRunner.manager.findOne(BizVehicle, { where: { id: vehicleId }});
            if (vehicle) {
               if (data.carVin && data.carVin !== vehicle.vin) {
                 const exist = await queryRunner.manager.findOne(BizVehicle, { where: { vin: data.carVin, customerId: lead.customerId as string }});
                 if (exist && exist.id !== vehicle.id) {
                    vehicle = exist;
                    lead.vehicleId = exist.id;
                 }
               }
               // 使用 !== undefined 而非 ||，允许用户清空字段
               if (data.carVin !== undefined) vehicle.vin = data.carVin || null;
               if (data.carModel !== undefined || data.carStyle !== undefined) {
                 const model = data.carModel !== undefined ? data.carModel : (vehicle.model || '').split(' ')[0];
                 const style = data.carStyle !== undefined ? data.carStyle : vehicle.style;
                 vehicle.model = style ? `${model} ${style}` : model;
               }
               if (data.carStyle !== undefined) vehicle.style = data.carStyle || null;
               if (data.carPlate !== undefined) vehicle.plateNo = data.carPlate || null;
               let pDate = data.purchaseDate !== undefined ? data.purchaseDate : (data.invoiceDate !== undefined ? data.invoiceDate : undefined);
               if (pDate !== undefined) {
                 if (pDate && pDate.length > 10) pDate = pDate.substring(0, 10);
                 vehicle.purchaseDate = pDate || null;
               }
               if (data.carBrand !== undefined) vehicle.brand = data.carBrand || null;
               if (data.carMileage !== undefined) vehicle.mileage = data.carMileage ? Number(data.carMileage) : 0;
               if (data.remark !== undefined) vehicle.remark = data.remark || null;
               if (data.isMileageOver40k !== undefined) vehicle.isMileageOver40k = data.isMileageOver40k;
               if (data.isMileageOver95k !== undefined) vehicle.isMileageOver95k = data.isMileageOver95k;
               if (data.hasExtendedWarranty !== undefined) vehicle.hasExtendedWarranty = data.hasExtendedWarranty;
               if (data.hasBatteryWarranty !== undefined) vehicle.hasBatteryWarranty = data.hasBatteryWarranty;
               if (data.hasPeaceOfMind !== undefined) vehicle.hasPeaceOfMind = data.hasPeaceOfMind;
               if (data.hasTireProtection !== undefined) vehicle.hasTireProtection = data.hasTireProtection;
               await queryRunner.manager.save(vehicle);
               vehicleId = vehicle.id;
            }
         } else {
            // No vehicle linked yet — create one
            let vehicle = new BizVehicle();
            vehicle.vin = data.carVin || null;
            vehicle.model = data.carStyle ? `${data.carModel || ''} ${data.carStyle}`.trim() : (data.carModel || null);
            vehicle.style = data.carStyle || null;
            vehicle.plateNo = data.carPlate || null;
            let pDate = data.purchaseDate || data.invoiceDate;
            if (pDate && pDate.length > 10) pDate = pDate.substring(0, 10);
            vehicle.purchaseDate = pDate || null;
            vehicle.customerId = lead.customerId as string;
            if (data.carBrand !== undefined) vehicle.brand = data.carBrand;
            if (data.carMileage !== undefined) vehicle.mileage = Number(data.carMileage) || 0;
            if (data.remark !== undefined) vehicle.remark = data.remark;
            if (data.isMileageOver40k !== undefined) vehicle.isMileageOver40k = data.isMileageOver40k;
            if (data.isMileageOver95k !== undefined) vehicle.isMileageOver95k = data.isMileageOver95k;
            if (data.hasExtendedWarranty !== undefined) vehicle.hasExtendedWarranty = data.hasExtendedWarranty;
            if (data.hasBatteryWarranty !== undefined) vehicle.hasBatteryWarranty = data.hasBatteryWarranty;
            if (data.hasPeaceOfMind !== undefined) vehicle.hasPeaceOfMind = data.hasPeaceOfMind;
            if (data.hasTireProtection !== undefined) vehicle.hasTireProtection = data.hasTireProtection;
            vehicle = await queryRunner.manager.save(vehicle);
            vehicleId = vehicle.id;
            lead.vehicleId = vehicleId;
         }
      }

      // Lead 字段也允许清空
      if (data.channelSource !== undefined) lead.channelSource = data.channelSource || null;
      if (data.sourceMethod !== undefined) lead.sourceMethod = data.sourceMethod || null;
      if (data.sourceDate !== undefined) {
        let sDate = data.sourceDate;
        if (sDate && sDate.length > 10) sDate = sDate.substring(0, 10);
        lead.sourceDate = sDate || null;
      }
      
      await queryRunner.manager.save(lead);

      await queryRunner.manager.delete(BizLeadProduct, { leadId: lead.id });
      if (data.intentProducts && data.intentProducts.length > 0) {
        for (const pId of data.intentProducts) {
          const lp = new BizLeadProduct();
          lp.leadId = lead.id;
          lp.productId = pId;
          lp.productRole = 1;
          await queryRunner.manager.save(lp);
        }
      }
      if (data.intentGifts && data.intentGifts.length > 0) {
        for (const pId of data.intentGifts) {
          const lp = new BizLeadProduct();
          lp.leadId = lead.id;
          lp.productId = pId;
          lp.productRole = 2;
          await queryRunner.manager.save(lp);
        }
      }

      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateWechatStatus(id: string, isAddWechat: string) {
    const lead = await this.leadRepo.findOne({ where: { id } });
    if (!lead) throw new Error('Lead not found');
    lead.isAddWechat = isAddWechat;
    await this.leadRepo.save(lead);
    
    if (lead.customerId) {
      const customerWechat = isAddWechat === '已添加' ? '已添加' : '未添加';
      await this.dataSource.manager.update('biz_customer', { id: lead.customerId }, { wechatStatus: customerWechat });
    }
    
    return true;
  }

  async updateLeadProducts(id: string, data: { intentProducts?: string[], intentGifts?: string[] }) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Only delete and update products if intentProducts is provided
      if (data.intentProducts !== undefined) {
        await queryRunner.manager.delete(BizLeadProduct, { leadId: id, productRole: 1 });
        if (data.intentProducts.length > 0) {
          for (const pId of data.intentProducts) {
            const lp = new BizLeadProduct();
            lp.leadId = id;
            lp.productId = pId;
            lp.productRole = 1;
            await queryRunner.manager.save(lp);
          }
        }
      }
      
      // Only delete and update gifts if intentGifts is provided
      if (data.intentGifts !== undefined) {
        await queryRunner.manager.delete(BizLeadProduct, { leadId: id, productRole: 2 });
        if (data.intentGifts.length > 0) {
          for (const pId of data.intentGifts) {
            const lp = new BizLeadProduct();
            lp.leadId = id;
            lp.productId = pId;
            lp.productRole = 2;
            await queryRunner.manager.save(lp);
          }
        }
      }
      
      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async batchAssignLeads(leadIds: string[], accountId: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 批量加载全部线索（外网库延迟高，逐条查询会导致大批量分配超时）
      const leads = await queryRunner.manager.find(BizLead, { where: { id: In(leadIds) } });

      // 1. 曾跟进人冲突校验
      const conflictLeadCodes = leads
        .filter(l => (l.previousAssignees ? l.previousAssignees.split(',') : []).includes(accountId))
        .map(l => l.leadCode);
      if (conflictLeadCodes.length > 0) {
        const account = await queryRunner.manager.findOne(SysAccount, { where: { id: accountId } });
        const salesName = account?.realName || account?.username || '未知销售';
        throw { code: 'ASSIGN_PREV_CONFLICT', message: `${conflictLeadCodes.join('，')}曾被${salesName}销售跟进过，不可再次分配给该销售！`, leadCodes: conflictLeadCodes, salesName };
      }

      // 2. 状态校验
      for (const lead of leads) {
        if (![0, 4, 6].includes(lead.leadStatus)) {
          throw new Error(`线索 ${lead.leadCode} 状态不可分配`);
        }
      }

      const now = new Date();
      const defeatedLeads = leads.filter(l => l.leadStatus === 4);
      const normalLeads = leads.filter(l => l.leadStatus !== 4);

      // 3. 普通线索（待分配/回收待分配）：一条 UPDATE 完成分配
      if (normalLeads.length > 0) {
        await queryRunner.manager.update(BizLead, { id: In(normalLeads.map(l => l.id)) }, {
          assignedAccountId: accountId,
          assignedAt: now,
          leadStatus: 1,
        });
      }

      // 4. 已战败线索：克隆新线索并复制商品/跟进记录（通常为公域池单条领取，保留逐条逻辑）
      for (const lead of defeatedLeads) {
        const newLead = new BizLead();
        newLead.leadCode = genLeadCode();
        newLead.customerId = lead.customerId;
        newLead.vehicleId = lead.vehicleId;
        newLead.channelSource = lead.channelSource;
        newLead.sourceMethod = lead.sourceMethod;
        newLead.sourceDate = lead.sourceDate;
        newLead.isAddWechat = lead.isAddWechat;
        newLead.purchaseIntention = lead.purchaseIntention;
        newLead.communicationTendency = lead.communicationTendency;
        newLead.callResult = lead.callResult;
        newLead.remark = lead.remark;
        newLead.assignedAccountId = accountId;
        newLead.assignedAt = now;
        newLead.leadStatus = 1; // 待跟进
        newLead.parentLeadId = String(lead.id);

        await queryRunner.manager.save(BizLead, newLead);

        const products = await queryRunner.manager.find(BizLeadProduct, { where: { leadId: lead.id } });
        if (products.length > 0) {
          await queryRunner.manager.createQueryBuilder().insert().into(BizLeadProduct).values(
            products.map(p => ({ leadId: newLead.id, productId: p.productId, productRole: p.productRole }))
          ).execute();
        }

        const followRecords = await queryRunner.manager.find(BizFollowRecord, { where: { leadId: lead.id } });
        if (followRecords.length > 0) {
          await queryRunner.manager.createQueryBuilder().insert().into(BizFollowRecord).values(
            followRecords.map(fr => ({
              leadId: newLead.id,
              customerId: fr.customerId,
              accountId: fr.accountId,
              followType: fr.followType,
              followContent: fr.followContent,
              followTime: fr.followTime,
              callResult: fr.callResult,
              communicationTendency: fr.communicationTendency,
            }))
          ).execute();
        }
      }

      // 5. 私域关系批量维护
      const customerIds = [...new Set(leads.map(l => l.customerId).filter(Boolean))] as string[];
      if (customerIds.length > 0) {
        // 5a. 解除其他销售对这些客户的有效关系
        const activeRels = await queryRunner.manager.find(BizPrivateRelation, { where: { customerId: In(customerIds), status: 1 } });
        const deactivateIds = activeRels.filter(r => String(r.accountId) !== String(accountId)).map(r => r.id);
        if (deactivateIds.length > 0) {
          await queryRunner.manager.update(BizPrivateRelation, { id: In(deactivateIds) }, { status: 0, updatedAt: now });
        }

        // 5b. 本销售已有关系：重新激活；没有的：批量新建
        const myRels = await queryRunner.manager.find(BizPrivateRelation, { where: { customerId: In(customerIds), accountId } });
        const myRelCustomerIds = new Set(myRels.map(r => String(r.customerId)));
        const reactivateIds = myRels.filter(r => r.status !== 1).map(r => r.id);
        if (reactivateIds.length > 0) {
          await queryRunner.manager.update(BizPrivateRelation, { id: In(reactivateIds) }, { status: 1, updatedAt: now });
        }
        const toCreate = customerIds.filter(cid => !myRelCustomerIds.has(String(cid)));
        if (toCreate.length > 0) {
          await queryRunner.manager.createQueryBuilder().insert().into(BizPrivateRelation).values(
            toCreate.map(cid => ({ customerId: cid, accountId, firstBindtime: now, status: 1 }))
          ).execute();
        }
      }

      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async voidLead(id: string) {
    const lead = await this.leadRepo.findOne({ where: { id } });
    if (!lead) {
      throw new Error('线索未找到');
    }
    lead.leadStatus = 5;
    await this.leadRepo.save(lead);
    return true;
  }

  async returnToPublic(leadIds: string[]) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      for (const id of leadIds) {
        const lead = await queryRunner.manager.findOne(BizLead, { where: { id } });
        if (lead && lead.assignedAccountId && lead.customerId) {
          const oldAssigneeId = lead.assignedAccountId;
          const customerId = lead.customerId;
          
          // Record the previous assignee
          const prevAssignees = lead.previousAssignees ? lead.previousAssignees.split(',') : [];
          if (!prevAssignees.includes(oldAssigneeId)) {
            prevAssignees.push(oldAssigneeId);
          }
          lead.previousAssignees = prevAssignees.join(',');

          // Clear assignee and set status to 0 (待分配)
          lead.assignedAccountId = null;
          lead.leadStatus = 0; // 0 for public pool
          await queryRunner.manager.save(lead);

          // Invalidate private relation for this customer and the previous sales
          const oldRel = await queryRunner.manager.findOne(BizPrivateRelation, {
            where: { customerId: customerId, accountId: oldAssigneeId, status: 1 }
          });
          if (oldRel) {
            oldRel.status = 0;
            oldRel.updatedAt = new Date();
            await queryRunner.manager.save(oldRel);
          }
        }
      }
      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
