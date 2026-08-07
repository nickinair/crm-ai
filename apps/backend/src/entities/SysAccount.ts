import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("idx_status", ["status"], {})
@Index("uk_account_code", ["accountCode"], { unique: true })
@Index("uk_phone_hash", ["phoneHash"], { unique: true })
@Index("uk_username", ["username"], { unique: true })
@Entity("sys_account", { schema: "crm_sales" })
export class SysAccount {
  @PrimaryGeneratedColumn({
    type: "bigint",
    name: "id",
    comment: "账号ID",
    unsigned: true,
  })
  id: string;

  @Column("varchar", {
    name: "account_code",
    unique: true,
    comment: "账号编码 ACC_00001",
    length: 16,
  })
  accountCode: string;

  @Column("varchar", {
    name: "username",
    unique: true,
    comment: "账号（工号），英文+数字≤10位",
    length: 20,
  })
  username: string;

  @Column("varchar", {
    name: "password_hash",
    comment: "密码 bcrypt 哈希",
    length: 128,
  })
  passwordHash: string;

  @Column("varchar", { name: "real_name", comment: "员工真实姓名", length: 60 })
  realName: string;

  @Column("varchar", {
    name: "phone",
    comment: "手机号（AES加密存储）",
    length: 128,
  })
  phone: string;

  @Column("varchar", {
    name: "phone_hash",
    unique: true,
    comment: "手机号 SHA256 摘要，用于唯一校验",
    length: 64,
  })
  phoneHash: string;

  @Column("tinyint", {
    name: "status",
    comment: "1=正常, 0=禁用, 2=已离职",
    default: () => "'1'",
  })
  status: number;

  @Column("datetime", {
    name: "last_login_at",
    nullable: true,
    comment: "最后登录时间",
  })
  lastLoginAt: Date | null;

  @Column("varchar", {
    name: "callout_account",
    nullable: true,
    comment: "关联外呼账号",
    length: 30,
  })
  calloutAccount: string | null;

  @Column("varchar", {
    name: "callout_password",
    nullable: true,
    comment: "关联外呼账号密码",
    length: 50,
  })
  calloutPassword: string | null;

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
