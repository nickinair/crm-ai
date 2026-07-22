import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_account_id", ["accountId"], {})
@Index("uk_cust_account", ["customerId", "accountId"], { unique: true })
@Entity("biz_private_relation", { schema: "crm_sales" })
export class BizPrivateRelation {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", { name: "customer_id", comment: "客户ID", unsigned: true })
  customerId: string;

  @Column("bigint", {
    name: "account_id",
    comment: "关联销售ID",
    unsigned: true,
  })
  accountId: string;

  @Column("datetime", {
    name: "first_bindtime",
    nullable: true,
    comment: "首次关联时间",
  })
  firstBindtime: Date | null;

  @Column("tinyint", {
    name: "status",
    comment: "1=有效, 0=已解除",
    default: () => "'1'",
  })
  status: number;

  @Column("tinyint", {
    name: "is_wechat_added",
    comment: "是否已加微信 0=否,1=是",
    default: () => "'0'",
  })
  isWechatAdded: number;

  @Column("varchar", {
    name: "sales_remark",
    nullable: true,
    comment: "销售备注信息",
    length: 512,
  })
  salesRemark: string | null;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @Column("datetime", { name: "updated_at", nullable: true })
  updatedAt: Date | null;
}
