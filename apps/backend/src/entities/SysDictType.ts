import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("uk_dict_type_code", ["dictTypeCode"], { unique: true })
@Entity("sys_dict_type", { schema: "crm_sales" })
export class SysDictType {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("varchar", {
    name: "dict_type_code",
    unique: true,
    comment: "字典类型编码",
    length: 64,
  })
  dictTypeCode: string;

  @Column("varchar", {
    name: "dict_type_name",
    comment: "字典类型名称",
    length: 60,
  })
  dictTypeName: string;

  @Column("tinyint", {
    name: "status",
    comment: "1=启用, 0=停用",
    default: () => "'1'",
  })
  status: number;

  @Column("varchar", { name: "remark", nullable: true, length: 200 })
  remark: string | null;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
