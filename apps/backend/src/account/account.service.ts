import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SysAccount } from '../entities/SysAccount';
import { SysAccountOrg } from '../entities/SysAccountOrg';
import { SysAccountRole } from '../entities/SysAccountRole';
import { SysOrganization } from '../entities/SysOrganization';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(SysAccount)
    private readonly accountRepo: Repository<SysAccount>,
    @InjectRepository(SysAccountOrg)
    private readonly accountOrgRepo: Repository<SysAccountOrg>,
    @InjectRepository(SysAccountRole)
    private readonly accountRoleRepo: Repository<SysAccountRole>,
    @InjectRepository(SysOrganization)
    private readonly orgRepo: Repository<SysOrganization>,
  ) {}

  private hashPhone(phone: string): string {
    return crypto.createHash('sha256').update(phone).digest('hex');
  }

  /**
   * 外呼字段校验（PRD 4.6.1）：
   * 两字段必须同时存在或同时为空；外呼账号全局唯一；空串规范为 null（避免唯一索引冲突）
   */
  private async validateCallout(dto: any, excludeId?: string) {
    if (dto.calloutAccount === undefined && dto.calloutPassword === undefined) return;
    const acc = dto.calloutAccount === undefined ? undefined : (String(dto.calloutAccount || '').trim() || null);
    const pwd = dto.calloutPassword === undefined ? undefined : (String(dto.calloutPassword || '').trim() || null);
    if (acc !== undefined) dto.calloutAccount = acc;
    if (pwd !== undefined) dto.calloutPassword = pwd;

    // 成对校验：必须同时存在或同时不存在
    if ((acc && !pwd) || (!acc && pwd)) {
      throw new BadRequestException({ code: 'CALLOUT_PAIR_REQUIRED', message: '关联外呼账号/关联外呼账号密码 必须同时存在！' });
    }
    if (acc) {
      if (acc.length > 30) throw new BadRequestException('关联外呼账号最多30个字符');
      if (pwd && pwd.length > 50) throw new BadRequestException('关联外呼账号密码最多50个字符');
      const exist = await this.accountRepo.findOne({ where: { calloutAccount: acc } });
      if (exist && String(exist.id) !== String(excludeId || '')) {
        throw new BadRequestException({ code: 'CALLOUT_ACCOUNT_EXIST', message: '该外呼账号已被关联' });
      }
    }
  }

  async create(createDto: Partial<SysAccount> & { orgIds?: string[], roleIds?: string[] }) {
    await this.validateCallout(createDto);
    // Check duplicates
    if (createDto.username) {
      const existUsername = await this.accountRepo.findOne({ where: { username: createDto.username } });
      if (existUsername) {
        throw new BadRequestException(`账号（工号）${createDto.username}已存在！`);
      }
    }
    if (createDto.phone) {
      const phoneHash = this.hashPhone(createDto.phone);
      const existPhone = await this.accountRepo.findOne({ where: { phoneHash } });
      if (existPhone) {
        throw new BadRequestException(`联系手机号${createDto.phone}已存在！`);
      }
      createDto.phoneHash = phoneHash;
    }

    // Auto generate accountCode
    const maxAccount = await this.accountRepo.createQueryBuilder('acc')
      .select('MAX(CAST(SUBSTRING(acc.accountCode, 5) AS UNSIGNED))', 'max')
      .getRawOne();
    const maxVal = maxAccount?.max ? parseInt(maxAccount.max, 10) : 0;
    const nextNum = maxVal + 1;
    createDto.accountCode = `ACC_${String(nextNum).padStart(5, '0')}`;

    if (createDto.passwordHash) {
      const salt = await bcrypt.genSalt(10);
      createDto.passwordHash = await bcrypt.hash(createDto.passwordHash, salt);
    }
    const account = this.accountRepo.create(createDto);
    const saved = await this.accountRepo.save(account);

    if (createDto.orgIds?.length) {
      const accountOrgs = createDto.orgIds.map(orgId => this.accountOrgRepo.create({ accountId: saved.id, orgId }));
      await this.accountOrgRepo.save(accountOrgs);
    }

    if (createDto.roleIds?.length) {
      const accountRoles = createDto.roleIds.map(roleId => this.accountRoleRepo.create({ accountId: saved.id, roleId }));
      await this.accountRoleRepo.save(accountRoles);
    }

    return saved;
  }

  async findAll(query: any = {}) {
    const { page = 1, pageSize = 10, username, orgId, status, calloutAccount } = query;
    const qb = this.accountRepo.createQueryBuilder('acc');
    // 关联外呼账号筛选（PRD 4.6.1）
    if (calloutAccount) {
      qb.andWhere('acc.calloutAccount LIKE :calloutAccount', { calloutAccount: `%${calloutAccount}%` });
    }

    if (username) {
      qb.andWhere('(acc.username LIKE :keyword OR acc.realName LIKE :keyword OR acc.phone LIKE :keyword)', { keyword: `%${username}%` });
    }
    if (status !== undefined && status !== '' && status !== 'all') {
      qb.andWhere('acc.status = :status', { status });
    }
    if (orgId && orgId !== 'all') {
      qb.innerJoin(SysAccountOrg, 'ao', 'ao.accountId = acc.id')
        .andWhere('ao.orgId = :orgId', { orgId });
    }
    if (query.roleId && query.roleId !== 'all') {
      qb.innerJoin('sys_account_role', 'ar', 'ar.accountId = acc.id')
        .andWhere('ar.roleId = :roleId', { roleId: query.roleId });
    }

    qb.skip((page - 1) * pageSize).take(pageSize).orderBy('acc.createdAt', 'DESC');
    const [data, total] = await qb.getManyAndCount();

    // Fetch all orgs to build paths
    const allOrgs = await this.orgRepo.find();
    const orgMap = new Map<string, SysOrganization>();
    allOrgs.forEach(o => orgMap.set(o.id.toString(), o));

    const getOrgPath = (orgId: string): string => {
      let current = orgMap.get(orgId.toString());
      const path = [];
      while (current) {
        path.unshift(current.orgName);
        if (!current.parentId) break;
        current = orgMap.get(current.parentId.toString());
      }
      return path.join(' / ');
    };

    // Attach org paths to accounts
    for (const account of data) {
      const accountOrgs = await this.accountOrgRepo.find({ where: { accountId: account.id } });
      const paths = accountOrgs.map(ao => getOrgPath(ao.orgId));
      (account as any).orgPaths = paths.join('；');
      (account as any).orgIds = accountOrgs.map(ao => ao.orgId);
      const accountRoles = await this.accountRoleRepo.find({ where: { accountId: account.id } });
      (account as any).roleIds = accountRoles.map(ar => ar.roleId);
    }

    return { data, total };
  }

  async getSalesList() {
    // Get all accounts that have the 'sales' role
    const rows = await this.accountRepo.createQueryBuilder('acc')
      .innerJoin('sys_account_role', 'ar', 'ar.accountId = acc.id')
      .innerJoin('sys_role', 'r', 'r.id = ar.roleId AND r.roleCode = :roleCode', { roleCode: 'sales' })
      .where('acc.status = 1')
      .select(['acc.id', 'acc.realName', 'acc.username'])
      .getMany();
    return rows.map(a => ({ id: a.id, name: a.realName || a.username }));
  }

  async findOne(id: string) {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) return null;
    
    const accountOrgs = await this.accountOrgRepo.find({ where: { accountId: account.id } });
    (account as any).orgIds = accountOrgs.map(ao => ao.orgId);
    
    const accountRoles = await this.accountRoleRepo.find({ where: { accountId: account.id } });
    (account as any).roleIds = accountRoles.map(ar => ar.roleId);
    
    return account;
  }

  async update(id: string, updateDto: Partial<SysAccount> & { orgIds?: string[], roleIds?: string[] }) {
    await this.validateCallout(updateDto, id);
    if (updateDto.username) {
      const existUsername = await this.accountRepo.findOne({ where: { username: updateDto.username } });
      if (existUsername && existUsername.id !== id) {
        throw new BadRequestException(`账号（工号）${updateDto.username}已存在！`);
      }
    }

    if (updateDto.phone) {
      const phoneHash = this.hashPhone(updateDto.phone);
      const existPhone = await this.accountRepo.findOne({ where: { phoneHash } });
      if (existPhone && existPhone.id !== id) {
        throw new BadRequestException(`联系手机号${updateDto.phone}已存在！`);
      }
      updateDto.phoneHash = phoneHash;
    }

    // Do not allow updating accountCode
    delete updateDto.accountCode;
    
    if (updateDto.passwordHash) {
      const salt = await bcrypt.genSalt(10);
      updateDto.passwordHash = await bcrypt.hash(updateDto.passwordHash, salt);
    }
    
    const { orgIds, roleIds, ...accountData } = updateDto;
    accountData.updatedAt = new Date();
    await this.accountRepo.update(id, accountData);

    if (orgIds) {
      await this.accountOrgRepo.delete({ accountId: id });
      if (orgIds.length > 0) {
        const newOrgs = orgIds.map(orgId => this.accountOrgRepo.create({ accountId: id, orgId }));
        await this.accountOrgRepo.save(newOrgs);
      }
    }

    if (roleIds) {
      await this.accountRoleRepo.delete({ accountId: id });
      if (roleIds.length > 0) {
        const newRoles = roleIds.map(roleId => this.accountRoleRepo.create({ accountId: id, roleId }));
        await this.accountRoleRepo.save(newRoles);
      }
    }

    return this.findOne(id);
  }

  async resetPassword(id: string, password: string) {
    if (!id) throw new BadRequestException('账号ID不能为空');
    if (!password) throw new BadRequestException('新密码不能为空');
    // 先确认账号存在，避免 id 落空时“假成功”（update 对不存在的行不会报错）
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) throw new BadRequestException('账号不存在，重置失败');
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);
    const result = await this.accountRepo.update(id, { passwordHash: hashed });
    if (!result.affected) throw new BadRequestException('密码未更新，请重试');
    return { success: true };
  }

  async remove(id: string) {
    await this.accountRepo.delete(id);
    return { success: true };
  }
}
