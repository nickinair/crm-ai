import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BizFollowRecord } from '../entities/BizFollowRecord';
import { BizLead } from '../entities/BizLead';

@Injectable()
export class FollowService {
  constructor(
    @InjectRepository(BizFollowRecord) private readonly followRepo: Repository<BizFollowRecord>,
    @InjectRepository(BizLead) private readonly leadRepo: Repository<BizLead>,
  ) {}

  async addFollowRecord(data: Partial<BizFollowRecord> & { communicationTendency?: string; purchaseIntention?: string; nextPlanTime?: Date | string }) {
    if (!data.leadId) {
      throw new BadRequestException('Lead ID is required');
    }
    
    // Create follow record
    data.followTime = new Date();
    // Map string status to numeric code
    const statusMap: Record<string, number> = { '跟进中': 2, '已完成': 3, '已成交': 3, '已战败': 4 };
    const numericStatus = typeof data.leadStatus === 'string' ? (statusMap[data.leadStatus] ?? 2) : (data.leadStatus || 2);

    const oldLead = await this.leadRepo.findOne({ where: { id: data.leadId } });
    let finalContent = data.followContent;
    if (oldLead && oldLead.leadStatus !== numericStatus) {
      const statusNames: Record<number, string> = { 0: '待分配', 1: '待跟进', 2: '跟进中', 3: '已成交', 4: '已战败' };
      const oldStatusName = statusNames[oldLead.leadStatus] || '未知';
      const newStatusName = statusNames[numericStatus] || '未知';
      const changeText = `【状态变更为：${newStatusName}】`;
      finalContent = finalContent ? `${changeText}\n${finalContent}` : changeText;
    }

    const record = this.followRepo.create({
      leadId: data.leadId,
      customerId: data.customerId,
      accountId: data.accountId,
      followType: data.followType,
      followContent: finalContent,
      followTime: data.followTime,
      callResult: data.callResult,
      communicationTendency: data.communicationTendency,
      purchaseIntention: data.purchaseIntention,
      nextPlanTime: data.nextPlanTime ? new Date(data.nextPlanTime) : null,
      leadStatus: numericStatus
    });
    const saved = await this.followRepo.save(record);

    // Update lead status and lastFollowAt
    const leadUpdate: any = {
      leadStatus: numericStatus,
      lastFollowAt: new Date(),
    };
    // 线索转为已战败时立即进入「战败冷却期」（冻结 N 天后由定时任务解冻，PRD 4.8）
    // 冷却天数配置为 0 时语义为「无冷却」：不冻结，战败后立即可被分配/领取
    if (numericStatus === 4 && oldLead?.leadStatus !== 4) {
      const cooldownDays = await this.getDefeatCooldownDays();
      if (cooldownDays > 0) {
        leadUpdate.assignControl = 1;
      }
      leadUpdate.updatedAt = new Date(); // 冷却计时起点 = 战败时刻
    }
    if (!oldLead?.firstFollowAt) {
      leadUpdate.firstFollowAt = new Date();
    }
    if (data.callResult) leadUpdate.callResult = data.callResult;
    if (data.communicationTendency) leadUpdate.communicationTendency = data.communicationTendency;
    if (data.purchaseIntention) leadUpdate.purchaseIntention = data.purchaseIntention;
    if (data.nextPlanTime) leadUpdate.nextFollowAt = data.nextPlanTime;

    await this.leadRepo.update(data.leadId, leadUpdate);

    return saved;
  }

  /** 战败冷却天数：读数据字典 defeat_cooldown_days，异常/未配置回退 30 */
  private async getDefeatCooldownDays(): Promise<number> {
    try {
      const rows = await this.followRepo.manager.query(
        `SELECT i.item_value FROM sys_dict_item i
         JOIN sys_dict_type t ON t.id = i.dict_type_id
         WHERE t.dict_type_code = 'defeat_cooldown_days' AND i.status = 1
         ORDER BY i.sort_order LIMIT 1`);
      if (rows.length && !Number.isNaN(Number(rows[0].item_value))) return Number(rows[0].item_value);
    } catch { /* 回退默认值 */ }
    return 30;
  }
}
