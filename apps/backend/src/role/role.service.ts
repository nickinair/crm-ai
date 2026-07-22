import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { SysRole } from '../entities/SysRole';
import { randomBytes } from 'crypto';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(SysRole)
    private roleRepository: Repository<SysRole>,
  ) {}

  async createRole(data: { roleName: string; status: number; remark?: string }) {
    if (!data.roleName) {
      throw new BadRequestException('角色名称不能为空');
    }

    // Check if role name already exists
    const existing = await this.roleRepository.findOne({ where: { roleName: data.roleName } });
    if (existing) {
      throw new BadRequestException('角色名称已存在');
    }

    // Generate a unique roleCode
    const roleCode = `ROLE_${randomBytes(4).toString('hex').toUpperCase()}`;

    const newRole = this.roleRepository.create({
      roleName: data.roleName,
      roleCode: roleCode,
      status: data.status ?? 1,
      remark: data.remark || null,
    });

    return await this.roleRepository.save(newRole);
  }

  async updateRole(id: string, data: { roleName?: string; status?: number; remark?: string }) {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) {
      throw new BadRequestException('角色不存在');
    }

    const SYSTEM_ROLES = ['super_admin', 'sales'];
    if (SYSTEM_ROLES.includes(role.roleCode)) {
      throw new BadRequestException('系统内置角色不支持修改');
    }

    if (data.roleName && data.roleName !== role.roleName) {
      const existing = await this.roleRepository.findOne({ where: { roleName: data.roleName } });
      if (existing) {
        throw new BadRequestException('角色名称已存在');
      }
      role.roleName = data.roleName;
    }

    if (data.status !== undefined) {
      role.status = data.status;
    }
    if (data.remark !== undefined) {
      role.remark = data.remark;
    }

    return await this.roleRepository.save(role);
  }

  async getRoles(page: number = 1, pageSize: number = 10, roleName?: string) {
    const queryBuilder = this.roleRepository.createQueryBuilder('role');
    
    if (roleName) {
      queryBuilder.andWhere('role.roleName LIKE :roleName', { roleName: `%${roleName}%` });
    }

    queryBuilder.orderBy('role.id', 'DESC');
    queryBuilder.skip((page - 1) * pageSize);
    queryBuilder.take(pageSize);

    const [list, total] = await queryBuilder.getManyAndCount();

    return {
      list,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    };
  }
}
