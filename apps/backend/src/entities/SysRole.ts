import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("uk_role_code", ["roleCode"], { unique: true })
@Index("uk_role_name", ["roleName"], { unique: true })
@Entity("sys_role", { schema: "crm_sales" })
export class SysRole {
  @PrimaryGeneratedColumn({
    type: "bigint",
    name: "id",
    comment: "角色ID",
    unsigned: true,
  })
  id: string;

  @Column("varchar", {
    name: "role_name",
    unique: true,
    comment: "角色名称",
    length: 60,
  })
  roleName: string;

  @Column("varchar", {
    name: "role_code",
    unique: true,
    comment: "角色编码",
    length: 32,
  })
  roleCode: string;

  @Column("tinyint", {
    name: "status",
    comment: "1=启用, 0=停用",
    default: () => "'1'",
  })
  status: number;

  @Column("varchar", {
    name: "remark",
    nullable: true,
    comment: "角色说明（≤100中文字符）",
    length: 200,
  })
  remark: string | null;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @Column("datetime", { name: "updated_at", nullable: true })
  updatedAt: Date | null;
}
