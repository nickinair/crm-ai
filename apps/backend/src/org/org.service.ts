import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SysOrganization } from '../entities/SysOrganization';
import { SysAccount } from '../entities/SysAccount';
import { SysAccountOrg } from '../entities/SysAccountOrg';

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(SysOrganization)
    private readonly orgRepo: Repository<SysOrganization>,
    @InjectRepository(SysAccount)
    private readonly accountRepo: Repository<SysAccount>,
    @InjectRepository(SysAccountOrg)
    private readonly accountOrgRepo: Repository<SysAccountOrg>,
  ) {}

  async create(createDto: Partial<SysOrganization>) {
    // Auto-generate orgCode: org_0x_XXXX (x=orgLevel, XXXX=4 random digits, must be unique)
    const level = createDto.orgLevel || 1;
    let orgCode = '';
    let isUnique = false;
    while (!isUnique) {
      const randomDigits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      orgCode = `org_0${level}_${randomDigits}`;
      const existing = await this.orgRepo.findOne({ where: { orgCode } });
      if (!existing) {
        isUnique = true;
      }
    }
    createDto.orgCode = orgCode;

    // Save first to get the auto-generated ID, use a dummy path to satisfy NOT NULL constraint
    const org = this.orgRepo.create({ ...createDto, orgPath: '/' });
    const saved = await this.orgRepo.save(org);
    
    // Generate actual path using the new ID
    if (saved.parentId) {
      const parent = await this.orgRepo.findOne({ where: { id: saved.parentId } });
      saved.orgPath = parent ? `${parent.orgPath}${saved.id}/` : `/${saved.id}/`;
    } else {
      saved.orgPath = `/${saved.id}/`;
    }
    
    return this.orgRepo.save(saved);
  }

  async findAll() {
    return this.orgRepo.find({ order: { sortOrder: 'ASC' } });
  }

  async findOne(id: string) {
    return this.orgRepo.findOne({ where: { id } });
  }

  async update(id: string, updateDto: Partial<SysOrganization>) {
    updateDto.updatedAt = new Date();
    await this.orgRepo.update(id, updateDto);
    return this.findOne(id);
  }

  /**
   * Helper: find all account IDs linked to the given org IDs via sys_account_org table,
   * then return the corresponding SysAccount records.
   */
  private async findAccountsByOrgIds(orgIds: string[]): Promise<SysAccount[]> {
    if (orgIds.length === 0) return [];

    const accountOrgRecords = await this.accountOrgRepo
      .createQueryBuilder('ao')
      .where('ao.org_id IN (:...orgIds)', { orgIds })
      .getMany();

    if (accountOrgRecords.length === 0) return [];

    const accountIds = [...new Set(accountOrgRecords.map(r => String(r.accountId)))];
    
    return this.accountRepo
      .createQueryBuilder('account')
      .where('account.id IN (:...accountIds)', { accountIds })
      .getMany();
  }

  async checkDelete(id: string) {
    const allOrgs = await this.orgRepo.find();
    
    // Check child orgs
    const childOrgs = allOrgs.filter(o => String(o.parentId) === String(id));
    if (childOrgs.length > 0) {
      return {
        canDelete: false,
        reason: 'hasChildren',
        childCount: childOrgs.length,
        message: `该组织下还有 ${childOrgs.length} 个子组织，请先删除子组织后再操作！`,
      };
    }

    // Check accounts under this org
    const accounts = await this.findAccountsByOrgIds([String(id)]);

    if (accounts.length > 0) {
      const names = accounts.slice(0, 5).map(a => a.realName || a.username);
      return {
        canDelete: false,
        reason: 'hasAccounts',
        accountCount: accounts.length,
        accountNames: names,
        message: `该组织下还有 ${accounts.length} 个关联账号（${names.join('、')}${accounts.length > 5 ? '等' : ''}），请先将账号迁移到其他组织或删除后再操作！`,
      };
    }

    return { canDelete: true };
  }

  async remove(id: string) {
    // 1. Check child orgs first
    const allOrgs = await this.orgRepo.find();
    const childOrgs = allOrgs.filter(o => String(o.parentId) === String(id));
    if (childOrgs.length > 0) {
      throw new BadRequestException(
        `该组织下还有 ${childOrgs.length} 个子组织，请先删除子组织后再操作！`
      );
    }

    // 2. Check if any accounts are associated with this org
    const accounts = await this.findAccountsByOrgIds([String(id)]);

    if (accounts.length > 0) {
      const names = accounts.slice(0, 5).map(a => a.realName || a.username).join('、');
      const suffix = accounts.length > 5 ? `等${accounts.length}人` : '';
      throw new BadRequestException(
        `该组织下还有 ${accounts.length} 个关联账号（${names}${suffix}），请先将这些账号迁移到其他组织或删除后再操作！`
      );
    }

    // 3. Safe to delete
    await this.orgRepo.delete(id);
    return { success: true };
  }
}
