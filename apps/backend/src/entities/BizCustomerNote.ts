import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_created_by", ["createdBy"], {})
@Index("idx_customer_id", ["customerId"], {})
@Entity("biz_customer_note", { schema: "crm_sales" })
export class BizCustomerNote {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id", unsigned: true })
  id: string;

  @Column("bigint", { name: "customer_id", comment: "客户ID", unsigned: true })
  customerId: string;

  @Column("text", { name: "note_content", comment: "备注内容" })
  noteContent: string;

  @Column("bigint", { name: "created_by", comment: "创建人ID", unsigned: true })
  createdBy: string;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;
}
