import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { BizOrder } from '../entities/BizOrder';
import { BizOrderItem } from '../entities/BizOrderItem';
import { BizCustomer } from '../entities/BizCustomer';
import { BizFollowRecord } from '../entities/BizFollowRecord';
import { BizLead } from '../entities/BizLead';
import { BizVehicle } from '../entities/BizVehicle';
import { BizProduct } from '../entities/BizProduct';
import { SysAccount } from '../entities/SysAccount';
import { SysOperationLog } from '../entities/SysOperationLog';

/** 订单状态（PRD 4.2.2） */
export const ORDER_STATUS = {
  PENDING_SEND_SIGN: 0,   // 待发送电子签
  PENDING_SIGN: 1,        // 待签署电子签
  PENDING_THIRD_ORDER: 2, // 待三方下单
  PENDING_DELIVERY: 3,    // 待发货
  COMPLETED: 4,           // 已完结
  VOIDED: 5,              // 已作废
} as const;

export const ORDER_STATUS_TEXT: Record<number, string> = {
  0: '待发送电子签',
  1: '待签署电子签',
  2: '待三方下单',
  3: '待发货',
  4: '已完结',
  5: '已作废',
};

/** 线索「订单情况」（PRD 4.2.4.1） */
export const ORDER_SITUATION = {
  NONE: 0,        // 未下单
  HAS_OPEN: 1,    // 存在未完结订单
  ALL_VOIDED: 2,  // 全部订单已作废
  ALL_DONE: 3,    // 全部订单已完结
} as const;

/** 需要走电子签流程的商品类型（PRD 配图 image3：延保走电子签，其他直接到待三方下单） */
const WARRANTY_TYPES = ['整车延保', '电池延保'];

/** 订单终态：不可再流转 */
const FINAL_STATUSES: number[] = [ORDER_STATUS.COMPLETED, ORDER_STATUS.VOIDED];

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(BizOrder)
    private readonly orderRepo: Repository<BizOrder>,
    @InjectRepository(BizOrderItem)
    private readonly orderItemRepo: Repository<BizOrderItem>,
    private readonly dataSource: DataSource,
  ) {}

  // ============================================================
  // 工具方法
  // ============================================================

  /** 订单编号：ORD + yyyyMMdd + 3位当日流水（PRD 配图 image5 ORD20231015001） */
  private async genOrderCode(manager: any): Promise<string> {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const prefix = `ORD${ymd}`;
    const rows = await manager.query(
      'SELECT order_code FROM biz_order WHERE order_code LIKE ? ORDER BY order_code DESC LIMIT 1',
      [`${prefix}%`],
    );
    let seq = 1;
    if (rows.length) {
      const tail = String(rows[0].order_code).slice(prefix.length);
      const n = parseInt(tail, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  /** 写线索跟进记录（订单状态变更时，操作人记为系统）——PRD 4.2.3.1 各状态流转要求 */
  private async addSystemFollowRecord(manager: any, lead: BizLead, content: string, operatorId?: string) {
    const rec = new BizFollowRecord();
    rec.leadId = lead.id;
    rec.customerId = lead.customerId;
    // follow_type 非空；沿用系统写入的类型 2（与既有系统记录一致）
    rec.followType = 2;
    // 操作人记为「系统」（PRD 4.2.3.1）：accountId=0 为系统专用标识，前端据此展示「系统」
    rec.accountId = '0';
    rec.followContent = content;
    rec.followTime = new Date();
    await manager.save(BizFollowRecord, rec);
  }

  /** 写订单操作日志（PRD 4.3.3 定义的日志结构，复用 sys_operation_log） */
  private async addOperationLog(
    manager: any,
    params: { orderId: string; accountId?: string; action: string; content: string },
  ) {
    const log = new SysOperationLog();
    log.accountId = params.accountId || '0';
    log.module = 'order';
    log.action = params.action;
    log.targetType = 'order';
    log.targetId = params.orderId;
    log.detail = { content: params.content } as any;
    await manager.save(SysOperationLog, log);
  }

  /**
   * 重算线索的「订单情况」（PRD 4.2.4.1）
   * 无订单=未下单；存在未完结=存在未完结订单；全作废=全部订单已作废；全完结=全部订单已完结
   */
  private async recalcLeadOrderSituation(manager: any, leadId: string) {
    if (!leadId) return;
    const orders: BizOrder[] = await manager.find(BizOrder, { where: { leadId, isDraft: 0 } });
    let situation: number = ORDER_SITUATION.NONE;
    if (orders.length > 0) {
      const hasOpen = orders.some(o => !FINAL_STATUSES.includes(o.orderStatus));
      const allVoided = orders.every(o => o.orderStatus === ORDER_STATUS.VOIDED);
      if (hasOpen) situation = ORDER_SITUATION.HAS_OPEN;
      else if (allVoided) situation = ORDER_SITUATION.ALL_VOIDED;
      // 既有已完结又有已作废（且无未完结）：按「全部订单已完结」处理，视为该线索订单流程已结束
      else situation = ORDER_SITUATION.ALL_DONE;
    }
    await manager.update(BizLead, leadId, { orderSituation: situation });
  }

  /** 校验当前登录人是否为订单跟进人（PRD 4.2.3：仅跟进人具备订单操作权限） */
  private assertFollower(order: BizOrder, req: any) {
    const user = req?.user;
    if (!user) throw new ForbiddenException('未登录');
    if (user.isSuperAdmin) return; // 超管不受限
    if (String(order.salespersonId || '') !== String(user.sub)) {
      throw new ForbiddenException('您不是该订单的跟进人，无法操作该订单');
    }
  }

  /** 作废专用行级校验：跟进人本人 或 具备订单管理权限（管理侧可作废他人订单）——订单权限细分方案 */
  private assertFollowerOrOrderAdmin(order: BizOrder, req: any) {
    const user = req?.user;
    if (!user) throw new ForbiddenException('未登录');
    if (user.isSuperAdmin) return;
    if ((user.permissions || []).includes('order')) return;
    if (String(order.salespersonId || '') !== String(user.sub)) {
      throw new ForbiddenException('您不是该订单的跟进人，无法作废该订单');
    }
  }

  // ============================================================
  // 查询
  // ============================================================

  /**
   * 订单列表（PRD 4.2.3）
   * 支持：订单编号、客户姓名、客户电话、下单平台、平台/三方订单编号、车架号、状态(多选)、跟进人、创建时间区间
   * 排序：默认创建时间倒序；支持创建时间/更新时间排序（PRD 4.2.3.1）
   */
  async getOrders(query: any) {
    const {
      page = 1, limit = 10,
      orderCode, customerName, customerPhone, orderPlatform, platformOrderNo, thirdOrderNo,
      vin, orderStatus, salespersonId, createdAtStart, createdAtEnd,
      sortField, sortOrder, leadId, customerId,
    } = query;

    const qb = this.orderRepo.createQueryBuilder('order')
      .leftJoinAndMapOne('order.customer', BizCustomer, 'customer', 'customer.id = order.customerId')
      .leftJoinAndMapOne('order.lead', BizLead, 'lead', 'lead.id = order.leadId')
      .leftJoinAndMapOne('order.salesperson', SysAccount, 'sales', 'sales.id = order.salespersonId')
      .leftJoinAndMapOne('order.creator', SysAccount, 'creator', 'creator.id = order.creatorId')
      .leftJoinAndMapOne('order.updater', SysAccount, 'updater', 'updater.id = order.updaterId')
      // 草稿订单不出现在任何列表中（三步式创建过程中的中间态）
      .where('order.isDraft = 0');

    if (orderCode) qb.andWhere('order.orderCode LIKE :orderCode', { orderCode: `%${orderCode}%` });
    if (customerName) qb.andWhere('customer.customerName LIKE :customerName', { customerName: `%${customerName}%` });
    if (customerPhone) qb.andWhere('customer.phone LIKE :customerPhone', { customerPhone: `%${customerPhone}%` });
    if (orderPlatform) qb.andWhere('order.orderPlatform = :orderPlatform', { orderPlatform });
    if (platformOrderNo) qb.andWhere('order.platformOrderNo LIKE :platformOrderNo', { platformOrderNo: `%${platformOrderNo}%` });
    if (thirdOrderNo) qb.andWhere('order.thirdOrderNo LIKE :thirdOrderNo', { thirdOrderNo: `%${thirdOrderNo}%` });
    if (vin) qb.andWhere('order.snapVehicleVin LIKE :vin', { vin: `%${vin}%` });
    if (salespersonId) qb.andWhere('order.salespersonId = :salespersonId', { salespersonId });
    if (leadId) qb.andWhere('order.leadId = :leadId', { leadId });
    if (query.leadIds?.length) qb.andWhere('order.leadId IN (:...leadIds)', { leadIds: query.leadIds });
    if (customerId) qb.andWhere('order.customerId = :customerId', { customerId });
    if (orderStatus !== undefined && orderStatus !== '' && orderStatus !== null) {
      const list = String(orderStatus).split(',').map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
      if (list.length) qb.andWhere('order.orderStatus IN (:...orderStatusList)', { orderStatusList: list });
    }
    if (createdAtStart) qb.andWhere('order.createdAt >= :createdAtStart', { createdAtStart: `${createdAtStart} 00:00:00` });
    if (createdAtEnd) qb.andWhere('order.createdAt <= :createdAtEnd', { createdAtEnd: `${createdAtEnd} 23:59:59` });

    // 排序：仅开放创建时间/更新时间，默认创建时间倒序
    const sortMap: Record<string, string> = { createdAt: 'order.createdAt', updatedAt: 'order.updatedAt' };
    const field = sortMap[sortField] || 'order.createdAt';
    const dir: 'ASC' | 'DESC' = sortOrder === 'ascend' ? 'ASC' : 'DESC';
    qb.orderBy(field, dir);

    const pageNum = Number(page), limitNum = Number(limit);
    const [items, total] = await qb.skip((pageNum - 1) * limitNum).take(limitNum).getManyAndCount();

    // 批量补商品明细，避免 N+1
    if (items.length) {
      const ids = items.map(o => o.id);
      const allItems = await this.orderItemRepo.find({ where: { orderId: In(ids) } });
      const byOrder = new Map<string, BizOrderItem[]>();
      allItems.forEach(it => {
        if (!byOrder.has(it.orderId)) byOrder.set(it.orderId, []);
        byOrder.get(it.orderId)!.push(it);
      });
      items.forEach((o: any) => { o.items = byOrder.get(o.id) || []; });
    }

    return { items, total, page: pageNum, limit: limitNum };
  }

  /** 订单详情（PRD 配图 image5：基础信息 + 线索与客户 + 车辆 + 商品/赠品 + 操作日志） */
  async getOrderById(id: string) {
    const order: any = await this.orderRepo.createQueryBuilder('order')
      .leftJoinAndMapOne('order.customer', BizCustomer, 'customer', 'customer.id = order.customerId')
      .leftJoinAndMapOne('order.lead', BizLead, 'lead', 'lead.id = order.leadId')
      .leftJoinAndMapOne('order.vehicle', BizVehicle, 'vehicle', 'vehicle.id = order.vehicleId')
      .leftJoinAndMapOne('order.salesperson', SysAccount, 'sales', 'sales.id = order.salespersonId')
      .leftJoinAndMapOne('order.creator', SysAccount, 'creator', 'creator.id = order.creatorId')
      .leftJoinAndMapOne('order.updater', SysAccount, 'updater', 'updater.id = order.updaterId')
      .where('order.id = :id', { id })
      .getOne();
    if (!order) throw new NotFoundException('订单不存在');

    const items = await this.orderItemRepo.find({ where: { orderId: id } });
    order.products = items.filter(i => i.productRole === 1); // 商品信息
    order.gifts = items.filter(i => i.productRole === 2);     // 赠品信息

    // 操作日志：按时间倒序
    const logs = await this.dataSource.getRepository(SysOperationLog).find({
      where: { targetType: 'order', targetId: id },
      // created_at 精度到秒，同秒写入的多条日志需再按 id 倒序，保证时间线顺序稳定
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    const accountIds = [...new Set(logs.map(l => String(l.accountId)).filter(Boolean))];
    const accounts = accountIds.length
      ? await this.dataSource.getRepository(SysAccount).find({ where: { id: In(accountIds) } })
      : [];
    const accMap = new Map(accounts.map(a => [String(a.id), a]));
    order.operationLogs = logs.map(l => {
      const acc = accMap.get(String(l.accountId));
      return {
        id: l.id,
        action: l.action,
        // 操作人记录格式：姓名（账号）；无账号时记为「系统（system）」
        operator: acc ? `${acc.realName || acc.username}（${acc.username}）` : '系统（system）',
        content: (l.detail as any)?.content || '',
        createdAt: l.createdAt,
      };
    });

    return order;
  }

  async getOrdersByCustomer(customerId: string) {
    const res = await this.getOrders({ customerId, page: 1, limit: 200 });
    return res.items;
  }

  /** 线索维度历史订单：当前线索 + 沿父链所有父线索关联的订单（线索详情页历史订单 tab，PRD 4.3.5） */
  async getOrdersByLeadChain(leadId: string) {
    const chain: string[] = [];
    let cursor: string | null = leadId;
    for (let depth = 0; cursor && depth < 10; depth++) {
      if (chain.includes(String(cursor))) break;
      chain.push(String(cursor));
      const rows: any[] = await this.orderRepo.manager.query('SELECT parent_lead_id FROM biz_lead WHERE id = ?', [cursor]);
      cursor = rows[0]?.parent_lead_id ? String(rows[0].parent_lead_id) : null;
    }
    const res = await this.getOrders({ leadIds: chain, page: 1, limit: 200 });
    return res.items;
  }

  /** 我的跟单订单：按状态统计数量（工作台 tab 的筛选 pills，PRD 配图 image8） */
  async getStatusCount(salespersonId: string) {
    const rows = await this.orderRepo.createQueryBuilder('order')
      .select('order.orderStatus', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .where('order.salespersonId = :salespersonId', { salespersonId })
      .andWhere('order.isDraft = 0')
      .groupBy('order.orderStatus')
      .getRawMany();
    const byStatus: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    rows.forEach((r: any) => { byStatus[Number(r.status)] = Number(r.cnt); });
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return { total, byStatus };
  }

  // A sales person can reach a customer if they have an active private relation,
  // or the customer is linked to a lead currently assigned to them
  async isCustomerAccessibleBy(customerId: string, accountId: string): Promise<boolean> {
    // 可达 = 有效私域关系 / 名下有分配给自己的线索 / 名下有自己跟进的订单
    // 第三条覆盖「线索重新分配未连带订单」场景：订单跟进人必须始终能访问自己的订单
    const rows = await this.orderRepo.manager.query(
      `SELECT 1 FROM biz_private_relation WHERE customer_id = ? AND account_id = ? AND status = 1
       UNION
       SELECT 1 FROM biz_lead WHERE customer_id = ? AND assigned_account_id = ?
       UNION
       SELECT 1 FROM biz_order WHERE customer_id = ? AND salesperson_id = ? AND is_draft = 0
       LIMIT 1`,
      [customerId, accountId, customerId, accountId, customerId, accountId],
    );
    return rows.length > 0;
  }

  // ============================================================
  // 创建
  // ============================================================

  /**
   * 创建订单（PRD 4.2.3.2）
   * - 初始状态按商品类型分流：含延保商品 → 待发送电子签；否则 → 待三方下单（配图 image3）
   * - 提交时固化客户/车辆/商品/线索快照
   * - isDraft=1 时为草稿（三步式创建过程中的中间态），不进入任何列表
   */
  async createOrder(data: any, operatorId?: string) {
    const {
      customerId, leadId, vehicleId, orderPlatform, platformOrderNo, marketingActivity,
      totalAmount, remark, salespersonId, items, isDraft = 0,
    } = data;

    if (!customerId) throw new BadRequestException('客户ID不能为空');
    if (!isDraft) {
      if (!orderPlatform) throw new BadRequestException('下单平台不能为空');
      if (!platformOrderNo) throw new BadRequestException('平台订单编号不能为空');
      if (String(platformOrderNo).length > 30) throw new BadRequestException('平台订单编号最多30个字符');
      if (totalAmount === undefined || totalAmount === null || totalAmount === '') {
        throw new BadRequestException('实付金额不能为空');
      }
      if (Number.isNaN(Number(totalAmount)) || Number(totalAmount) < 0) {
        throw new BadRequestException('实付金额仅支持非负数字');
      }
      if (!items || !items.length) throw new BadRequestException('商品信息不能为空');
    }

    return this.dataSource.transaction(async manager => {
      // ---- 商品快照：以数据库中的商品为准，避免前端传入被篡改的价格 ----
      const productIds = (items || []).map((i: any) => i.productId).filter(Boolean);
      const products = productIds.length
        ? await manager.find(BizProduct, { where: { id: In(productIds) } })
        : [];
      const productMap = new Map(products.map(p => [String(p.id), p]));

      // 仅允许选择「正常」状态的商品（PRD 4.2.3.2）
      if (!isDraft) {
        const invalid = products.filter(p => p.status !== 1).map(p => p.productName);
        if (invalid.length) {
          throw new BadRequestException(`商品「${invalid.join('、')}」已归档，不可用于下单`);
        }
      }

      // ---- 初始状态：含延保商品走电子签流程，否则直接到待三方下单 ----
      const hasWarranty = products.some(p => WARRANTY_TYPES.includes(p.productType));
      const initialStatus = hasWarranty ? ORDER_STATUS.PENDING_SEND_SIGN : ORDER_STATUS.PENDING_THIRD_ORDER;

      // ---- 快照：客户、车辆、线索 ----
      const customer = await manager.findOne(BizCustomer, { where: { id: customerId } });
      const vehicle = vehicleId ? await manager.findOne(BizVehicle, { where: { id: vehicleId } }) : null;
      const lead = leadId ? await manager.findOne(BizLead, { where: { id: leadId } }) : null;

      const order = new BizOrder();
      order.orderCode = await this.genOrderCode(manager);
      order.customerId = customerId;
      order.leadId = leadId || null;
      order.vehicleId = vehicleId || null;
      order.orderPlatform = orderPlatform || null;
      order.platformOrderNo = platformOrderNo || null;
      order.marketingActivity = marketingActivity || null;
      order.totalAmount = Number(totalAmount || 0).toFixed(2);
      order.remark = remark || null;
      // 跟进人：基于线索创建的订单可单独分配销售（PRD 4.2），未指定时取线索负责人，再退回创建人
      order.salespersonId = salespersonId || lead?.assignedAccountId || operatorId || null;
      order.orderStatus = initialStatus;
      order.isDraft = isDraft ? 1 : 0;
      order.creatorId = operatorId || null;
      // 创建时同时写入更新人/更新时间，避免列表出现「有更新人无更新时间」的割裂
      order.updaterId = operatorId || null;
      order.updatedAt = new Date();
      order.snapCustomerName = customer?.customerName || null;
      order.snapCustomerPhone = customer?.phone || null;
      order.snapVehicleBrand = vehicle?.brand || null;
      order.snapVehicleModel = vehicle?.model || null;
      order.snapVehicleVin = vehicle?.vin || null;
      order.snapLeadCode = lead?.leadCode || null;
      const saved = await manager.save(BizOrder, order);

      // ---- 订单明细（含商品编码/名称/售价快照）----
      for (const item of (items || [])) {
        const p = productMap.get(String(item.productId));
        const unitPrice = p ? Number(p.salePrice) : Number(item.unitPrice || 0);
        const quantity = Number(item.quantity || 1);
        const oi = new BizOrderItem();
        oi.orderId = saved.id;
        oi.productId = item.productId || null;
        oi.productCode = p?.productCode || item.productCode || null;
        oi.productRole = item.productRole || 1;
        oi.productName = p?.productName || item.productName;
        oi.productModel = p?.productModel || item.productModel || null;
        oi.unitPrice = unitPrice.toFixed(2);
        oi.quantity = quantity;
        oi.subtotal = (unitPrice * quantity).toFixed(2);
        await manager.save(BizOrderItem, oi);
      }

      if (!isDraft) {
        await this.addOperationLog(manager, {
          orderId: saved.id, accountId: operatorId, action: '创建',
          content: `创建订单，初始状态：${ORDER_STATUS_TEXT[initialStatus]}`,
        });
        if (order.leadId) await this.recalcLeadOrderSituation(manager, order.leadId);
      }

      return saved;
    });
  }

  /** 草稿转正式（三步式创建最后一步提交，PRD 4.2.3.2） */
  async submitDraft(id: string, data: any, operatorId?: string) {
    return this.dataSource.transaction(async manager => {
      const order = await manager.findOne(BizOrder, { where: { id } });
      if (!order) throw new NotFoundException('订单不存在');
      if (!order.isDraft) throw new BadRequestException('该订单已提交，请勿重复提交');

      if (data.leadId !== undefined) {
        order.leadId = data.leadId || null;
        const lead = data.leadId ? await manager.findOne(BizLead, { where: { id: data.leadId } }) : null;
        order.snapLeadCode = lead?.leadCode || null;
        if (lead && !data.salespersonId) order.salespersonId = lead.assignedAccountId || order.salespersonId;
      }
      if (data.vehicleId !== undefined) {
        order.vehicleId = data.vehicleId || null;
        const v = data.vehicleId ? await manager.findOne(BizVehicle, { where: { id: data.vehicleId } }) : null;
        order.snapVehicleBrand = v?.brand || null;
        order.snapVehicleModel = v?.model || null;
        order.snapVehicleVin = v?.vin || null;
      }
      order.isDraft = 0;
      order.updaterId = operatorId || null;
      order.updatedAt = new Date();
      await manager.save(BizOrder, order);

      await this.addOperationLog(manager, {
        orderId: order.id, accountId: operatorId, action: '创建',
        content: `创建订单，初始状态：${ORDER_STATUS_TEXT[order.orderStatus]}`,
      });
      if (order.leadId) await this.recalcLeadOrderSituation(manager, order.leadId);
      return order;
    });
  }

  /** 删除订单草稿（PRD 4.2.3.2「取消：删除订单草稿和车辆草稿」） */
  async deleteDraft(id: string) {
    return this.dataSource.transaction(async manager => {
      const order = await manager.findOne(BizOrder, { where: { id } });
      if (!order) return { success: true };
      if (!order.isDraft) throw new BadRequestException('该订单已提交，不可删除');
      await manager.delete(BizOrderItem, { orderId: id });
      await manager.delete(BizOrder, { id });
      return { success: true };
    });
  }

  // ============================================================
  // 状态流转
  // ============================================================

  /**
   * 订单状态流转（PRD 4.2.3.1）
   * action: sendSign(已发送电子签) | signed(已签署电子签) | delivered(已完成发货)
   */
  async changeStatus(id: string, action: string, req: any) {
    return this.dataSource.transaction(async manager => {
      const order = await manager.findOne(BizOrder, { where: { id } });
      if (!order) throw new NotFoundException('订单不存在');
      if (order.isDraft) throw new BadRequestException('草稿订单不可流转状态');
      this.assertFollower(order, req);

      const operatorId = String(req?.user?.sub || '');
      const from = order.orderStatus;
      let to: number;
      let followContent = '';

      if (action === 'sendSign') {
        if (from !== ORDER_STATUS.PENDING_SEND_SIGN) throw new BadRequestException('当前订单状态不支持该操作');
        to = ORDER_STATUS.PENDING_SIGN;
        followContent = `订单${order.orderCode}已给用户发送电子签`;
      } else if (action === 'signed') {
        if (from !== ORDER_STATUS.PENDING_SIGN) throw new BadRequestException('当前订单状态不支持该操作');
        to = ORDER_STATUS.PENDING_THIRD_ORDER;
        followContent = `订单${order.orderCode}已完成用户电子签签署`;
      } else if (action === 'delivered') {
        if (from !== ORDER_STATUS.PENDING_DELIVERY) throw new BadRequestException('当前订单状态不支持该操作');
        to = ORDER_STATUS.COMPLETED;
        followContent = `订单${order.orderCode}已完结`;
      } else {
        throw new BadRequestException('不支持的操作类型');
      }

      order.orderStatus = to;
      order.updaterId = operatorId || null;
      order.updatedAt = new Date();
      await manager.save(BizOrder, order);

      await this.addOperationLog(manager, {
        orderId: order.id, accountId: operatorId, action: '编辑',
        content: `订单状态：${ORDER_STATUS_TEXT[from]} → ${ORDER_STATUS_TEXT[to]}`,
      });

      // 订单完结时，按流程判断是否一并完结线索（PRD 配图 image12）
      let leadClosed = false;
      if (order.leadId) {
        const lead = await manager.findOne(BizLead, { where: { id: order.leadId } });
        if (lead) {
          if (to === ORDER_STATUS.COMPLETED) {
            const siblings: BizOrder[] = await manager.find(BizOrder, { where: { leadId: lead.id, isDraft: 0 } });
            const hasOtherOpen = siblings.some(o => String(o.id) !== String(order.id) && !FINAL_STATUSES.includes(o.orderStatus));
            if (!hasOtherOpen) {
              // 线索下已无其他未完结订单 → 订单完结同时完结线索
              await manager.update(BizLead, lead.id, { leadStatus: 3, updatedAt: new Date() });
              leadClosed = true;
              followContent = `订单${order.orderCode}已完结，线索${lead.leadCode}跟进结束`;
            }
          }
          await this.addSystemFollowRecord(manager, lead, followContent, operatorId);
          await this.recalcLeadOrderSituation(manager, lead.id);
        }
      }

      return { success: true, orderStatus: to, leadClosed };
    });
  }

  /** 录入三方订单编号（PRD 4.2.3.1）：提交后状态更新为「待发货」 */
  async submitThirdOrderNo(id: string, thirdOrderNo: string, req: any) {
    if (!thirdOrderNo || !String(thirdOrderNo).trim()) {
      throw new BadRequestException('三方订单编号不能为空');
    }
    if (String(thirdOrderNo).length > 30) {
      throw new BadRequestException('三方订单编号最多30个字符');
    }
    return this.dataSource.transaction(async manager => {
      const order = await manager.findOne(BizOrder, { where: { id } });
      if (!order) throw new NotFoundException('订单不存在');
      if (order.isDraft) throw new BadRequestException('草稿订单不可流转状态');
      this.assertFollower(order, req);
      if (order.orderStatus !== ORDER_STATUS.PENDING_THIRD_ORDER) {
        throw new BadRequestException('当前订单状态不支持该操作');
      }

      const operatorId = String(req?.user?.sub || '');
      const from = order.orderStatus;
      order.thirdOrderNo = String(thirdOrderNo).trim();
      order.orderStatus = ORDER_STATUS.PENDING_DELIVERY;
      order.updaterId = operatorId || null;
      order.updatedAt = new Date();
      await manager.save(BizOrder, order);

      await this.addOperationLog(manager, {
        orderId: order.id, accountId: operatorId, action: '编辑',
        content: `录入三方订单编号：${order.thirdOrderNo}；订单状态：${ORDER_STATUS_TEXT[from]} → ${ORDER_STATUS_TEXT[ORDER_STATUS.PENDING_DELIVERY]}`,
      });

      if (order.leadId) {
        const lead = await manager.findOne(BizLead, { where: { id: order.leadId } });
        if (lead) {
          await this.addSystemFollowRecord(manager, lead, `订单${order.orderCode}已完成三方平台下单`, operatorId);
          await this.recalcLeadOrderSituation(manager, lead.id);
        }
      }
      return { success: true, orderStatus: order.orderStatus };
    });
  }

  /** 作废订单（PRD 4.2.3.1）：需填写作废原因 */
  async voidOrder(id: string, voidReason: string, req: any) {
    if (!voidReason || !String(voidReason).trim()) {
      throw new BadRequestException('请填写作废原因');
    }
    return this.dataSource.transaction(async manager => {
      const order = await manager.findOne(BizOrder, { where: { id } });
      if (!order) throw new NotFoundException('订单不存在');
      if (order.isDraft) throw new BadRequestException('草稿订单不可作废');
      this.assertFollowerOrOrderAdmin(order, req);
      if (FINAL_STATUSES.includes(order.orderStatus)) {
        throw new BadRequestException('已完结或已作废的订单不可再作废');
      }

      const operatorId = String(req?.user?.sub || '');
      const from = order.orderStatus;
      order.orderStatus = ORDER_STATUS.VOIDED;
      order.voidReason = String(voidReason).trim();
      order.updaterId = operatorId || null;
      order.updatedAt = new Date();
      await manager.save(BizOrder, order);

      const acc = operatorId ? await manager.findOne(SysAccount, { where: { id: operatorId } }) : null;
      const operatorText = acc ? `${acc.realName || acc.username}（${acc.username}）` : '系统（system）';

      await this.addOperationLog(manager, {
        orderId: order.id, accountId: operatorId, action: '作废',
        content: `订单状态：${ORDER_STATUS_TEXT[from]} → ${ORDER_STATUS_TEXT[ORDER_STATUS.VOIDED]}；作废原因：${order.voidReason}`,
      });

      if (order.leadId) {
        const lead = await manager.findOne(BizLead, { where: { id: order.leadId } });
        if (lead) {
          await this.addSystemFollowRecord(manager, lead, `订单${order.orderCode}被${operatorText}作废！`, operatorId);
          await this.recalcLeadOrderSituation(manager, lead.id);
        }
      }
      return { success: true, orderStatus: order.orderStatus };
    });
  }

  /**
   * 提交订单前置校验（PRD 4.2.3.2 校验流程图 image21）
   * ① 客户存在未完结订单 且 订单车辆与当前一致 且 商品有重叠 → 提示确认后仍可下单
   * ② 订单未绑定线索 且 客户存在未完结线索 → 询问是否绑定该线索
   */
  async preCheck(data: { customerId: string; vehicleId?: string; vin?: string; productIds?: string[]; leadId?: string }) {
    const { customerId, vehicleId, vin, productIds = [], leadId } = data;
    if (!customerId) throw new BadRequestException('客户ID不能为空');

    // ---- ① 车辆冲突：客户的未完结订单中，车辆一致且商品重叠 ----
    let vehicleConflict: { vin: string; dupProducts: string[] } | null = null;
    if (vehicleId || vin) {
      const openOrders = await this.orderRepo.createQueryBuilder('order')
        .where('order.customerId = :customerId', { customerId })
        .andWhere('order.isDraft = 0')
        .andWhere('order.orderStatus NOT IN (:...finals)', { finals: FINAL_STATUSES })
        .getMany();

      // 车辆一致：优先按车辆ID比对；新增车辆（尚未落库）按 VIN 比对快照
      const sameVehicleOrders = openOrders.filter(o =>
        (vehicleId && String(o.vehicleId || '') === String(vehicleId)) ||
        (vin && o.snapVehicleVin && o.snapVehicleVin === vin)
      );
      if (sameVehicleOrders.length && productIds.length) {
        const items = await this.orderItemRepo.find({ where: { orderId: In(sameVehicleOrders.map(o => o.id)) } });
        const dupNames = [...new Set(
          items
            .filter(i => i.productId && productIds.map(String).includes(String(i.productId)))
            .map(i => i.productName)
        )];
        if (dupNames.length) {
          vehicleConflict = {
            vin: sameVehicleOrders[0].snapVehicleVin || vin || '',
            dupProducts: dupNames,
          };
        }
      }
    }

    // ---- ② 未完结线索：订单未绑定线索时才检查（0待分配/1待跟进/2跟进中/6回收待分配）----
    // 提示弹框需展示线索详情（PRD 配图：编码/状态/跟进人/意向商品/赠品信息）
    let unfinishedLead: {
      leadId: string; leadCode: string; statusName: string;
      assigneeName: string; intentProducts: string; intentGifts: string;
    } | null = null;
    if (!leadId) {
      const lead = await this.dataSource.getRepository(BizLead).findOne({
        where: { customerId, leadStatus: In([0, 1, 2, 6]) },
        order: { createdAt: 'DESC' },
      });
      if (lead) {
        const STATUS_NAME: Record<number, string> = { 0: '待分配', 1: '待跟进', 2: '跟进中', 6: '回收待分配' };
        let assigneeName = '-';
        if (lead.assignedAccountId) {
          const rows: any[] = await this.dataSource.query(
            'SELECT real_name, username FROM sys_account WHERE id = ?', [lead.assignedAccountId]);
          assigneeName = rows[0]?.real_name || rows[0]?.username || '-';
        }
        const prods: any[] = await this.dataSource.query(
          `SELECT lp.product_role, p.product_name FROM biz_lead_product lp
           JOIN biz_product p ON p.id = lp.product_id WHERE lp.lead_id = ?`, [lead.id]);
        const names = (role: number) => prods.filter(r => Number(r.product_role) === role).map(r => r.product_name).join('；') || '无';
        unfinishedLead = {
          leadId: lead.id,
          leadCode: lead.leadCode,
          statusName: STATUS_NAME[lead.leadStatus] || '未知',
          assigneeName,
          intentProducts: names(1),
          intentGifts: names(2),
        };
      }
    }

    return { vehicleConflict, unfinishedLead };
  }

  /**
   * 完结前置判断（PRD 配图 image12）
   * willCloseLead=true 时，前端需展示「完结订单将一并完结线索」的弹框
   */
  async completeCheck(id: string) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('订单不存在');
    if (!order.leadId) return { willCloseLead: false, leadCode: null };

    const siblings = await this.orderRepo.find({ where: { leadId: order.leadId, isDraft: 0 } });
    const hasOtherOpen = siblings.some(o => String(o.id) !== String(id) && !FINAL_STATUSES.includes(o.orderStatus));
    const lead = await this.dataSource.getRepository(BizLead).findOne({ where: { id: order.leadId } });
    return { willCloseLead: !hasOtherOpen, leadCode: lead?.leadCode || null };
  }
}
