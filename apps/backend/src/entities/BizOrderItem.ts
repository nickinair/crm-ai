import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_order_id", ["orderId"], {})
@Index("idx_product_id", ["productId"], {})
@Entity("biz_order_item", { schema: "crm_sales" })
export class BizOrderItem {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", { name: "order_id", comment: "订单ID", unsigned: true })
  orderId: string;

  @Column("bigint", {
    name: "product_id",
    nullable: true,
    comment: "商品ID",
    unsigned: true,
  })
  productId: string | null;

  @Column("tinyint", {
    name: "product_role",
    comment: "1=商品, 2=赠品",
    default: () => "'1'",
  })
  productRole: number;

  @Column("varchar", {
    name: "product_name",
    comment: "商品名称（冗余快照）",
    length: 120,
  })
  productName: string;

  @Column("varchar", {
    name: "product_model",
    nullable: true,
    comment: "商品型号（冗余快照）",
    length: 120,
  })
  productModel: string | null;

  @Column("decimal", {
    name: "unit_price",
    comment: "成交单价",
    precision: 12,
    scale: 2,
    default: () => "'0.00'",
  })
  unitPrice: string;

  @Column("int", { name: "quantity", comment: "数量", default: () => "'1'" })
  quantity: number;

  @Column("decimal", {
    name: "subtotal",
    comment: "小计",
    precision: 12,
    scale: 2,
    default: () => "'0.00'",
  })
  subtotal: string;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
