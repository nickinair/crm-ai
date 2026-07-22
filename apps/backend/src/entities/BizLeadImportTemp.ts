import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_batch_no", ["batchNo"], {})
@Index("idx_resolve_status", ["resolveStatus"], {})
@Entity("biz_lead_import_temp", { schema: "crm_sales" })
export class BizLeadImportTemp {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("varchar", { name: "batch_no", comment: "导入批次号", length: 32 })
  batchNo: string;

  @Column("json", { name: "raw_data", comment: "原始导入行数据" })
  rawData: object;

  @Column("varchar", {
    name: "warn_type",
    comment: "警告类型（customer_warn/vehicle_warn）",
    length: 32,
  })
  warnType: string;

  @Column("varchar", {
    name: "warn_detail",
    nullable: true,
    comment: "警告描述",
    length: 512,
  })
  warnDetail: string | null;

  @Column("bigint", {
    name: "conflict_customer_id",
    nullable: true,
    comment: "冲突的系统客户ID",
    unsigned: true,
  })
  conflictCustomerId: string | null;

  @Column("bigint", {
    name: "conflict_vehicle_id",
    nullable: true,
    comment: "冲突的系统车辆ID",
    unsigned: true,
  })
  conflictVehicleId: string | null;

  @Column("tinyint", {
    name: "resolve_status",
    comment: "0=待处理, 1=已处理",
    default: () => "'0'",
  })
  resolveStatus: number;

  @Column("varchar", {
    name: "resolve_action",
    nullable: true,
    comment: "处理动作（use_system/update_system/new_customer）",
    length: 32,
  })
  resolveAction: string | null;

  @Column("bigint", {
    name: "resolved_by",
    nullable: true,
    comment: "处理人ID",
    unsigned: true,
  })
  resolvedBy: string | null;

  @Column("datetime", {
    name: "resolved_at",
    nullable: true,
    comment: "处理时间",
  })
  resolvedAt: Date | null;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
