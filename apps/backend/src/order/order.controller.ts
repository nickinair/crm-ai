import { Controller, Get, Post, Body, Param, Query, Request, ForbiddenException } from '@nestjs/common';
import { OrderService } from './order.service';
import { RequirePermissions } from '../auth/permissions.decorator';

@RequirePermissions('order')
@Controller('api/order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // Row-level guard: workbench-only users (sales) may touch a customer's orders
  // only if the customer is reachable via their leads / private relations
  private async assertCustomerAccess(req: any, customerId: string) {
    const user = req?.user;
    if (user && !user.permissions.includes('order') && user.permissions.includes('workbench')) {
      const ok = await this.orderService.isCustomerAccessibleBy(customerId, user.sub);
      if (!ok) {
        throw new ForbiddenException('权限不足，只能访问自己线索关联的客户订单');
      }
    }
  }

  @Get()
  getOrders(@Query() query: any) {
    return this.orderService.getOrders(query);
  }

  @RequirePermissions('order', 'workbench')
  @Get('customer/:customerId')
  async getOrdersByCustomer(@Param('customerId') customerId: string, @Request() req: any) {
    await this.assertCustomerAccess(req, customerId);
    return this.orderService.getOrdersByCustomer(customerId);
  }

  @RequirePermissions('order', 'workbench')
  @Post()
  async createOrder(@Body() data: any, @Request() req: any) {
    if (data?.customerId) {
      await this.assertCustomerAccess(req, String(data.customerId));
    }
    return this.orderService.createOrder(data);
  }
}
