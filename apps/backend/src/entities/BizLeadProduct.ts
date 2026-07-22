import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_product_id", ["productId"], {})
@Index("uk_lead_product_role", ["leadId", "productId", "productRole"], {
  unique: true,
})
@Entity("biz_lead_product", { schema: "crm_sales" })
export class BizLeadProduct {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", { name: "lead_id", comment: "线索ID", unsigned: true })
  leadId: string;

  @Column("bigint", { name: "product_id", comment: "商品ID", unsigned: true })
  productId: string;

  @Column("tinyint", {
    name: "product_role",
    comment: "1=意向商品, 2=意向赠品",
    default: () => "'1'",
  })
  productRole: number;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
