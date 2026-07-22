import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_account_id", ["accountId"], {})
@Index("idx_created_at", ["createdAt"], {})
@Index("idx_module_action", ["module", "action"], {})
@Entity("sys_operation_log", { schema: "crm_sales" })
export class SysOperationLog {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", { name: "account_id", comment: "操作人ID", unsigned: true })
  accountId: string;

  @Column("varchar", {
    name: "module",
    comment: "模块名（lead/customer/order...）",
    length: 32,
  })
  module: string;

  @Column("varchar", {
    name: "action",
    comment: "操作类型（create/update/delete/import/export）",
    length: 32,
  })
  action: string;

  @Column("varchar", {
    name: "target_type",
    nullable: true,
    comment: "操作对象类型",
    length: 32,
  })
  targetType: string | null;

  @Column("bigint", {
    name: "target_id",
    nullable: true,
    comment: "操作对象ID",
    unsigned: true,
  })
  targetId: string | null;

  @Column("json", {
    name: "detail",
    nullable: true,
    comment: "操作详情（变更前后 diff）",
  })
  detail: object | null;

  @Column("varchar", {
    name: "ip",
    nullable: true,
    comment: "操作IP",
    length: 45,
  })
  ip: string | null;

  @Column("varchar", { name: "user_agent", nullable: true, length: 256 })
  userAgent: string | null;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
