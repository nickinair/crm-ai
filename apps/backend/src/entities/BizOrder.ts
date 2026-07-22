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

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @Column("datetime", { name: "updated_at", nullable: true })
  updatedAt: Date | null;
}
