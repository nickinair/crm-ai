import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_dict_type_id", ["dictTypeId"], {})
@Index("uk_type_item_code", ["dictTypeId", "itemCode"], { unique: true })
@Entity("sys_dict_item", { schema: "crm_sales" })
export class SysDictItem {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", {
    name: "dict_type_id",
    comment: "所属字典类型ID",
    unsigned: true,
  })
  dictTypeId: string;

  @Column("varchar", { name: "item_code", comment: "字典项编码", length: 64 })
  itemCode: string;

  @Column("varchar", { name: "item_label", comment: "显示名称", length: 120 })
  itemLabel: string;

  @Column("varchar", { name: "item_value", comment: "存储值", length: 120 })
  itemValue: string;

  @Column("int", { name: "sort_order", default: () => "'0'" })
  sortOrder: number;

  @Column("tinyint", { name: "status", default: () => "'1'" })
  status: number;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
