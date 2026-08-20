import { Controller, Get, Param, Query, Post, Body, Put, Delete, HttpException, Request, ForbiddenException } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { BizCustomer } from '../entities/BizCustomer';
import { RequirePermissions } from '../auth/permissions.decorator';

@RequirePermissions('customer', 'workbench')
@Controller('api/customer')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  // Row-level guard for id-based routes: workbench-only users (sales) may
  // touch a customer only if reachable via their leads / private relations
  private async assertCustomerAccess(req: any, customerId: string) {
    const user = req?.user;
    if (user && !user.permissions.includes('customer') && user.permissions.includes('workbench')) {
      const ok = await this.customerService.isCustomerReachable(customerId, user.sub);
      if (!ok) {
        throw new ForbiddenException('权限不足，只能访问自己线索关联的客户');
      }
    }
  }

  @RequirePermissions('customer:create', 'workbench')
  @Post()
  createCustomer(@Body() createDto: Partial<BizCustomer>, @Request() req: any) {
    // 仅工作台权限的用户（销售）新建客户时，同时建立私域关系（管理员创建不绑定）
    const user = req?.user;
    const isSalesOnly = user && !user.permissions.includes('customer') && user.permissions.includes('workbench');
    return this.customerService.create(createDto, isSalesOnly ? String(user.sub) : undefined);
  }

  @Get()
  getCustomers(@Query() query: any, @Request() req: any) {
    const user = req.user;
    if (user && !user.permissions.includes('customer') && user.permissions.includes('workbench')) {
      query.ownerId = user.sub;
    }
    return this.customerService.getCustomers(query);
  }

  // 车辆品牌/车型/款式的可选项（取自现有车辆数据去重），供前端可搜索下拉使用
  @RequirePermissions('customer', 'lead', 'workbench')
  @Get('vehicle-options')
  getVehicleOptions() {
    return this.customerService.getVehicleOptions();
  }

  @Get('recent-followed')
  getRecentFollowedCustomers(@Query('accountId') accountId: string) {
    return this.customerService.getRecentFollowedCustomers(accountId);
  }

  @RequirePermissions('customer:export', 'workbench')
  @Get('export')
  getCustomersForExport(@Query() query: any, @Request() req: any) {
    const user = req.user;
    if (user && !user.permissions.includes('customer') && user.permissions.includes('workbench')) {
      query.ownerId = user.sub;
    }
    return this.customerService.getCustomersForExport(query);
  }

  @Get('360/:id')
  async getCustomer360View(@Param('id') id: string, @Request() req: any) {
    await this.assertCustomerAccess(req, id);
    return this.customerService.getCustomer360View(id);
  }

  @RequirePermissions('customer:edit', 'workbench')
  @Put(':id')
  async updateCustomer(@Param('id') id: string, @Body() updateDto: any, @Request() req: any) {
    await this.assertCustomerAccess(req, id);
    try {
      return await this.customerService.updateCustomer(id, updateDto);
    } catch (e: any) {
      throw new HttpException(e.message || '更新失败', 400);
    }
  }

  @Put('vehicle/:id')
  updateVehicle(@Param('id') id: string, @Body() updateDto: any) {
    return this.customerService.updateVehicle(id, updateDto);
  }

  @Post('vehicle')
  createVehicle(@Body() createDto: any) {
    return this.customerService.createVehicle(createDto);
  }

  /** 客户名下未失效的车辆列表（订单三步式创建第三步的车辆下拉，PRD 4.2.3.2） */
  @Get(':id/vehicles')
  async getCustomerVehicles(@Param('id') id: string, @Request() req: any) {
    await this.assertCustomerAccess(req, id);
    return this.customerService.getActiveVehicles(id);
  }

  @Delete('vehicle/:id')
  deleteVehicle(@Param('id') id: string) {
    return this.customerService.deleteVehicle(id);
  }

  @Get(':id/notes')
  async getCustomerNotes(@Param('id') id: string, @Request() req: any) {
    await this.assertCustomerAccess(req, id);
    return this.customerService.getCustomerNotes(id);
  }

  @Post(':id/notes')
  async createCustomerNote(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    await this.assertCustomerAccess(req, id);
    return this.customerService.createCustomerNote(id, body);
  }
}
