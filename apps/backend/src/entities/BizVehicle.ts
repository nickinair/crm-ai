import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_customer_id", ["customerId"], {})
@Index("idx_plate_no", ["plateNo"], {})
@Index("idx_vin_customer", ["vin", "customerId"], {})
@Entity("biz_vehicle", { schema: "crm_sales" })
export class BizVehicle {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", {
    name: "customer_id",
    comment: "所属客户ID",
    unsigned: true,
  })
  customerId: string;

  @Column("varchar", {
    name: "brand",
    nullable: true,
    comment: "品牌",
    length: 60,
  })
  brand: string | null;

  @Column("varchar", {
    name: "plate_no",
    nullable: true,
    comment: "车牌号",
    length: 20,
  })
  plateNo: string | null;

  @Column("varchar", {
    name: "model",
    nullable: true,
    comment: "车型款式",
    length: 60,
  })
  model: string | null;

  @Column("varchar", {
    name: "vin",
    nullable: true,
    comment: "车架号(VIN)",
    length: 25,
  })
  vin: string | null;

  @Column("date", {
    name: "purchase_date",
    nullable: true,
    comment: "购车日期",
  })
  purchaseDate: string | null;

  @Column("int", {
    name: "mileage",
    comment: "当前公里数",
    unsigned: true,
    default: () => "'0'",
  })
  mileage: number;

  @Column("tinyint", {
    name: "vehicle_status",
    comment: "1=正常, 0=已报废",
    default: () => "'1'",
  })
  vehicleStatus: number;

  @Column("varchar", {
    name: "remark",
    nullable: true,
    comment: "备注",
    length: 512,
  })
  remark: string | null;

  @Column("varchar", {
    name: "style",
    nullable: true,
    comment: "款式",
    length: 60,
  })
  style: string | null;

  @Column("varchar", {
    name: "is_mileage_over_40k",
    nullable: true,
    comment: "里程>=4万公里",
    length: 20,
  })
  isMileageOver40k: string | null;

  @Column("varchar", {
    name: "is_mileage_over_95k",
    nullable: true,
    comment: "里程>=9.5万公里",
    length: 20,
  })
  isMileageOver95k: string | null;

  @Column("varchar", {
    name: "has_extended_warranty",
    nullable: true,
    comment: "是否已购整车延保",
    length: 20,
  })
  hasExtendedWarranty: string | null;

  @Column("varchar", {
    name: "has_battery_warranty",
    nullable: true,
    comment: "是否已购电池延保",
    length: 20,
  })
  hasBatteryWarranty: string | null;

  @Column("varchar", {
    name: "has_peace_of_mind",
    nullable: true,
    comment: "是否已购安心保",
    length: 20,
  })
  hasPeaceOfMind: string | null;

  @Column("varchar", {
    name: "has_tire_protection",
    nullable: true,
    comment: "是否已购轮胎保障",
    length: 20,
  })
  hasTireProtection: string | null;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @Column("datetime", { name: "updated_at", nullable: true })
  updatedAt: Date | null;
}
