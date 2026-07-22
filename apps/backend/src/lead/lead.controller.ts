import { Controller, Get, Query, Post, Param, Body, UseInterceptors, UploadedFile, Put, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LeadService, friendlyDbError } from './lead.service';
import { RequirePermissions } from '../auth/permissions.decorator';

@RequirePermissions('lead', 'workbench')
@Controller('api/lead')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Get()
  getLeads(@Query() query: any, @Request() req: any) {
    const user = req.user;
    if (user && !user.permissions.includes('lead') && user.permissions.includes('workbench')) {
      if (query.publicPool !== '1') {
        query.assignedAccountId = user.sub;
      }
    }
    return this.leadService.getLeads(query);
  }

  // 注意：必须声明在 @Get(':id') 之前，避免被通配路由拦截
  @Get('import-active')
  getActiveImportTask(@Request() req: any) {
    return this.leadService.getActiveImportTask(String(req.user?.sub || '')) || { none: true };
  }

  @Get('workbench-stats')
  async getWorkbenchStats(@Query('accountId') accountId: string) {
    try {
      if (!accountId) {
        throw new Error('accountId is required');
      }
      return await this.leadService.getWorkbenchStats(accountId);
    } catch (e: any) {
      return { error: true, message: e.message, stack: e.stack };
    }
  }

  @Post()
  async createLead(@Body() body: any) {
    try {
      return await this.leadService.createLead(body);
    } catch (e: any) {
      return { error: true, code: e.code, message: e.code ? e.message : friendlyDbError(e.message), customerName: e.customerName, statusName: e.statusName, leadCode: e.leadCode, stack: e.stack };
    }
  }

  @RequirePermissions('lead', 'workbench:grab')
  @Post('batch-assign')
  async batchAssignLeads(@Body() body: { leadIds: string[], accountId: string }) {
    try {
      return await this.leadService.batchAssignLeads(body.leadIds, body.accountId);
    } catch (e: any) {
      const msg = e.code === 'ASSIGN_PREV_CONFLICT' ? e.message : (e.message && /^[\u4e00-\u9fa5]/.test(e.message) ? e.message : '分配失败，请稍后重试');
      return { error: true, code: e.code, message: msg, leadCodes: e.leadCodes, salesName: e.salesName };
    }
  }

  @Get(':id')
  async getLeadById(@Param('id') id: string) {
    try {
      return await this.leadService.getLeadById(id);
    } catch (e: any) {
      return { error: true, message: e.message, stack: e.stack };
    }
  }

  @Put(':id')
  async updateLead(@Param('id') id: string, @Body() body: any) {
    try {
      return await this.leadService.updateLead(id, body);
    } catch (e: any) {
      return { error: true, code: e.code, message: e.code ? e.message : friendlyDbError(e.message), customerName: e.customerName, statusName: e.statusName, leadCode: e.leadCode, stack: e.stack };
    }
  }

  @Put(':id/wechat')
  async updateWechatStatus(@Param('id') id: string, @Body('isAddWechat') isAddWechat: string) {
    try {
      return await this.leadService.updateWechatStatus(id, isAddWechat);
    } catch (e: any) {
      return { error: true, message: e.message, stack: e.stack };
    }
  }

  @Put(':id/products')
  async updateLeadProducts(@Param('id') id: string, @Body() body: { intentProducts?: string[], intentGifts?: string[] }) {
    try {
      return await this.leadService.updateLeadProducts(id, body);
    } catch (e: any) {
      return { error: true, message: e.message, stack: e.stack };
    }
  }

  @Post(':id/assign')
  async assignLead(@Param('id') id: string, @Body('accountId') accountId: string) {
    try {
      return await this.leadService.assignLead(id, accountId);
    } catch (e: any) {
      return { error: true, code: e.code, message: e.message, leadCodes: e.leadCodes, salesName: e.salesName, stack: e.stack };
    }
  }

  @Post(':id/void')
  async voidLead(@Param('id') id: string) {
    try {
      return await this.leadService.voidLead(id);
    } catch (e: any) {
      return { error: true, message: e.message, stack: e.stack };
    }
  }

  @RequirePermissions('lead', 'workbench:return_public')
  @Post('return-public')
  async returnToPublic(@Body() body: { leadIds: string[] }) {
    try {
      return await this.leadService.returnToPublic(body.leadIds);
    } catch (e: any) {
      return { error: true, message: e.message, stack: e.stack };
    }
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importLeads(
    @UploadedFile() file: Express.Multer.File,
    @Body('accountId') accountId: string,
    @Body('progressId') progressId: string,
    @Request() req: any,
  ) {
    try {
      if (!file) {
        return { error: true, message: '请上传文件' };
      }
      // 任务归属取登录态账号，不信任表单参数
      return await this.leadService.importLeads(file, accountId, progressId, String(req.user?.sub || ''));
    } catch (e: any) {
      this.leadService.markImportProgressError(progressId, e.message);
      return { error: true, message: e.message, stack: e.stack };
    }
  }

  @Get('import-progress/:id')
  getImportProgress(@Param('id') id: string, @Request() req: any) {
    return this.leadService.getImportProgress(id, String(req.user?.sub || '')) || { phase: 'unknown' };
  }

  @Get('import-warn/:batchNo')
  async getWarnData(@Param('batchNo') batchNo: string) {
    try {
      return await this.leadService.getWarnData(batchNo);
    } catch (e: any) {
      return { error: true, message: e.message, stack: e.stack };
    }
  }

  @Post('import-warn/:id/resolve')
  async resolveWarnItem(@Param('id') id: string, @Body() body: { action: string }) {
    try {
      return await this.leadService.resolveWarnItem(id, body.action);
    } catch (e: any) {
      return { error: true, message: friendlyDbError(e.message), stack: e.stack };
    }
  }
}
