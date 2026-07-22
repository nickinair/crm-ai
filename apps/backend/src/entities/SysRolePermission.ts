import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_permission_id", ["permissionId"], {})
@Index("uk_role_perm", ["roleId", "permissionId"], { unique: true })
@Entity("sys_role_permission", { schema: "crm_sales" })
export class SysRolePermission {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", { name: "role_id", comment: "角色ID", unsigned: true })
  roleId: string;

  @Column("bigint", {
    name: "permission_id",
    comment: "权限ID",
    unsigned: true,
  })
  permissionId: string;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
