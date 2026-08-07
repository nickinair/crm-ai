import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * 线索锁定记录（PRD 4.3.1）
 * 销售进入线索详情时加锁，关闭详情或会话过期释放；锁定中的线索不可被重新分配。
 */
@Index("idx_lead_id", ["leadId"], {})
@Index("idx_account_id", ["accountId"], {})
@Index("idx_active", ["leadId", "unlockedAt", "expireAt"], {})
@Entity("biz_lead_lock", { schema: "crm_sales" })
export class BizLeadLock {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", { name: "lead_id", comment: "线索ID", unsigned: true })
  leadId: string;

  @Column("varchar", { name: "lead_code", comment: "线索编码", length: 32 })
  leadCode: string;

  @Column("bigint", { name: "account_id", comment: "销售账号ID", unsigned: true })
  accountId: string;

  @Column("varchar", {
    name: "account_code",
    nullable: true,
    comment: "销售编码",
    length: 32,
  })
  accountCode: string | null;

  @Column("varchar", { name: "session_id", comment: "浏览器会话标识", length: 64 })
  sessionId: string;

  @Column("datetime", {
    name: "locked_at",
    comment: "锁定时间",
    default: () => "CURRENT_TIMESTAMP",
  })
  lockedAt: Date;

  @Column("datetime", {
    name: "unlocked_at",
    nullable: true,
    comment: "解锁时间，为空表示锁定中",
  })
  unlockedAt: Date | null;

  @Column("datetime", { name: "expire_at", comment: "过期时间，超时自动视为解锁" })
  expireAt: Date;
}
