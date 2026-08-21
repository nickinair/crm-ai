import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SysAccount } from '../entities/SysAccount';

import { SysAccountRole } from '../entities/SysAccountRole';
import { SysRole } from '../entities/SysRole';
import { SysRolePermission } from '../entities/SysRolePermission';
import { SysPermission } from '../entities/SysPermission';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(SysAccount)
    private readonly accountRepository: Repository<SysAccount>,
    @InjectRepository(SysAccountRole)
    private readonly accountRoleRepo: Repository<SysAccountRole>,
    @InjectRepository(SysRole)
    private readonly roleRepo: Repository<SysRole>,
    @InjectRepository(SysRolePermission)
    private readonly rolePermissionRepo: Repository<SysRolePermission>,
    @InjectRepository(SysPermission)
    private readonly permissionRepo: Repository<SysPermission>,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, pass: string) {
    const user = await this.accountRepository.findOne({ where: { username } });
    if (!user || user.status === 2) {
      throw new BadRequestException('账号/密码有误，请重新输入！');
    }
    
    if (user.status === 0) {
      throw new BadRequestException('账号已禁用，请联系管理员处理！');
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('账号/密码有误，请重新输入！');
    }

    // 更新最后登录时间
    user.lastLoginAt = new Date();
    await this.accountRepository.save(user);

    // 查询角色
    const accountRoles = await this.accountRoleRepo.find({ where: { accountId: user.id } });
    const roleIds = accountRoles.map(ar => ar.roleId);
    let roleCode = '';
    let roleCodes: string[] = [];
    let permissions: string[] = [];

    if (roleIds.length > 0) {
      // 简单起见，取第一个角色
      const role = await this.roleRepo.findOne({ where: { id: roleIds[0] } });
      if (role) {
        roleCode = role.roleCode;
        if (roleCode === 'super_admin' || roleCode === 'super__admin') {
          // 超级管理员拥有全部权限
          const allPerms = await this.permissionRepo.find({ where: { status: 1 } });
          permissions = allPerms.map(p => p.permCode);
        } else if (roleCode === 'sales') {
          // 销售：工作台模块及其全部子权限 + 订单细分权限（与 JwtAuthGuard 硬编码集合保持一致）
          const wbPerms = await this.permissionRepo.find({ where: { status: 1 } });
          permissions = wbPerms
            .filter(p => p.permCode === 'workbench' || p.permCode.startsWith('workbench:'))
            .map(p => p.permCode);
          for (const code of ['order:create', 'order:void']) {
            if (!permissions.includes(code)) permissions.push(code);
          }
        } else {
          // 自定义角色查关联表
          const rps = await this.rolePermissionRepo.find({ where: { roleId: role.id } });
          if (rps.length > 0) {
            const permIds = rps.map(rp => rp.permissionId);
            // In TypeORM `In` is needed but since we are doing simple query, 
            // let's fetch all perms and filter
            const allPerms = await this.permissionRepo.find();
            permissions = allPerms.filter(p => permIds.includes(p.id)).map(p => p.permCode);
          }
        }
      }
    }

    const payload = { sub: user.id, username: user.username, realName: user.realName };
    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        accountCode: user.accountCode,
        roleCode,
        permissions,
      }
    };
  }

  // 用于第一次初始化系统管理员账号
  async initAdmin() {
    const count = await this.accountRepository.count();
    if (count > 0) {
      throw new BadRequestException('系统已存在账号，无法初始化');
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('123456', salt);

    const admin = new SysAccount();
    admin.accountCode = 'ACC_00001';
    admin.username = 'admin';
    admin.passwordHash = hash;
    admin.realName = '超级管理员';
    admin.phone = '13800138000';
    // 简单的 SHA256 可以用 Node built-in 模拟，或者这里随便填一个唯一的
    admin.phoneHash = 'admin-phone-hash';
    admin.status = 1;
    
    await this.accountRepository.save(admin);
    return { message: 'Admin account created successfully' };
  }
}
