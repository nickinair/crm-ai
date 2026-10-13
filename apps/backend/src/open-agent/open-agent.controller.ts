import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { normalizePhone } from './masking';
import { OpenAgentService } from './open-agent.service';
import { ServiceTokenGuard } from './service-token.guard';

/**
 * 智能体平台开放接口（技术方案 §11.2，P1-1）：服务间调用，不走用户 JWT，改用服务令牌 + 来源 IP 白名单。
 * 智能体按群聊并发调用，跳过按 IP 的全局限流（令牌本身已限定调用方）。
 */
@Public()
@SkipThrottle()
@UseGuards(ServiceTokenGuard)
@Controller('api/open/agent')
export class OpenAgentController {
  constructor(private readonly svc: OpenAgentService) {}

  @Get('customer-context')
  customerContext(@Query('phone') phone?: string) {
    if (!phone || normalizePhone(phone).length < 7) throw new BadRequestException('phone 必填');
    return this.svc.customerContext(phone);
  }

  @Get('orders/:orderCode')
  order(@Param('orderCode') orderCode: string, @Query('customerId') customerId?: string) {
    if (!customerId || !/^\d+$/.test(customerId)) throw new BadRequestException('customerId 必填：只能查询该客户自己的订单');
    return this.svc.order(orderCode, customerId);
  }

  @Get('products')
  products(@Query('type') type?: string, @Query('updatedSince') updatedSince?: string) {
    const since = updatedSince ? new Date(updatedSince) : undefined;
    if (since && Number.isNaN(since.getTime())) throw new BadRequestException('updatedSince 不是合法时间');
    return this.svc.productList(type || undefined, since);
  }
}
