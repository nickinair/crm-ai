import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_customer_name", ["customerName"], {})
@Index("idx_status", ["status"], {})
@Index("uk_id_card_hash", ["idCardHash"], { unique: true })
@Index("uk_phone_hash", ["phoneHash"], { unique: true })
@Entity("biz_customer", { schema: "crm_sales" })
export class BizCustomer {
  @PrimaryGeneratedColumn({
    type: "bigint",
    name: "id",
    comment: "客户ID",
    unsigned: true,
  })
  id: string;

  @Column("varchar", { name: "customer_name", comment: "客户姓名", length: 60 })
  customerName: string;

  @Column("varchar", {
    name: "id_card_no",
    nullable: true,
    comment: "身份证号（AES加密存储）",
    length: 128,
  })
  idCardNo: string | null;

  @Column("varchar", {
    name: "id_card_hash",
    nullable: true,
    unique: true,
    comment: "身份证号 SHA256 摘要",
    length: 64,
  })
  idCardHash: string | null;

  @Column("varchar", {
    name: "phone",
    comment: "电话号码（AES加密存储）",
    length: 128,
  })
  phone: string;

  @Column("varchar", {
    name: "phone_hash",
    unique: true,
    comment: "电话号码 SHA256 摘要",
    length: 64,
  })
  phoneHash: string;

  @Column("tinyint", {
    name: "gender",
    nullable: true,
    comment: "0=未知, 1=男, 2=女",
    default: () => "'0'",
  })
  gender: number | null;

  @Column("date", { name: "birthday", nullable: true, comment: "生日" })
  birthday: string | null;

  @Column("varchar", {
    name: "customer_tags",
    nullable: true,
    comment: "客户标签（JSON）",
    length: 512,
  })
  customerTags: string | null;

  @Column("varchar", {
    name: "customer_source",
    nullable: true,
    comment: "客户来源",
    length: 32,
  })
  customerSource: string | null;

  @Column("tinyint", {
    name: "status",
    comment: "1=正常, 0=冻结",
    default: () => "'1'",
  })
  status: number;

  @Column("text", { name: "remark", nullable: true, comment: "备注" })
  remark: string | null;

  @Column("varchar", {
    name: "wechat_status",
    nullable: true,
    comment: "微信状态",
    length: 32,
    default: () => "'未添加'",
  })
  wechatStatus: string | null;

  @Column("datetime", {
    name: "created_at",
    default: () => "CURRENT_TIMESTAMP",
  })
  createdAt: Date;

  @Column("datetime", { name: "updated_at", nullable: true })
  updatedAt: Date | null;
}
