import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_role_id", ["roleId"], {})
@Index("uk_account_role", ["accountId", "roleId"], { unique: true })
@Entity("sys_account_role", { schema: "crm_sales" })
export class SysAccountRole {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", { name: "account_id", comment: "账号ID", unsigned: true })
  accountId: string;

  @Column("bigint", { name: "role_id", comment: "角色ID", unsigned: true })
  roleId: string;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
