import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like } from 'typeorm';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SysAccountRole } from '../entities/SysAccountRole';
import { SysAccount } from '../entities/SysAccount';
import { SysRole } from '../entities/SysRole';
import { SysRolePermission } from '../entities/SysRolePermission';
import { SysPermission } from '../entities/SysPermission';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    @InjectRepository(SysAccountRole)
    private readonly accountRoleRepo: Repository<SysAccountRole>,
    @InjectRepository(SysAccount)
    private readonly accountRepo: Repository<SysAccount>,
    @InjectRepository(SysRole)
    private readonly roleRepo: Repository<SysRole>,
    @InjectRepository(SysRolePermission)
    private readonly rolePermissionRepo: Repository<SysRolePermission>,
    @InjectRepository(SysPermission)
    private readonly permissionRepo: Repository<SysPermission>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if the route is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('未登录或登录已过期，请重新登录');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      
      // Get user's roles and permissions
      const userId = payload.sub;
      const permissions = await this.getUserPermissions(userId);
      const roleCodes = await this.getUserRoleCodes(userId);

      // Attach user info + permissions to request for downstream use
      // roleCodes / isSuperAdmin 供需要按角色放行的业务使用（如订单仅跟进人可操作，超管除外）
      (request as any).user = {
        ...payload,
        permissions,
        roleCodes,
        isSuperAdmin: roleCodes.includes('super_admin') || roleCodes.includes('super__admin'),
      };
    } catch {
      throw new UnauthorizedException('登录凭证无效或已过期，请重新登录');
    }

    return true;
  }

  private async getUserPermissions(userId: string): Promise<string[]> {
    // 1. Get user's role IDs
    const accountRoles = await this.accountRoleRepo.find({ where: { accountId: userId } });
    if (accountRoles.length === 0) {
      // 无任何角色时检查账号是否仍然存在/有效：
      // 账号已被删除或停用的旧会话应判为 401（引导重新登录），而不是对每个请求无限返回 403
      const account = await this.accountRepo.findOne({ where: { id: userId } });
      if (!account || account.status !== 1) {
        throw new UnauthorizedException('账号状态已变更，请重新登录');
      }
      return [];
    }

    const roleIds = accountRoles.map(ar => ar.roleId);

    // 2. Get role objects
    const roles = await this.roleRepo.find({
      where: { id: In(roleIds) },
    });

    // 3. Check if user has super_admin role → full permissions
    const hasSystemRole = roles.some(r => 
      r.roleCode === 'super_admin' || r.roleCode === 'super__admin'
    );
    if (hasSystemRole) {
      const allPerms = await this.permissionRepo.find({ where: { status: 1 } });
      return allPerms.map(p => p.permCode);
    }

    // 4. Check if user has sales role → limited permissions
    const hasSalesRole = roles.some(r => r.roleCode === 'sales');
    
    // 5. Collect permissions from all roles
    const rolePermissions = await this.rolePermissionRepo.find({
      where: { roleId: In(roleIds) },
    });
    
    // Sales role: workbench module plus all its sub-permissions (hardcoded, not stored in role-permission table)
    let salesCodes: string[] = [];
    if (hasSalesRole) {
      const wbPerms = await this.permissionRepo.find({
        where: [{ permCode: 'workbench', status: 1 }, { permCode: Like('workbench:%'), status: 1 }],
      });
      salesCodes = wbPerms.map(p => p.permCode);
    }

    if (rolePermissions.length === 0) {
      return salesCodes;
    }

    const permIds = rolePermissions.map(rp => rp.permissionId);
    const perms = await this.permissionRepo.find({
      where: { id: In(permIds), status: 1 },
    });

    const permCodes = perms.map(p => p.permCode);
    for (const code of salesCodes) {
      if (!permCodes.includes(code)) permCodes.push(code);
    }

    return permCodes;
  }

  /** 取用户的角色编码列表（供按角色放行的业务判断使用） */
  private async getUserRoleCodes(userId: string): Promise<string[]> {
    const accountRoles = await this.accountRoleRepo.find({ where: { accountId: userId } });
    if (accountRoles.length === 0) return [];
    const roles = await this.roleRepo.find({ where: { id: In(accountRoles.map(ar => ar.roleId)) } });
    return roles.map(r => r.roleCode);
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
