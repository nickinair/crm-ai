import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SysPermission } from '../entities/SysPermission';
import { SysRolePermission } from '../entities/SysRolePermission';
import { SysRole } from '../entities/SysRole';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(SysPermission)
    private readonly permissionRepo: Repository<SysPermission>,
    @InjectRepository(SysRolePermission)
    private readonly rolePermissionRepo: Repository<SysRolePermission>,
    @InjectRepository(SysRole)
    private readonly roleRepo: Repository<SysRole>,
  ) {}

  // 1. 获取系统中所有的权限，并组装成树形结构
  async getPermissionTree() {
    const allPermissions = await this.permissionRepo.find({
      where: { status: 1 },
      order: { sortOrder: 'ASC' },
    });

    // 组装树形结构
    const buildTree = (parentId: string | null = null): any[] => {
      return allPermissions
        .filter(p => p.parentId === parentId)
        .map(p => ({
          ...p,
          children: buildTree(p.id),
        }));
    };

    return buildTree(null);
  }

  // 2. 获取某个角色的所有权限ID
  // 内置角色的权限并不存 sys_role_permission 表（后端硬编码生效），
  // 这里返回其实际生效的权限，保证权限配置抽屉的只读展示与真实行为一致
  async getRolePermissions(roleId: string) {
    const rolePerms = await this.rolePermissionRepo.find({
      where: { roleId },
    });
    const ids = rolePerms.map(rp => rp.permissionId);

    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (role) {
      const code = role.roleCode;
      if (code === 'super_admin' || code === 'super__admin') {
        const allPerms = await this.permissionRepo.find({ where: { status: 1 } });
        return allPerms.map(p => p.id);
      }
      if (code === 'sales') {
        const allPerms = await this.permissionRepo.find({ where: { status: 1 } });
        const workbenchPerms = allPerms.filter(
          p => p.permCode === 'workbench' || p.permCode.startsWith('workbench:'),
        );
        for (const p of workbenchPerms) {
          if (!ids.includes(p.id)) ids.push(p.id);
        }
      }
    }

    return ids;
  }

  // 3. 更新角色权限
  async updateRolePermissions(roleId: string, permissionIds: string[]) {
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) {
      throw new BadRequestException('角色不存在');
    }

    // 系统内置的三个角色不允许修改权限
    const systemRoleCodes = ['super_admin', 'sales'];
    if (systemRoleCodes.includes(role.roleCode)) {
      throw new BadRequestException('系统内置角色的权限不支持修改');
    }

    // 删除旧权限
    await this.rolePermissionRepo.delete({ roleId });

    // 插入新权限
    if (permissionIds && permissionIds.length > 0) {
      const newPerms = permissionIds.map(permId => {
        const rp = new SysRolePermission();
        rp.roleId = roleId;
        rp.permissionId = permId;
        return rp;
      });
      await this.rolePermissionRepo.save(newPerms);
    }

    return { success: true };
  }
}
