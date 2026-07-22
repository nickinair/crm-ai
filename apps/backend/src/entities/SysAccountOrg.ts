import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_org_id", ["orgId"], {})
@Index("uk_account_org", ["accountId", "orgId"], { unique: true })
@Entity("sys_account_org", { schema: "crm_sales" })
export class SysAccountOrg {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", { name: "account_id", comment: "账号ID", unsigned: true })
  accountId: string;

  @Column("bigint", { name: "org_id", comment: "组织ID", unsigned: true })
  orgId: string;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
