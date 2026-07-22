import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_account_id", ["accountId"], {})
@Index("idx_customer_id", ["customerId"], {})
@Index("idx_schedule_time", ["scheduleTime"], {})
@Entity("biz_schedule", { schema: "crm_sales" })
export class BizSchedule {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", { name: "account_id", comment: "关联销售", unsigned: true })
  accountId: string;

  @Column("bigint", {
    name: "customer_id",
    nullable: true,
    comment: "关联客户",
    unsigned: true,
  })
  customerId: string | null;

  @Column("bigint", {
    name: "lead_id",
    nullable: true,
    comment: "关联线索",
    unsigned: true,
  })
  leadId: string | null;

  @Column("datetime", { name: "schedule_time", comment: "日程时间" })
  scheduleTime: Date;

  @Column("tinyint", {
    name: "schedule_type",
    comment: "1=到店接待,2=电话预约,3=其他",
  })
  scheduleType: number;

  @Column("varchar", {
    name: "content",
    nullable: true,
    comment: "日程内容",
    length: 512,
  })
  content: string | null;

  @Column("tinyint", {
    name: "status",
    comment: "0=待执行,1=已完成,2=已取消",
    default: () => "'0'",
  })
  status: number;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @Column("datetime", { name: "updated_at", nullable: true })
  updatedAt: Date | null;
}
