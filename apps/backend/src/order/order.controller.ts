import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, ForbiddenException } from '@nestjs/common';
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

  /** 订单列表（PRD 4.2.3）；销售的「我的跟单订单」通过 salespersonId 过滤 */
  @RequirePermissions('order', 'workbench')
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

  /** 线索维度历史订单：当前线索+父链（线索详情页 tab；须在 :id 路由之前注册） */
  @RequirePermissions('order', 'workbench')
  @Get('lead-chain/:leadId')
  async getOrdersByLeadChain(@Param('leadId') leadId: string, @Request() req: any) {
    const rows = await this.orderService['orderRepo'].manager.query('SELECT customer_id FROM biz_lead WHERE id = ?', [leadId]);
    if (rows[0]?.customer_id) await this.assertCustomerAccess(req, String(rows[0].customer_id));
    return this.orderService.getOrdersByLeadChain(leadId);
  }

  /** 我的跟单订单：按状态统计（须在 :id 路由之前注册） */
  @RequirePermissions('order', 'workbench')
  @Get('status-count')
  getStatusCount(@Request() req: any) {
    return this.orderService.getStatusCount(String(req?.user?.sub || ''));
  }

  /** 完结前置判断：是否会一并完结线索（PRD 配图 image12） */
  @RequirePermissions('order', 'workbench')
  @Get(':id/complete-check')
  completeCheck(@Param('id') id: string) {
    return this.orderService.completeCheck(id);
  }

  /** 订单详情（PRD 配图 image5） */
  @RequirePermissions('order', 'workbench')
  @Get(':id')
  async getOrderById(@Param('id') id: string, @Request() req: any) {
    const order = await this.orderService.getOrderById(id);
    await this.assertCustomerAccess(req, String((order as any).customerId));
    return order;
  }

  @RequirePermissions('order:create', 'order')
  @Post()
  async createOrder(@Body() data: any, @Request() req: any) {
    if (data?.customerId) {
      await this.assertCustomerAccess(req, String(data.customerId));
    }
    return this.orderService.createOrder(data, String(req?.user?.sub || ''));
  }

  /** 提交订单前置校验：车辆冲突 + 未完结线索（PRD 4.2.3.2 校验流程） */
  @RequirePermissions('order', 'workbench')
  @Post('pre-check')
  async preCheck(@Body() data: any, @Request() req: any) {
    if (data?.customerId) {
      await this.assertCustomerAccess(req, String(data.customerId));
    }
    return this.orderService.preCheck(data || {});
  }

  /** 草稿转正式订单（三步式创建最后一步提交） */
  @RequirePermissions('order', 'workbench')
  @Post(':id/submit')
  submitDraft(@Param('id') id: string, @Body() data: any, @Request() req: any) {
    return this.orderService.submitDraft(id, data || {}, String(req?.user?.sub || ''));
  }

  /** 取消创建：删除订单草稿 */
  @RequirePermissions('order', 'workbench')
  @Delete('draft/:id')
  deleteDraft(@Param('id') id: string) {
    return this.orderService.deleteDraft(id);
  }

  /** 状态流转：sendSign / signed / delivered（PRD 4.2.3.1） */
  @RequirePermissions('order', 'workbench')
  @Post(':id/status')
  changeStatus(@Param('id') id: string, @Body('action') action: string, @Request() req: any) {
    return this.orderService.changeStatus(id, action, req);
  }

  /** 录入三方订单编号（PRD 4.2.3.1） */
  @RequirePermissions('order', 'workbench')
  @Put(':id/third-order-no')
  submitThirdOrderNo(@Param('id') id: string, @Body('thirdOrderNo') thirdOrderNo: string, @Request() req: any) {
    return this.orderService.submitThirdOrderNo(id, thirdOrderNo, req);
  }

  /** 作废订单，需填写作废原因（PRD 4.2.3.1） */
  @RequirePermissions('order:void', 'order')
  @Post(':id/void')
  voidOrder(@Param('id') id: string, @Body('voidReason') voidReason: string, @Request() req: any) {
    return this.orderService.voidOrder(id, voidReason, req);
  }
}
