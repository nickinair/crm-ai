import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_product_type", ["productType"], {})
@Index("idx_status", ["status"], {})
@Index("uk_product_code", ["productCode"], { unique: true })
@Entity("biz_product", { schema: "crm_sales" })
export class BizProduct {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("varchar", {
    name: "product_code",
    unique: true,
    comment: "商品编码",
    length: 32,
  })
  productCode: string;

  @Column("varchar", {
    name: "product_type",
    comment: "商品类型（charging_pile/warranty/boutique）",
    length: 32,
  })
  productType: string;

  @Column("varchar", { name: "product_name", comment: "商品名称", length: 120 })
  productName: string;

  @Column("varchar", {
    name: "product_model",
    nullable: true,
    comment: "商品型号/规格",
    length: 120,
  })
  productModel: string | null;

  @Column("json", {
    name: "spec_params",
    nullable: true,
    comment: "规格参数（KV对）",
  })
  specParams: object | null;

  @Column("varchar", {
    name: "unit",
    comment: "单位（个/套）",
    length: 10,
    default: () => "'个'",
  })
  unit: string;

  @Column("decimal", {
    name: "cost_price",
    comment: "成本价",
    precision: 12,
    scale: 2,
    default: () => "'0.00'",
  })
  costPrice: string;

  @Column("decimal", {
    name: "sale_price",
    comment: "售价",
    precision: 12,
    scale: 2,
    default: () => "'0.00'",
  })
  salePrice: string;

  @Column("tinyint", {
    name: "status",
    comment: "1=生效中, 0=已归档",
    default: () => "'1'",
  })
  status: number;

  @Column("varchar", {
    name: "product_attribute",
    nullable: true,
    comment: "商品属性（选项随商品类型联动，字典驱动）",
    length: 64,
  })
  productAttribute: string | null;

  @Column("varchar", {
    name: "applicable_model",
    nullable: true,
    comment: "适用车型（字典驱动，非必填）",
    length: 128,
  })
  applicableModel: string | null;

  @Column("varchar", {
    name: "install_attribute",
    nullable: true,
    comment: "安装属性（字典驱动，非必填）",
    length: 64,
  })
  installAttribute: string | null;

  @Column("varchar", {
    name: "product_remark",
    nullable: true,
    comment: "商品备注",
    length: 500,
  })
  productRemark: string | null;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @Column("datetime", { name: "updated_at", nullable: true })
  updatedAt: Date | null;
}
