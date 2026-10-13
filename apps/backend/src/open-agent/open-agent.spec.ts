import { ForbiddenException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { maskPhone, maskPlate, maskVin } from './masking';
import { OpenAgentService } from './open-agent.service';
import { ServiceTokenGuard } from './service-token.guard';

const TOKEN = 't'.repeat(40);
const ctx = (headers: Record<string, string>, ip = '10.0.0.5') => ({ switchToHttp: () => ({ getRequest: () => ({ headers, ip }) }) }) as never;

describe('智能体开放接口：服务令牌', () => {
  it('令牌正确才放行；没配令牌时整组接口不可用', () => {
    const g = new ServiceTokenGuard({ AGENT_SERVICE_TOKEN: TOKEN });
    expect(g.canActivate(ctx({ 'x-agent-token': TOKEN }))).toBe(true);
    expect(() => g.canActivate(ctx({ 'x-agent-token': 'wrong' }))).toThrow(UnauthorizedException);
    expect(() => g.canActivate(ctx({}))).toThrow(UnauthorizedException);
    expect(() => new ServiceTokenGuard({}).canActivate(ctx({ 'x-agent-token': TOKEN }))).toThrow(ServiceUnavailableException);
  });

  it('配了来源白名单时只放行白名单地址', () => {
    const g = new ServiceTokenGuard({ AGENT_SERVICE_TOKEN: TOKEN, AGENT_ALLOWED_IPS: '10.0.0.5, 10.0.0.6' });
    expect(g.canActivate(ctx({ 'x-agent-token': TOKEN }, '::ffff:10.0.0.6'))).toBe(true);
    expect(() => g.canActivate(ctx({ 'x-agent-token': TOKEN }, '1.2.3.4'))).toThrow(ForbiddenException);
  });
});

describe('智能体开放接口：脱敏与数据', () => {
  it('手机号、车架号、车牌脱敏', () => {
    expect(maskPhone('138-1234-5678')).toBe('138****5678');
    expect(maskVin('LSVAU2180N2123456')).toBe('LSVA*********3456');
    expect(maskPlate('粤B12345')).toBe('粤B****5');
  });

  const repo = (rows: unknown[]) => ({ find: jest.fn(async () => rows), findOne: jest.fn(async () => rows[0] ?? null) });
  const build = () => {
    const customer = { id: '7', customerName: '王先生', gender: 1, status: 1 };
    const repos = {
      customers: repo([customer]),
      vehicles: repo([{ brand: '问界', model: 'M5', style: null, vin: 'LSVAU2180N2123456', plateNo: '粤B12345', purchaseDate: '2024-05-01', mileage: 21000, hasExtendedWarranty: 1, hasBatteryWarranty: 0, hasPeaceOfMind: 0 }]),
      orders: repo([
        { id: '1', orderCode: 'SO001', orderStatus: 3, createdAt: new Date('2026-09-01'), totalAmount: '3999.00', snapVehicleBrand: '问界', snapVehicleModel: 'M5' },
        { id: '2', orderCode: 'SO002', orderStatus: 5, createdAt: new Date('2026-08-01'), totalAmount: '999.00' },
      ]),
      items: repo([
        { orderId: '1', productId: '11', productName: '整车延保 3年', productModel: '3年/6万公里', quantity: 1, subtotal: '3999.00', productRole: 1 },
        { orderId: '1', productId: null, productName: '洗车券', productModel: null, quantity: 1, subtotal: '0', productRole: 2 },
        { orderId: '2', productId: '12', productName: '电池延保', productModel: null, quantity: 1, subtotal: '999.00', productRole: 1 },
      ]),
      products: repo([{ id: '11', productType: 'warranty' }]),
    };
    return { svc: new OpenAgentService(repos.customers as never, repos.vehicles as never, repos.orders as never, repos.items as never, repos.products as never), repos };
  };

  it('客户画像：按手机号摘要查；已购只算未作废订单里的正品；全部脱敏', async () => {
    const { svc, repos } = build();
    const r = await svc.customerContext('138 1234 5678');
    expect(repos.customers.findOne).toHaveBeenCalledWith({ where: { phoneHash: createHash('sha256').update('13812345678').digest('hex'), status: 1 } });
    expect(r.customer).toEqual({ id: '7', name: '王先生', gender: 1, phoneMasked: '138****5678' });
    expect(r.vehicles[0]).toMatchObject({ brand: '问界', vinMasked: 'LSVA*********3456', warranties: { extended: true, battery: false } });
    expect(r.orders.map((o) => [o.orderCode, o.status])).toEqual([['SO001', '待发货'], ['SO002', '已作废']]);
    expect(r.orders[0].items[0]).toMatchObject({ productName: '整车延保 3年', productType: 'warranty', gift: false });
    expect(r.purchasedProducts).toEqual(['整车延保 3年']);
    expect(JSON.stringify(r)).not.toMatch(/13812345678|LSVAU2180N2123456|粤B12345/);
  });

  it('客户不存在、订单不属于该客户时 404', async () => {
    const { svc, repos } = build();
    repos.customers.findOne.mockResolvedValueOnce(null);
    await expect(svc.customerContext('13900000000')).rejects.toThrow(NotFoundException);
    repos.orders.findOne.mockResolvedValueOnce(null);
    await expect(svc.order('SO001', '8')).rejects.toThrow(NotFoundException);
    expect(repos.orders.findOne).toHaveBeenLastCalledWith({ where: { orderCode: 'SO001', customerId: '8', isDraft: 0 } });
  });
});
