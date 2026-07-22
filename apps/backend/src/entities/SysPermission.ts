import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_parent_id", ["parentId"], {})
@Index("uk_perm_code", ["permCode"], { unique: true })
@Entity("sys_permission", { schema: "crm_sales" })
export class SysPermission {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", {
    name: "parent_id",
    nullable: true,
    comment: "父权限ID",
    unsigned: true,
  })
  parentId: string | null;

  @Column("varchar", { name: "perm_name", comment: "权限名称", length: 60 })
  permName: string;

  @Column("varchar", {
    name: "perm_code",
    unique: true,
    comment: "权限编码（如 lead:pool:edit）",
    length: 64,
  })
  permCode: string;

  @Column("tinyint", {
    name: "perm_type",
    comment: "1=菜单, 2=按钮/操作, 3=数据",
  })
  permType: number;

  @Column("varchar", {
    name: "path",
    nullable: true,
    comment: "前端路由路径",
    length: 256,
  })
  path: string | null;

  @Column("varchar", {
    name: "icon",
    nullable: true,
    comment: "菜单图标",
    length: 64,
  })
  icon: string | null;

  @Column("int", { name: "sort_order", comment: "排序", default: () => "'0'" })
  sortOrder: number;

  @Column("tinyint", {
    name: "status",
    comment: "1=启用, 0=停用",
    default: () => "'1'",
  })
  status: number;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
