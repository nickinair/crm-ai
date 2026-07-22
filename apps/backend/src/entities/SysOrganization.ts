import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_org_path", ["orgPath"], {})
@Index("idx_parent_id", ["parentId"], {})
@Index("uk_org_code", ["orgCode"], { unique: true })
@Entity("sys_organization", { schema: "crm_sales" })
export class SysOrganization {
  @PrimaryGeneratedColumn({
    type: "bigint",
    name: "id",
    comment: "组织ID",
    unsigned: true,
  })
  id: string;

  @Column("bigint", {
    name: "parent_id",
    nullable: true,
    comment: "父级组织ID，顶级为NULL",
    unsigned: true,
  })
  parentId: string | null;

  @Column("varchar", {
    name: "org_name",
    comment: "组织名称（≤30中文字符）",
    length: 60,
  })
  orgName: string;

  @Column("varchar", {
    name: "org_code",
    unique: true,
    comment: "组织编码",
    length: 32,
  })
  orgCode: string;

  @Column("tinyint", {
    name: "org_level",
    comment: "组织层级（1=顶级）",
    unsigned: true,
  })
  orgLevel: number;

  @Column("varchar", {
    name: "org_path",
    comment: "全路径，如 /1/3/7/ 用于快速祖先查询",
    length: 512,
  })
  orgPath: string;

  @Column("tinyint", {
    name: "status",
    comment: "1=启用, 0=禁用",
    default: () => "'1'",
  })
  status: number;

  @Column("int", {
    name: "sort_order",
    comment: "同级排序",
    default: () => "'0'",
  })
  sortOrder: number;

  @Column("datetime", {
    name: "created_at",
    comment: "创建时间",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @Column("datetime", {
    name: "updated_at",
    nullable: true,
    comment: "更新时间",
  })
  updatedAt: Date | null;
}
