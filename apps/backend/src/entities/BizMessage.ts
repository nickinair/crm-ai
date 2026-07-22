import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_created_at", ["createdAt"], {})
@Index("idx_is_read", ["isRead"], {})
@Index("idx_msg_category", ["msgCategory"], {})
@Index("idx_target_account", ["targetAccountId"], {})
@Entity("biz_message", { schema: "crm_sales" })
export class BizMessage {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("tinyint", {
    name: "msg_category",
    comment: "1=客户预警,2=客户通知,3=系统通知,4=系统预警",
  })
  msgCategory: number;

  @Column("varchar", { name: "msg_type", comment: "消息子类型", length: 32 })
  msgType: string;

  @Column("varchar", { name: "title", comment: "标题", length: 120 })
  title: string;

  @Column("text", { name: "content", nullable: true, comment: "内容" })
  content: string | null;

  @Column("bigint", {
    name: "target_account_id",
    nullable: true,
    comment: "目标接收人",
    unsigned: true,
  })
  targetAccountId: string | null;

  @Column("bigint", {
    name: "related_customer_id",
    nullable: true,
    comment: "关联客户",
    unsigned: true,
  })
  relatedCustomerId: string | null;

  @Column("bigint", {
    name: "related_lead_id",
    nullable: true,
    comment: "关联线索",
    unsigned: true,
  })
  relatedLeadId: string | null;

  @Column("tinyint", {
    name: "is_read",
    comment: "是否已读 0=否,1=是",
    default: () => "'0'",
  })
  isRead: number;

  @Column("tinyint", {
    name: "is_resolved",
    comment: "是否已处理（预警用）",
    default: () => "'0'",
  })
  isResolved: number;

  @Column("datetime", { name: "resolved_at", nullable: true })
  resolvedAt: Date | null;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
