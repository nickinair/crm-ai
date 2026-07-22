import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_account_id", ["accountId"], {})
@Index("idx_customer_id", ["customerId"], {})
@Index("idx_follow_time", ["followTime"], {})
@Index("idx_lead_id", ["leadId"], {})
@Entity("biz_follow_record", { schema: "crm_sales" })
export class BizFollowRecord {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", { name: "lead_id", comment: "关联线索ID", unsigned: true })
  leadId: string;

  @Column("bigint", {
    name: "customer_id",
    nullable: true,
    comment: "关联客户ID",
    unsigned: true,
  })
  customerId: string | null;

  @Column("bigint", {
    name: "account_id",
    comment: "跟进人（销售）ID",
    unsigned: true,
  })
  accountId: string;

  @Column("tinyint", {
    name: "follow_type",
    comment: "1=新增线索,2=跟进线索,3=跟进中添加信息,4=创建订单",
  })
  followType: number;

  @Column("text", {
    name: "follow_content",
    nullable: true,
    comment: "跟进内容",
  })
  followContent: string | null;

  @Column("datetime", { name: "follow_time", comment: "跟进时间" })
  followTime: Date;

  @Column("varchar", {
    name: "call_result",
    nullable: true,
    comment: "呼叫结果",
    length: 32,
  })
  callResult: string | null;

  @Column("varchar", {
    name: "communication_tendency",
    nullable: true,
    comment: "客户沟通倾向",
    length: 32,
  })
  communicationTendency: string | null;

  @Column("varchar", {
    name: "purchase_intention",
    nullable: true,
    comment: "购买意向",
    length: 32,
  })
  purchaseIntention: string | null;

  @Column("datetime", {
    name: "next_plan_time",
    nullable: true,
    comment: "下次计划回访时间",
  })
  nextPlanTime: Date | null;

  @Column("tinyint", {
    name: "lead_status",
    nullable: true,
    comment: "此时的线索状态",
  })
  leadStatus: number | null;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
