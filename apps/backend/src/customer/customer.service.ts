import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BizCustomer } from '../entities/BizCustomer';
import { BizVehicle } from '../entities/BizVehicle';
import { BizOrder } from '../entities/BizOrder';
import { BizFollowRecord } from '../entities/BizFollowRecord';
import { BizLead } from '../entities/BizLead';
import { BizPrivateRelation } from '../entities/BizPrivateRelation';
import { BizCustomerNote } from '../entities/BizCustomerNote';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(BizCustomer) private readonly customerRepo: Repository<BizCustomer>,
    @InjectRepository(BizVehicle) private readonly vehicleRepo: Repository<BizVehicle>,
    @InjectRepository(BizOrder) private readonly orderRepo: Repository<BizOrder>,
    @InjectRepository(BizFollowRecord) private readonly followRepo: Repository<BizFollowRecord>,
    @InjectRepository(BizLead) private readonly leadRepo: Repository<BizLead>,
    @InjectRepository(BizPrivateRelation) private readonly relationRepo: Repository<BizPrivateRelation>,
    @InjectRepository(BizCustomerNote) private readonly noteRepo: Repository<BizCustomerNote>,
  ) {}

  async create(createDto: Partial<BizCustomer>, bindAccountId?: string) {
    try {
      const phoneHash = crypto.createHash('sha256').update(createDto.phone || '').digest('hex');
      // Check for duplicate phone
      const existing = await this.customerRepo.findOne({ where: { phoneHash } });
      if (existing) {
        throw new BadRequestException('该电话号码已存在！');
      }
      const customer = this.customerRepo.create({ ...createDto, phoneHash });
      const saved = await this.customerRepo.save(customer);
      // 销售新建的客户立即建立私域关系：否则后续车辆/订单等接口的归属校验会把创建者自己挡在门外
      if (bindAccountId) {
        const rel = this.relationRepo.create({ customerId: saved.id, accountId: bindAccountId, status: 1, firstBindtime: new Date() });
        await this.relationRepo.save(rel);
      }
      return saved;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error?.code === 'ER_DUP_ENTRY' || error?.message?.includes('Duplicate')) {
        throw new BadRequestException('该电话号码已存在！');
      }
      throw error;
    }
  }

  // A sales person can reach a customer if they have an active private relation,
  // or the customer is linked to a lead currently assigned to them
  async isCustomerReachable(customerId: string, accountId: string): Promise<boolean> {
    const rel = await this.relationRepo.findOne({ where: { customerId, accountId, status: 1 } });
    if (rel) return true;
    const lead = await this.leadRepo.findOne({ where: { customerId, assignedAccountId: accountId } });
    if (lead) return true;
    // 名下有自己跟进的订单也算可达（线索重新分配未连带订单时，原跟进人仍需访问客户/车辆信息）
    const order = await this.orderRepo.findOne({ where: { customerId, salespersonId: accountId, isDraft: 0 } });
    return !!order;
  }

  async getCustomers(query: any) {
    const { page = 1, limit = 10, customerName, phone, search, ownerId, idCardNo } = query;
    const qb = this.customerRepo.createQueryBuilder('customer');

    // If ownerId is set, only show customers reachable by this sales person:
    // active private relation, or linked to a lead currently assigned to them
    if (ownerId) {
      qb.andWhere(
        `(EXISTS (SELECT 1 FROM biz_private_relation pr WHERE pr.customer_id = customer.id AND pr.account_id = :ownerId AND pr.status = 1)
          OR EXISTS (SELECT 1 FROM biz_lead l WHERE l.customer_id = customer.id AND l.assigned_account_id = :ownerId))`,
        { ownerId },
      );
    }
    
    if (search) {
      qb.andWhere('(customer.customerName LIKE :search OR customer.phone LIKE :search)', { search: `%${search}%` });
    }
    if (customerName) {
      qb.andWhere('customer.customerName LIKE :name', { name: `%${customerName}%` });
    }
    if (phone) {
      qb.andWhere('customer.phone LIKE :phone', { phone: `%${phone}%` });
    }
    if (idCardNo) {
      qb.andWhere('customer.idCardNo LIKE :idCardNo', { idCardNo: `%${idCardNo}%` });
    }
    const pageNum = Number(page);
    const limitNum = Number(limit);
    qb.orderBy('customer.createdAt', 'DESC');
    const [items, total] = await qb.skip((pageNum - 1) * limitNum).take(limitNum).getManyAndCount();
    
    if (items.length > 0) {
      const customerIds = items.map(c => c.id);
      const relations = await this.relationRepo.createQueryBuilder('pr')
        .innerJoin('sys_account', 'acc', 'acc.id = pr.account_id')
        .where('pr.customer_id IN (:...customerIds)', { customerIds })
        .andWhere('pr.status = 1')
        .select('pr.customer_id', 'customerId')
        .addSelect('acc.realName', 'realName')
        .getRawMany();
      
      const relMap = new Map();
      relations.forEach(r => relMap.set(String(r.customerId), r.realName));
      
      const notes = await this.noteRepo.createQueryBuilder('note')
        .where('note.customerId IN (:...customerIds)', { customerIds })
        .orderBy('note.createdAt', 'DESC')
        .getMany();
        
      const latestNoteMap = new Map();
      notes.forEach(n => {
        if (!latestNoteMap.has(String(n.customerId))) {
          latestNoteMap.set(String(n.customerId), n.noteContent);
        }
      });
      
      for (const item of items) {
        (item as any).ownerName = relMap.get(String(item.id)) || null;
        item.remark = latestNoteMap.get(String(item.id)) || item.remark;
      }
    }

    return { items, total, page: Number(page), limit: Number(limit) };
  }

  async getCustomersForExport(query: any) {
    const { customerName, phone, search, ownerId, idCardNo } = query;
    const qb = this.customerRepo.createQueryBuilder('customer');

    // If ownerId is set, only show customers reachable by this sales person:
    // active private relation, or linked to a lead currently assigned to them
    if (ownerId) {
      qb.andWhere(
        `(EXISTS (SELECT 1 FROM biz_private_relation pr WHERE pr.customer_id = customer.id AND pr.account_id = :ownerId AND pr.status = 1)
          OR EXISTS (SELECT 1 FROM biz_lead l WHERE l.customer_id = customer.id AND l.assigned_account_id = :ownerId))`,
        { ownerId },
      );
    }
    
    if (search) {
      qb.andWhere('(customer.customerName LIKE :search OR customer.phone LIKE :search)', { search: `%${search}%` });
    }
    if (customerName) {
      qb.andWhere('customer.customerName LIKE :name', { name: `%${customerName}%` });
    }
    if (phone) {
      qb.andWhere('customer.phone LIKE :phone', { phone: `%${phone}%` });
    }
    if (idCardNo) {
      qb.andWhere('customer.idCardNo LIKE :idCardNo', { idCardNo: `%${idCardNo}%` });
    }
    qb.orderBy('customer.createdAt', 'DESC');
    const customers = await qb.getMany();

    if (customers.length === 0) return [];

    const customerIds = customers.map(c => c.id);
    const vehicles = await this.vehicleRepo.createQueryBuilder('v')
      .where('v.customerId IN (:...customerIds)', { customerIds })
      .getMany();

    const vehicleMap = new Map<string, any[]>();
    for (const v of vehicles) {
       if (!vehicleMap.has(v.customerId)) {
          vehicleMap.set(v.customerId, []);
       }
       vehicleMap.get(v.customerId)!.push(v);
    }

    const notes = await this.noteRepo.createQueryBuilder('note')
      .where('note.customerId IN (:...customerIds)', { customerIds })
      .orderBy('note.createdAt', 'DESC')
      .getMany();
      
    const latestNoteMap = new Map();
    notes.forEach(n => {
      if (!latestNoteMap.has(String(n.customerId))) {
        latestNoteMap.set(String(n.customerId), n.noteContent);
      }
    });

    const result = [];
    for (const c of customers) {
      c.remark = latestNoteMap.get(String(c.id)) || c.remark;
      const cvs = vehicleMap.get(c.id) || [];
      if (cvs.length === 0) {
        result.push({ ...c, vehicle: null });
      } else {
        for (const v of cvs) {
          result.push({ ...c, vehicle: v });
        }
      }
    }
    return result;
  }

  async getCustomer360View(id: string) {
    const customer = await this.customerRepo.findOne({ where: { id } });
    if (!customer) return null;
    
    const vehicles = await this.vehicleRepo.find({ where: { customerId: id } });
    const orders = await this.orderRepo.find({ where: { customerId: id } });

    // Leads with assigned account name
    const leads = await this.leadRepo.createQueryBuilder('l')
      .leftJoin('sys_account', 'acc', 'l.assignedAccountId = acc.id')
      .select('l.*')
      .addSelect('l.id', 'id')
      .addSelect('acc.realName', 'assignedAccountName')
      .addSelect('acc.username', 'assignedAccountUsername')
      .where('l.customerId = :id', { id })
      .orderBy('l.createdAt', 'DESC')
      .getRawMany();

    if (leads.length > 0) {
      const leadIds = leads.map((l: any) => l.id);
      const leadProducts = await this.leadRepo.query(
        `SELECT lp.lead_id AS leadId, lp.product_role AS productRole, p.product_name AS productName
         FROM biz_lead_product lp
         LEFT JOIN biz_product p ON lp.product_id = p.id
         WHERE lp.lead_id IN (${leadIds.map(() => '?').join(',')})`,
        leadIds
      );
      leads.forEach((l: any) => {
        const related = leadProducts.filter((lp: any) => String(lp.leadId) === String(l.id));
        l.intentProduct = related.filter((lp: any) => lp.productRole === 1).map((lp: any) => lp.productName).join(', ') || '-';
        l.intentGift = related.filter((lp: any) => lp.productRole === 2).map((lp: any) => lp.productName).join(', ') || '-';
      });
    }

    // Follow records with account name and lead code
    const follows = await this.followRepo.createQueryBuilder('f')
      .leftJoin('sys_account', 'acc', 'f.accountId = acc.id')
      .leftJoin('biz_lead', 'ld', 'f.leadId = ld.id')
      .select('f.id', 'id')
      .addSelect('f.follow_time', 'followTime')
      .addSelect('f.follow_content', 'followContent')
      .addSelect('f.call_result', 'callResult')
      .addSelect('acc.realName', 'accountName')
      .addSelect('acc.username', 'accountUsername')
      .addSelect('f.account_id', 'accountId')
      .addSelect('ld.leadCode', 'leadCode')
      .addSelect('IFNULL(f.communication_tendency, ld.communicationTendency)', 'communicationTendency')
      .addSelect('IFNULL(f.purchase_intention, ld.purchaseIntention)', 'purchaseIntention')
      .addSelect('IFNULL(f.next_plan_time, ld.nextFollowAt)', 'nextFollowAt')
      .addSelect('IFNULL(f.lead_status, ld.leadStatus)', 'leadStatus')
      .where('f.customerId = :id', { id })
      .orderBy('f.followTime', 'DESC')
      .getRawMany();

    const relations = await this.relationRepo.createQueryBuilder('pr')
      .innerJoin('sys_account', 'acc', 'pr.account_id = acc.id')
      .where('pr.customer_id = :id', { id })
      .andWhere('pr.status = 1')
      .select('pr.id', 'id')
      .addSelect('pr.account_id', 'accountId')
      .addSelect('pr.customer_id', 'customerId')
      .addSelect('pr.status', 'status')
      .addSelect('acc.realName', 'ownerName')
      .getRawMany();

    let ownerName = null;
    if (relations.length > 0) {
      ownerName = relations.map(r => r.ownerName).join(', ');
    } else if (leads && leads.length > 0) {
      const leadOwners = leads
        .map((l: any) => l.assignedAccountName)
        .filter((name: any) => name);
      const uniqueOwners = Array.from(new Set(leadOwners));
      if (uniqueOwners.length > 0) {
        ownerName = uniqueOwners.join(', ');
      }
    }

    // 微信状态直接透传字典取值（添加待通过/已通过/拒绝添加/未添加），
    // 有线索时以最新线索的状态为准，不再压缩为已添加/未添加二值
    let wechatStatus = customer.wechatStatus || '未添加';
    if (leads && leads.length > 0 && leads[0].is_add_wechat) {
      wechatStatus = leads[0].is_add_wechat;
    }

    // Notes with creator info
    const notes = await this.getCustomerNotes(id);
    
    return {
      ...customer,
      wechatStatus,
      ownerName,
      vehicles,
      orders,
      leads,
      follows,
      relations,
      notes,
    };
  }

  async updateCustomer(id: string, updateDto: any) {
    const customer = await this.customerRepo.findOne({ where: { id } });
    if (!customer) throw new Error('Customer not found');

    if (updateDto.customerName !== undefined) customer.customerName = updateDto.customerName;
    if (updateDto.idCardNo !== undefined) {
      // Check for duplicate ID card number (exclude current customer)
      if (updateDto.idCardNo && updateDto.idCardNo.trim()) {
        const existing = await this.customerRepo.findOne({
          where: { idCardNo: updateDto.idCardNo.trim() },
        });
        if (existing && String(existing.id) !== String(id)) {
          throw new Error(`身份证号已重复，客户「${existing.customerName}」已使用该身份证号，请检查身份证信息是否正确`);
        }
      }
      customer.idCardNo = updateDto.idCardNo;
    }
    if (updateDto.phone !== undefined && updateDto.phone !== customer.phone) {
      customer.phone = updateDto.phone;
      customer.phoneHash = crypto.createHash('sha256').update(updateDto.phone).digest('hex');
    }
    if (updateDto.gender !== undefined) customer.gender = updateDto.gender;
    if (updateDto.birthday !== undefined) customer.birthday = updateDto.birthday ? updateDto.birthday.substring(0, 10) : null;
    if (updateDto.wechatStatus !== undefined) {
      customer.wechatStatus = updateDto.wechatStatus;
      await this.customerRepo.manager.update('biz_lead', { customerId: id }, { isAddWechat: updateDto.wechatStatus });
    }

    await this.customerRepo.save(customer);
    return customer;
  }

  // 从现有车辆数据中提取去重后的品牌 / 车型 / 款式，供前端可搜索下拉候选
  async getVehicleOptions() {
    const pick = async (col: string): Promise<string[]> => {
      const rows = await this.vehicleRepo.createQueryBuilder('v')
        .select(`DISTINCT v.${col}`, 'val')
        .where(`v.${col} IS NOT NULL AND v.${col} <> ''`)
        .orderBy('val', 'ASC')
        .getRawMany();
      return rows.map(r => r.val).filter(Boolean);
    };
    const [brands, models, styles] = await Promise.all([pick('brand'), pick('model'), pick('style')]);
    return { brands, models, styles };
  }

  // 数字/日期/布尔列传空字符串会导致 MySQL 写库报错（如 Incorrect integer value: '' for 'mileage'），统一转为 null
  private normalizeVehicleDto(dto: any) {
    const nonTextFields = [
      'mileage', 'purchaseDate',
      'isMileageOver40k', 'isMileageOver95k', 'hasExtendedWarranty',
      'hasBatteryWarranty', 'hasPeaceOfMind', 'hasTireProtection'
    ];
    for (const f of nonTextFields) {
      if (dto[f] === '') dto[f] = null;
    }
  }

  async updateVehicle(id: string, updateDto: any) {
    const vehicle = await this.vehicleRepo.findOne({ where: { id } });
    if (!vehicle) throw new Error('Vehicle not found');

    this.normalizeVehicleDto(updateDto);

    // 里程数容错：数据库列为数字类型，非数字输入直接拦截，避免写库报错
    if (updateDto.mileage !== undefined && updateDto.mileage !== null && updateDto.mileage !== '') {
      const mileageNum = Number(String(updateDto.mileage).trim());
      if (Number.isNaN(mileageNum) || mileageNum < 0) {
        throw new BadRequestException('里程数必须为非负数字');
      }
      updateDto.mileage = Math.floor(mileageNum);
    }

    const fields = [
      'brand', 'model', 'style', 'vin', 'plateNo', 'purchaseDate', 'mileage',
      'isMileageOver40k', 'isMileageOver95k', 'hasExtendedWarranty',
      'hasBatteryWarranty', 'hasPeaceOfMind', 'hasTireProtection'
    ];

    for (const field of fields) {
      if (updateDto[field] !== undefined) {
        (vehicle as any)[field] = updateDto[field];
      }
    }

    try {
      await this.vehicleRepo.save(vehicle);
      return vehicle;
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY' && error.message.includes('vin')) {
        throw new BadRequestException('该车架号(VIN)已被其他车辆使用，请检查后重试。');
      }
      throw error;
    }
  }

  async createVehicle(createDto: any) {
    if (!createDto.customerId) throw new Error('customerId is required');

    this.normalizeVehicleDto(createDto);
    if (createDto.mileage !== undefined && createDto.mileage !== null) {
      const mileageNum = Number(String(createDto.mileage).trim());
      if (Number.isNaN(mileageNum) || mileageNum < 0) {
        throw new BadRequestException('里程数必须为非负数字');
      }
      createDto.mileage = Math.floor(mileageNum);
    }

    const vehicle = this.vehicleRepo.create();
    vehicle.customerId = createDto.customerId;
    const fields = [
      'brand', 'model', 'style', 'vin', 'plateNo', 'purchaseDate', 'mileage',
      'isMileageOver40k', 'isMileageOver95k', 'hasExtendedWarranty',
      'hasBatteryWarranty', 'hasPeaceOfMind', 'hasTireProtection', 'remark'
    ];

    for (const f of fields) {
      if (createDto[f] !== undefined) {
        (vehicle as any)[f] = createDto[f];
      }
    }

    try {
      await this.vehicleRepo.save(vehicle);

      if (createDto.leadId) {
        await this.vehicleRepo.manager.update(BizLead, createDto.leadId, { vehicleId: vehicle.id });
      }

      return vehicle;
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY' && error.message.includes('vin')) {
        throw new BadRequestException('该车架号(VIN)已被其他车辆使用，请检查后重试。');
      }
      if (error.code === 'ER_DATA_TOO_LONG') {
        throw new BadRequestException('输入的数据过长，请检查后重试。例如：车架号(VIN)最多17位。');
      }
      throw error;
    }
  }

  /** 客户名下未失效（vehicle_status=1）的车辆，订单创建第三步下拉用 */
  async getActiveVehicles(customerId: string) {
    return this.vehicleRepo.find({
      where: { customerId, vehicleStatus: 1 },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteVehicle(id: string) {
    const vehicle = await this.vehicleRepo.findOne({ where: { id } });
    if (!vehicle) throw new Error('Vehicle not found');
    await this.vehicleRepo.remove(vehicle);
    return { success: true };
  }

  async getCustomerNotes(id: string) {
    return this.noteRepo.createQueryBuilder('note')
      .leftJoin('sys_account', 'account', 'note.createdBy = account.id')
      .select('note.id', 'id')
      .addSelect('note.customerId', 'customerId')
      .addSelect('note.noteContent', 'noteContent')
      .addSelect('note.createdBy', 'createdBy')
      .addSelect('note.createdAt', 'createdAt')
      .addSelect('account.realName', 'createdByName')
      .addSelect('account.username', 'createdByAccount')
      .where('note.customerId = :id', { id })
      .orderBy('note.createdAt', 'DESC')
      .getRawMany();
  }

  async createCustomerNote(id: string, data: any) {
    const note = this.noteRepo.create({
      customerId: id,
      createdBy: data.accountId, // from frontend
      noteContent: data.noteContent
    });
    return this.noteRepo.save(note);
  }
  async getRecentFollowedCustomers(accountId: string) {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const customers = await this.customerRepo.createQueryBuilder('c')
      .innerJoin(
        qb => qb.select('f.customer_id', 'cid')
                .from('biz_follow_record', 'f')
                .where('f.account_id = :accountId', { accountId })
                .andWhere('f.follow_time >= :oneWeekAgo', { oneWeekAgo })
                .andWhere('f.customer_id IS NOT NULL')
                .groupBy('f.customer_id'),
        'recent_f',
        'recent_f.cid = c.id'
      )
      .innerJoin('biz_private_relation', 'pr', 'pr.customer_id = c.id AND pr.account_id = :accountId AND pr.status = 1', { accountId })
      .select('c.id', 'customerId')
      .addSelect('c.customerName', 'customerName')
      .getRawMany();

    for (const c of customers) {
      const latestNote = await this.noteRepo.createQueryBuilder('note')
        .where('note.customerId = :id', { id: c.customerId })
        .orderBy('note.createdAt', 'DESC')
        .select('note.noteContent', 'noteContent')
        .getRawOne();
      c.latestNote = latestNote ? latestNote.noteContent : '暂无备注';

      // Latest lead of this customer assigned to the sales person, for direct jump to the 360 view
      const latestLead = await this.leadRepo.findOne({
        where: { customerId: c.customerId, assignedAccountId: accountId },
        order: { createdAt: 'DESC' },
      });
      c.leadId = latestLead ? latestLead.id : null;
    }

    return customers;
  }
}
