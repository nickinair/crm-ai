import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BizOrder } from '../entities/BizOrder';
import { BizOrderItem } from '../entities/BizOrderItem';
import { BizCustomer } from '../entities/BizCustomer';
import { BizFollowRecord } from '../entities/BizFollowRecord';
import { BizLead } from '../entities/BizLead';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(BizOrder)
    private readonly orderRepo: Repository<BizOrder>,
    @InjectRepository(BizOrderItem)
    private readonly orderItemRepo: Repository<BizOrderItem>,
  ) {}

  async getOrders(query: any) {
    const { page = 1, limit = 10, orderId, dateRange } = query;
    const qb = this.orderRepo.createQueryBuilder('order')
      .leftJoinAndMapOne('order.customer', BizCustomer, 'customer', 'customer.id = order.customerId')
      .orderBy('order.createdAt', 'DESC');

    if (orderId) {
      qb.andWhere('order.orderCode LIKE :orderId', { orderId: `%${orderId}%` });
    }

    if (dateRange && dateRange.length === 2) {
      qb.andWhere('order.createdAt >= :startDate', { startDate: dateRange[0] });
      qb.andWhere('order.createdAt <= :endDate', { endDate: dateRange[1] });
    }

    const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();

    return {
      items,
      total,
      page: Number(page),
      limit: Number(limit)
    };
  }

  // A sales person can reach a customer if they have an active private relation,
  // or the customer is linked to a lead currently assigned to them
  async isCustomerAccessibleBy(customerId: string, accountId: string): Promise<boolean> {
    const rows = await this.orderRepo.manager.query(
      `SELECT 1 FROM biz_private_relation WHERE customer_id = ? AND account_id = ? AND status = 1
       UNION
       SELECT 1 FROM biz_lead WHERE customer_id = ? AND assigned_account_id = ?
       LIMIT 1`,
      [customerId, accountId, customerId, accountId],
    );
    return rows.length > 0;
  }

  async getOrdersByCustomer(customerId: string) {
    const orders = await this.orderRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
    for (const order of orders) {
      const items = await this.orderItemRepo.find({ where: { orderId: order.id } });
      (order as any).items = items;
    }
    return orders;
  }

  async createOrder(data: any) {
    const { customerId, leadId, channelSource, paymentMethod, orderPlatform, remark, salespersonId, items } = data;

    if (!customerId) throw new BadRequestException('客户ID不能为空');

    // Generate order code: ORD + timestamp + random 4 digits
    const orderCode = `ORD${Date.now()}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;

    // Calculate total
    let totalAmount = 0;
    if (items && items.length > 0) {
      for (const item of items) {
        const subtotal = Number(item.unitPrice || 0) * Number(item.quantity || 1);
        totalAmount += subtotal;
      }
    }

    // Create order
    const order = this.orderRepo.create({
      orderCode,
      customerId,
      leadId: leadId || null,
      channelSource: channelSource || null,
      paymentMethod: paymentMethod || null,
      orderPlatform: orderPlatform || null,
      remark: remark || null,
      salespersonId: salespersonId || null,
      totalAmount: totalAmount.toFixed(2),
      orderStatus: 0,
    });
    const savedOrder = await this.orderRepo.save(order);

    // Create order items
    if (items && items.length > 0) {
      for (const item of items) {
        const subtotal = Number(item.unitPrice || 0) * Number(item.quantity || 1);
        const orderItem = this.orderItemRepo.create({
          orderId: savedOrder.id,
          productId: item.productId || null,
          productRole: item.productRole || 1,
          productName: item.productName,
          productModel: item.productModel || null,
          unitPrice: String(item.unitPrice || '0.00'),
          quantity: item.quantity || 1,
          subtotal: subtotal.toFixed(2),
        });
        await this.orderItemRepo.save(orderItem);
      }
    }

    return savedOrder;
  }
}

