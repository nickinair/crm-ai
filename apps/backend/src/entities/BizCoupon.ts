import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_coupon_type", ["couponType"], {})
@Index("idx_status", ["status"], {})
@Index("uk_coupon_code", ["couponCode"], { unique: true })
@Entity("biz_coupon", { schema: "crm_sales" })
export class BizCoupon {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("varchar", { name: "coupon_name", comment: "券名称", length: 120 })
  couponName: string;

  @Column("varchar", { name: "coupon_type", comment: "券类型", length: 32 })
  couponType: string;

  @Column("varchar", {
    name: "coupon_code",
    unique: true,
    comment: "券码",
    length: 64,
  })
  couponCode: string;

  @Column("decimal", {
    name: "face_value",
    comment: "面额",
    precision: 12,
    scale: 2,
    default: () => "'0.00'",
  })
  faceValue: string;

  @Column("int", {
    name: "validity_days",
    nullable: true,
    comment: "有效期天数",
  })
  validityDays: number | null;

  @Column("varchar", {
    name: "source",
    nullable: true,
    comment: "来源",
    length: 120,
  })
  source: string | null;

  @Column("tinyint", {
    name: "status",
    comment: "1=可用, 0=已过期, 2=已使用",
    default: () => "'1'",
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
