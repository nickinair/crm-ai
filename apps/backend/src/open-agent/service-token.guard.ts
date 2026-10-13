import { CanActivate, ExecutionContext, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

/**
 * 智能体平台调用 CRM 的服务间鉴权（技术方案 §11.2）：
 * - 请求头 X-Agent-Token 与环境变量 AGENT_SERVICE_TOKEN 常量时间比较；
 * - AGENT_ALLOWED_IPS（逗号分隔）非空时，只允许这些来源 IP；
 * - 没配置令牌时整组接口不可用，避免误开放。
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.env.AGENT_SERVICE_TOKEN;
    if (!expected || expected.length < 32) throw new ServiceUnavailableException('智能体开放接口未启用');
    const req = ctx.switchToHttp().getRequest();
    const allowed = (this.env.AGENT_ALLOWED_IPS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const ip = String(req.ip ?? req.socket?.remoteAddress ?? '').replace(/^::ffff:/, '');
    if (allowed.length && !allowed.includes(ip)) throw new ForbiddenException('来源地址不在白名单');
    const given = String(req.headers['x-agent-token'] ?? '');
    const a = createHash('sha256').update(given).digest();
    const b = createHash('sha256').update(expected).digest();
    if (!given || !timingSafeEqual(a, b)) throw new UnauthorizedException('服务令牌无效');
    return true;
  }
}
