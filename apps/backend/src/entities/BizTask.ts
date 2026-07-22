import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_account_id", ["accountId"], {})
@Index("idx_customer_id", ["customerId"], {})
@Index("idx_remind_date", ["remindDate"], {})
@Entity("biz_task", { schema: "crm_sales" })
export class BizTask {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", { name: "account_id", comment: "关联销售", unsigned: true })
  accountId: string;

  @Column("bigint", {
    name: "customer_id",
    comment: "关联客户",
    unsigned: true,
  })
  customerId: string;

  @Column("varchar", { name: "task_type", comment: "任务类型", length: 32 })
  taskType: string;

  @Column("date", { name: "remind_date", comment: "提醒日期" })
  remindDate: string;

  @Column("varchar", {
    name: "content",
    nullable: true,
    comment: "任务内容",
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
