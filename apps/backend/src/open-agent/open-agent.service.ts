import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { BizCustomer } from '../entities/BizCustomer';
import { BizOrder } from '../entities/BizOrder';
import { BizOrderItem } from '../entities/BizOrderItem';
import { BizProduct } from '../entities/BizProduct';
import { BizVehicle } from '../entities/BizVehicle';
import { ORDER_STATUS } from '../order/order.service';
import { maskPhone, maskPlate, maskVin, normalizePhone } from './masking';

export const ORDER_STATUS_NAME: Record<number, string> = {
  [ORDER_STATUS.PENDING_SEND_SIGN]: '待发送电子签',
  [ORDER_STATUS.PENDING_SIGN]: '待签署电子签',
  [ORDER_STATUS.PENDING_THIRD_ORDER]: '待三方下单',
  [ORDER_STATUS.PENDING_DELIVERY]: '待发货',
  [ORDER_STATUS.COMPLETED]: '已完结',
  [ORDER_STATUS.VOIDED]: '已作废',
};

const MAX_ORDERS = 20;

/** 智能体平台读取客户画像、订单、商品（只读，§11.2）。不返回手机号、身份证、车架号明文 */
@Injectable()
export class OpenAgentService {
  constructor(
    @InjectRepository(BizCustomer) private readonly customers: Repository<BizCustomer>,
    @InjectRepository(BizVehicle) private readonly vehicles: Repository<BizVehicle>,
    @InjectRepository(BizOrder) private readonly orders: Repository<BizOrder>,
    @InjectRepository(BizOrderItem) private readonly items: Repository<BizOrderItem>,
    @InjectRepository(BizProduct) private readonly products: Repository<BizProduct>,
  ) {}

  async customerContext(phone: string) {
    const digits = normalizePhone(phone);
    const customer = await this.customers.findOne({ where: { phoneHash: createHash('sha256').update(digits).digest('hex'), status: 1 } });
    if (!customer) throw new NotFoundException('没有这个客户');
    const [vehicles, orders] = await Promise.all([
      this.vehicles.find({ where: { customerId: customer.id }, order: { id: 'DESC' } }),
      this.orders.find({ where: { customerId: customer.id, isDraft: 0 }, order: { createdAt: 'DESC' }, take: MAX_ORDERS }),
    ]);
    const orderViews = await this.orderViews(orders);
    // 已购：未作废订单里的商品（不含赠品）
    const purchased = [...new Set(orderViews.filter((o) => o.statusCode !== ORDER_STATUS.VOIDED).flatMap((o) => o.items.filter((i) => !i.gift).map((i) => i.productName)))];
    return {
      customer: { id: customer.id, name: customer.customerName, gender: customer.gender ?? 0, phoneMasked: maskPhone(digits) },
      vehicles: vehicles.map((v) => ({
        brand: v.brand, model: v.model, style: v.style ?? null, vinMasked: maskVin(v.vin), plateNoMasked: maskPlate(v.plateNo),
        purchaseDate: v.purchaseDate ?? null, mileage: v.mileage ?? null,
        warranties: { extended: !!v.hasExtendedWarranty, battery: !!v.hasBatteryWarranty, peaceOfMind: !!v.hasPeaceOfMind },
      })),
      orders: orderViews,
      purchasedProducts: purchased,
    };
  }

  /** 查单个订单：必须带客户 ID，只能查这个客户自己的订单 */
  async order(orderCode: string, customerId: string) {
    const order = await this.orders.findOne({ where: { orderCode, customerId, isDraft: 0 } });
    if (!order) throw new NotFoundException('没有这个订单');
    return (await this.orderViews([order]))[0];
  }

  /** 商品列表（同步价目表用）：只返回生效中的商品与售价，不返回成本价 */
  async productList(type?: string, updatedSince?: Date) {
    const where: Record<string, unknown> = { status: 1 };
    if (type) where.productType = type;
    if (updatedSince) where.updatedAt = MoreThanOrEqual(updatedSince);
    const rows = await this.products.find({ where, order: { id: 'ASC' }, take: 2000 });
    return rows.map((p) => ({
      code: p.productCode, name: p.productName, model: p.productModel ?? null, type: p.productType, specParams: p.specParams ?? null,
      salePrice: p.salePrice === null || p.salePrice === undefined ? null : Number(p.salePrice), applicableModel: p.applicableModel ?? null, updatedAt: p.updatedAt ?? null,
    }));
  }

  private async orderViews(orders: BizOrder[]) {
    if (orders.length === 0) return [];
    const items = await this.items.find({ where: { orderId: In(orders.map((o) => o.id)) }, order: { id: 'ASC' } });
    const productIds = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
    const types = new Map((productIds.length ? await this.products.find({ where: { id: In(productIds), productType: Not('') } }) : []).map((p) => [p.id, p.productType]));
    return orders.map((o) => ({
      orderCode: o.orderCode,
      statusCode: o.orderStatus,
      status: ORDER_STATUS_NAME[o.orderStatus] ?? String(o.orderStatus),
      createdAt: o.createdAt,
      totalAmount: Number(o.totalAmount),
      vehicle: o.snapVehicleBrand || o.snapVehicleModel ? `${o.snapVehicleBrand ?? ''} ${o.snapVehicleModel ?? ''}`.trim() : null,
      items: items.filter((i) => i.orderId === o.id).map((i) => ({
        productName: i.productName, productModel: i.productModel ?? null, productType: (i.productId && types.get(i.productId)) || null,
        quantity: i.quantity, subtotal: Number(i.subtotal), gift: i.productRole === 2,
      })),
    }));
  }
}
