import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_assigned_account", ["assignedAccountId"], {})
@Index("idx_channel_source", ["channelSource"], {})
@Index("idx_customer_id", ["customerId"], {})
@Index("idx_last_follow", ["lastFollowAt"], {})
@Index("idx_lead_status", ["leadStatus"], {})
@Index("idx_next_recycle", ["nextRecycleAt"], {})
@Index("idx_order_id", ["orderId"], {})
@Index("idx_vehicle_id", ["vehicleId"], {})
@Index("uk_lead_code", ["leadCode"], { unique: true })
@Entity("biz_lead", { schema: "crm_sales" })
export class BizLead {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("varchar", {
    name: "lead_code",
    unique: true,
    comment: "线索编码",
    length: 32,
  })
  leadCode: string;

  @Column("bigint", {
    name: "customer_id",
    nullable: true,
    comment: "关联客户ID",
    unsigned: true,
  })
  customerId: string | null;

  @Column("bigint", {
    name: "vehicle_id",
    nullable: true,
    comment: "关联车辆ID",
    unsigned: true,
  })
  vehicleId: string | null;

  @Column("varchar", {
    name: "channel_source",
    comment: "渠道来源（字典code）",
    length: 32,
  })
  channelSource: string;

  @Column("varchar", {
    name: "source_method",
    nullable: true,
    comment: "线索来源方式（字典code）",
    length: 32,
  })
  sourceMethod: string | null;

  @Column("date", { name: "source_date", nullable: true, comment: "来源日期" })
  sourceDate: string | null;

  @Column("varchar", {
    name: "is_add_wechat",
    nullable: true,
    comment: "添加微信状态（字典code）",
    length: 32,
  })
  isAddWechat: string | null;

  @Column("varchar", {
    name: "purchase_intention",
    nullable: true,
    comment: "购买意向（字典code）",
    length: 32,
  })
  purchaseIntention: string | null;

  @Column("varchar", {
    name: "communication_tendency",
    nullable: true,
    comment: "客户沟通倾向（字典code）",
    length: 32,
  })
  communicationTendency: string | null;

  @Column("varchar", {
    name: "call_result",
    nullable: true,
    comment: "最近呼叫结果",
    length: 32,
  })
  callResult: string | null;

  @Column("tinyint", {
    name: "lead_status",
    comment:
      "0=待分配,1=待跟进,2=跟进中,3=已完成,4=已战败,5=已作废,6=回收待分配",
    default: () => "'0'",
  })
  leadStatus: number;

  @Column("bigint", {
    name: "assigned_account_id",
    nullable: true,
    comment: "当前负责销售ID",
    unsigned: true,
  })
  assignedAccountId: string | null;

  @Column("datetime", {
    name: "assigned_at",
    nullable: true,
    comment: "分配时间",
  })
  assignedAt: Date | null;

  @Column("datetime", {
    name: "last_follow_at",
    nullable: true,
    comment: "最新跟进时间",
  })
  lastFollowAt: Date | null;

  @Column("datetime", {
    name: "next_follow_at",
    nullable: true,
    comment: "下次计划跟进时间",
  })
  nextFollowAt: Date | null;

  @Column("datetime", {
    name: "next_recycle_at",
    nullable: true,
    comment: "下次回收时间（超时回收用）",
  })
  nextRecycleAt: Date | null;

  @Column("bigint", {
    name: "parent_lead_id",
    nullable: true,
    comment: "派生来源的父线索ID（如战败再分配时记录原战败线索ID）",
    unsigned: true,
  })
  parentLeadId: string | null;

  @Column("bigint", {
    name: "order_id",
    nullable: true,
    comment: "关联订单ID",
    unsigned: true,
  })
  orderId: string | null;

  @Column("text", {
    name: "previous_assignees",
    nullable: true,
    comment: "历史分配过的销售ID(逗号分隔)，退回后记录",
  })
  previousAssignees: string | null;

  @Column("text", { name: "remark", nullable: true, comment: "备注" })
  remark: string | null;

  @Column("tinyint", {
    name: "create_type",
    comment: "线索创建类型：1=普通新建，2=战败线索复活",
    default: () => "'1'",
  })
  createType: number;

  @Column("tinyint", {
    name: "assign_control",
    nullable: true,
    comment: "分配管控标识：1=战败冷却期，2=战败已复活；非空时不可分配/领取",
  })
  assignControl: number | null;

  @Column("tinyint", {
    name: "order_situation",
    comment: "订单情况：0=未下单,1=存在未完结订单,2=全部订单已作废,3=全部订单已完结",
    default: () => "'0'",
  })
  orderSituation: number;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @Column("bigint", {
    name: "created_by",
    nullable: true,
    comment: "创建人ID",
    unsigned: true,
  })
  createdBy: string | null;

  @Column("datetime", { name: "updated_at", nullable: true })
  updatedAt: Date | null;

  @Column("datetime", {
    name: "first_follow_at",
    nullable: true,
    comment: "首条跟进记录时间",
  })
  firstFollowAt: Date | null;
}
