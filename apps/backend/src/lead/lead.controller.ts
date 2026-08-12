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

  /** 首页核心经营指标（PRD 4.4）；首页对所有登录用户开放 */
  @RequirePermissions('dashboard', 'lead', 'workbench')
  @Get('home-metrics')
  getHomeMetrics() {
    return this.leadService.getHomeMetrics();
  }

  /** 首页销售线索分布（PRD 4.4） */
  @RequirePermissions('dashboard', 'lead', 'workbench')
  @Get('sales-distribution')
  getSalesLeadDistribution() {
    return this.leadService.getSalesLeadDistribution();
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
  async createLead(@Body() body: any, @Request() req: any) {
    try {
      const creatorId = req.user?.sub;
      return await this.leadService.createLead(body, creatorId);
    } catch (e: any) {
      return { error: true, code: e.code, message: e.code ? e.message : friendlyDbError(e.message), customerName: e.customerName, statusName: e.statusName, leadCode: e.leadCode, stack: e.stack };
    }
  }

  @RequirePermissions('lead', 'workbench:grab')
  @Post('batch-assign')
  async batchAssignLeads(@Body() body: { leadIds: string[], accountId: string }, @Request() req: any) {
    try {
      return await this.leadService.batchAssignLeads(body.leadIds, body.accountId, req.user?.sub);
    } catch (e: any) {
      const msg = (e.code === 'ASSIGN_PREV_CONFLICT' || e.code === 'ASSIGN_CONTROL_BLOCKED') ? e.message : (e.message && /^[\u4e00-\u9fa5]/.test(e.message) ? e.message : '分配失败，请稍后重试');
      return { error: true, code: e.code, message: msg, leadCodes: e.leadCodes, salesName: e.salesName };
    }
  }

  /** 重新分配（PRD 4.3.1）：仅待跟进/跟进中；锁定中的失败返回；可连带未完结订单改派 */
  @RequirePermissions('lead')
  @Post('reassign')
  async reassignLeads(
    @Body() body: { leadIds: string[]; accountId: string; moveOrders?: boolean },
    @Request() req: any,
  ) {
    try {
      return await this.leadService.reassignLeads(body.leadIds, body.accountId, body.moveOrders !== false, String(req.user?.sub || ''));
    } catch (e: any) {
      const msg = e.code === 'REASSIGN_STATUS_INVALID' ? e.message : (e.message && /^[一-龥]/.test(e.message) ? e.message : '重新分配失败，请稍后重试');
      return { error: true, code: e.code, message: msg };
    }
  }

  /** 手动触发冷却期任务（补跑/验证用；正常每天 0 点自动执行） */
  @RequirePermissions('lead')
  @Post('cooldown-task/run')
  runCooldownTask() {
    return this.leadService.runDefeatCooldownTask();
  }

  /** 线索跟进记录：战败复活线索合并父链记录（PRD 4.3.3） */
  @Get(':id/follows')
  getLeadFollows(@Param('id') id: string) {
    return this.leadService.getLeadFollows(id);
  }

  /** 线索操作日志：倒序分页，前端滚动加载（PRD 4.3.3） */
  @Get(':id/logs')
  getLeadLogs(@Param('id') id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.leadService.getLeadLogs(id, Number(page || 1), Number(limit || 10));
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
  async updateLead(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    try {
      return await this.leadService.updateLead(id, body, String(req.user?.sub || ''));
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
  async assignLead(@Param('id') id: string, @Body('accountId') accountId: string, @Request() req: any) {
    try {
      return await this.leadService.assignLead(id, accountId, String(req.user?.sub || ''));
    } catch (e: any) {
      return { error: true, code: e.code, message: e.message, leadCodes: e.leadCodes, salesName: e.salesName, stack: e.stack };
    }
  }

  /** 进入线索详情加锁/心跳续期（PRD 4.3.1 线索锁定） */
  @Post(':id/lock')
  async lockLead(@Param('id') id: string, @Body('sessionId') sessionId: string, @Request() req: any) {
    try {
      return await this.leadService.lockLead(id, String(req.user?.sub || ''), sessionId);
    } catch (e: any) {
      return { error: true, message: e.message };
    }
  }

  /** 关闭线索详情释放锁 */
  @Post(':id/unlock')
  async unlockLead(@Param('id') id: string, @Body('sessionId') sessionId: string, @Request() req: any) {
    try {
      return await this.leadService.unlockLead(id, String(req.user?.sub || ''), sessionId);
    } catch (e: any) {
      return { error: true, message: e.message };
    }
  }

  @Post(':id/void')
  async voidLead(@Param('id') id: string, @Request() req: any, @Body() body?: { voidReason?: string; voidDetail?: string }) {
    try {
      return await this.leadService.voidLead(id, String(req.user?.sub || ''), body?.voidReason, body?.voidDetail);
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
