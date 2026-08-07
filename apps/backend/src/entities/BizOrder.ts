import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_customer_id", ["customerId"], {})
@Index("idx_lead_id", ["leadId"], {})
@Index("idx_order_status", ["orderStatus"], {})
@Index("idx_salesperson_id", ["salespersonId"], {})
@Index("uk_order_code", ["orderCode"], { unique: true })
@Entity("biz_order", { schema: "crm_sales" })
export class BizOrder {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("varchar", {
    name: "order_code",
    unique: true,
    comment: "订单编号",
    length: 32,
  })
  orderCode: string;

  @Column("bigint", { name: "customer_id", comment: "客户ID", unsigned: true })
  customerId: string;

  @Column("bigint", {
    name: "lead_id",
    nullable: true,
    comment: "关联线索ID",
    unsigned: true,
  })
  leadId: string | null;

  @Column("varchar", {
    name: "channel_source",
    nullable: true,
    comment: "渠道来源",
    length: 32,
  })
  channelSource: string | null;

  @Column("varchar", {
    name: "payment_method",
    nullable: true,
    comment: "支付方式",
    length: 32,
  })
  paymentMethod: string | null;

  @Column("decimal", {
    name: "total_amount",
    comment: "订单总金额",
    precision: 12,
    scale: 2,
    default: () => "'0.00'",
  })
  totalAmount: string;

  @Column("tinyint", {
    name: "order_status",
    comment: "0=待确认,1=已确认,2=已完成,3=已取消",
    default: () => "'0'",
  })
  orderStatus: number;

  @Column("varchar", {
    name: "order_platform",
    nullable: true,
    comment: "下单平台（抖音/天猫/京东）",
    length: 32,
  })
  orderPlatform: string | null;

  @Column("bigint", {
    name: "salesperson_id",
    nullable: true,
    comment: "成交销售ID",
    unsigned: true,
  })
  salespersonId: string | null;

  @Column("text", { name: "remark", nullable: true })
  remark: string | null;

  @Column("varchar", {
    name: "platform_order_no",
    nullable: true,
    comment: "平台订单编号",
    length: 30,
  })
  platformOrderNo: string | null;

  @Column("varchar", {
    name: "third_order_no",
    nullable: true,
    comment: "三方订单编号",
    length: 30,
  })
  thirdOrderNo: string | null;

  @Column("varchar", {
    name: "marketing_activity",
    nullable: true,
    comment: "营销活动名称",
    length: 64,
  })
  marketingActivity: string | null;

  @Column("varchar", {
    name: "void_reason",
    nullable: true,
    comment: "作废原因",
    length: 255,
  })
  voidReason: string | null;

  @Column("bigint", {
    name: "vehicle_id",
    nullable: true,
    comment: "关联车辆ID",
    unsigned: true,
  })
  vehicleId: string | null;

  @Column("varchar", { name: "snap_customer_name", nullable: true, comment: "快照-客户姓名", length: 64 })
  snapCustomerName: string | null;

  @Column("varchar", { name: "snap_customer_phone", nullable: true, comment: "快照-客户手机号", length: 20 })
  snapCustomerPhone: string | null;

  @Column("varchar", { name: "snap_vehicle_brand", nullable: true, comment: "快照-车辆品牌", length: 64 })
  snapVehicleBrand: string | null;

  @Column("varchar", { name: "snap_vehicle_model", nullable: true, comment: "快照-车辆车型", length: 64 })
  snapVehicleModel: string | null;

  @Column("varchar", { name: "snap_vehicle_vin", nullable: true, comment: "快照-车架号", length: 32 })
  snapVehicleVin: string | null;

  @Column("varchar", { name: "snap_lead_code", nullable: true, comment: "快照-关联线索编码", length: 32 })
  snapLeadCode: string | null;

  @Column("bigint", { name: "creator_id", nullable: true, comment: "创建人账号ID", unsigned: true })
  creatorId: string | null;

  @Column("bigint", { name: "updater_id", nullable: true, comment: "更新人账号ID", unsigned: true })
  updaterId: string | null;

  @Column("tinyint", { name: "is_draft", comment: "1=草稿(未提交)，0=正式订单", default: () => "'0'" })
  isDraft: number;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @Column("datetime", { name: "updated_at", nullable: true })
  updatedAt: Date | null;
}
