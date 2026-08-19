#!/usr/bin/env node
/**
 * CRM V1.1.0 — T2 数据库结构升级（幂等，可重复执行）
 *
 * 对应 PRD：4.2 订单 / 4.3 线索池 / 4.5 商品 / 4.6 外呼 / 4.7 数据字典
 *
 * 用法（不在脚本内硬编码任何密码）：
 *   DB_HOST=x DB_PORT=3306 DB_USERNAME=x DB_PASSWORD=x DB_DATABASE=crm_test \
 *     node docs/migrations/V1.1.0-T2-schema.js
 *   加 --dry-run 只打印将要执行的语句，不改库
 *
 * 说明：MySQL 8 不支持 ADD COLUMN IF NOT EXISTS，故通过 information_schema
 *      预检后再执行，已存在的列/索引会跳过。
 */
const mysql = require('mysql2/promise');

const DRY_RUN = process.argv.includes('--dry-run');

// ---- 新增列：[表, 列名, 列定义] ----
const COLUMNS = [
  // 1. 字典项支持父级分组（商品属性随商品类型联动，PRD 4.7）
  ['sys_dict_item', 'parent_value', "VARCHAR(64) NULL COMMENT '父级字典项值，用于联动字典（如商品属性按商品类型分组）' AFTER dict_type_id"],

  // 2. 订单主表（PRD 4.2.3 列表字段 + 4.2.3.2 提交快照）
  ['biz_order', 'platform_order_no', "VARCHAR(30) NULL COMMENT '平台订单编号' AFTER order_platform"],
  ['biz_order', 'third_order_no', "VARCHAR(30) NULL COMMENT '三方订单编号' AFTER platform_order_no"],
  ['biz_order', 'marketing_activity', "VARCHAR(64) NULL COMMENT '营销活动名称' AFTER third_order_no"],
  ['biz_order', 'void_reason', "VARCHAR(255) NULL COMMENT '作废原因' AFTER remark"],
  ['biz_order', 'vehicle_id', "BIGINT UNSIGNED NULL COMMENT '关联车辆ID'"],
  // 快照字段：订单提交时固化，后续客户/车辆变更不影响历史订单
  ['biz_order', 'snap_customer_name', "VARCHAR(64) NULL COMMENT '快照-客户姓名'"],
  ['biz_order', 'snap_customer_phone', "VARCHAR(20) NULL COMMENT '快照-客户手机号'"],
  ['biz_order', 'snap_vehicle_brand', "VARCHAR(64) NULL COMMENT '快照-车辆品牌'"],
  ['biz_order', 'snap_vehicle_model', "VARCHAR(64) NULL COMMENT '快照-车辆车型'"],
  ['biz_order', 'snap_vehicle_vin', "VARCHAR(32) NULL COMMENT '快照-车架号'"],
  ['biz_order', 'snap_lead_code', "VARCHAR(32) NULL COMMENT '快照-关联线索编码'"],
  // 审计字段（PRD 列表要求展示创建人/更新人）
  ['biz_order', 'creator_id', "BIGINT UNSIGNED NULL COMMENT '创建人账号ID'"],
  ['biz_order', 'updater_id', "BIGINT UNSIGNED NULL COMMENT '更新人账号ID'"],
  // 草稿标识：三步式创建过程中先落草稿，提交成功后转正式
  ['biz_order', 'is_draft', "TINYINT NOT NULL DEFAULT 0 COMMENT '1=草稿(未提交)，0=正式订单'"],

  // 3. 订单明细（PRD 4.2.3.2 商品快照：商品编码、商品名称、售价）
  ['biz_order_item', 'product_code', "VARCHAR(64) NULL COMMENT '快照-商品编码' AFTER product_id"],

  // 4. 商品表（PRD 4.5.1 / 4.5.3）
  ['biz_product', 'product_attribute', "VARCHAR(64) NULL COMMENT '商品属性（选项随商品类型联动，字典驱动）' AFTER product_type"],
  ['biz_product', 'applicable_model', "VARCHAR(128) NULL COMMENT '适用车型（字典驱动，非必填）'"],
  ['biz_product', 'install_attribute', "VARCHAR(64) NULL COMMENT '安装属性（字典驱动，非必填）'"],
  ['biz_product', 'product_remark', "VARCHAR(500) NULL COMMENT '商品备注'"],

  // 5. 账号外呼字段（PRD 4.6.1）
  ['sys_account', 'callout_account', "VARCHAR(30) NULL COMMENT '关联外呼账号'"],
  ['sys_account', 'callout_password', "VARCHAR(50) NULL COMMENT '关联外呼账号密码'"],

  // 6. 线索表（PRD 4.3.1）
  ['biz_lead', 'create_type', "TINYINT NOT NULL DEFAULT 1 COMMENT '线索创建类型：1=普通新建，2=战败线索复活'"],
  ['biz_lead', 'assign_control', "TINYINT NULL COMMENT '分配管控标识：1=战败冷却期，2=战败已复活；非空时不可分配/领取'"],
  ['biz_lead', 'order_situation', "TINYINT NOT NULL DEFAULT 0 COMMENT '订单情况：0=未下单,1=存在未完结订单,2=全部订单已作废,3=全部订单已完结'"],
];

// ---- 新增索引：[表, 索引名, 索引定义] ----
const INDEXES = [
  ['biz_order', 'idx_third_order_no', 'INDEX idx_third_order_no (third_order_no)'],
  ['biz_order', 'idx_is_draft', 'INDEX idx_is_draft (is_draft)'],
  ['biz_product', 'idx_product_attribute', 'INDEX idx_product_attribute (product_attribute)'],
  // 外呼账号唯一性（PRD 4.6.1）；NULL 不参与唯一约束，允许多个账号不填
  ['sys_account', 'uk_callout_account', 'UNIQUE INDEX uk_callout_account (callout_account)'],
  ['biz_lead', 'idx_create_type', 'INDEX idx_create_type (create_type)'],
  ['biz_lead', 'idx_assign_control', 'INDEX idx_assign_control (assign_control)'],
  ['biz_lead', 'idx_order_situation', 'INDEX idx_order_situation (order_situation)'],
];

// ---- 修改列定义（幂等：重复执行结果一致）----
const MODIFIES = [
  // 订单状态含义变更（PRD 4.2.2）
  ['biz_order', 'order_status',
    "ALTER TABLE biz_order MODIFY COLUMN order_status TINYINT NOT NULL DEFAULT 0 " +
    "COMMENT '0=待发送电子签,1=待签署电子签,2=待三方下单,3=待发货,4=已完结,5=已作废'"],
  // 车辆里程改为可空（测试问题16：新增车辆不填里程报 Column 'mileage' cannot be null）
  ['biz_vehicle', 'mileage',
    "ALTER TABLE biz_vehicle MODIFY COLUMN mileage INT NULL COMMENT '里程数'"],
];

// ---- 新建表 ----
const TABLES = [
  ['biz_lead_lock', `CREATE TABLE biz_lead_lock (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    lead_id      BIGINT UNSIGNED NOT NULL COMMENT '线索ID',
    lead_code    VARCHAR(32)     NOT NULL COMMENT '线索编码',
    account_id   BIGINT UNSIGNED NOT NULL COMMENT '销售账号ID',
    account_code VARCHAR(32)     NULL     COMMENT '销售编码',
    session_id   VARCHAR(64)     NOT NULL COMMENT '浏览器会话标识',
    locked_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '锁定时间',
    unlocked_at  DATETIME        NULL     COMMENT '解锁时间，为空表示锁定中',
    expire_at    DATETIME        NOT NULL COMMENT '过期时间，超时自动视为解锁',
    PRIMARY KEY (id),
    KEY idx_lead_id (lead_id),
    KEY idx_account_id (account_id),
    KEY idx_active (lead_id, unlocked_at, expire_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='线索锁定记录（销售正在查看的线索不可被重新分配）'`],
];

(async () => {
  const cfg = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  };
  if (!cfg.host || !cfg.user || !cfg.database) {
    console.error('缺少数据库连接环境变量：DB_HOST / DB_USERNAME / DB_DATABASE');
    process.exit(1);
  }
  console.log(`目标库：${cfg.host}:${cfg.port}/${cfg.database}${DRY_RUN ? '  [DRY RUN]' : ''}\n`);

  const conn = await mysql.createConnection(cfg);
  const db = cfg.database;
  let applied = 0, skipped = 0;

  const exec = async (label, sql) => {
    if (DRY_RUN) { console.log(`  [将执行] ${label}`); applied++; return; }
    await conn.query(sql);
    console.log(`  ✅ ${label}`);
    applied++;
  };

  // 建表
  for (const [table, ddl] of TABLES) {
    const [r] = await conn.query(
      'SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=? AND table_name=?', [db, table]);
    if (r[0].n > 0) { console.log(`  ⏭  表 ${table} 已存在`); skipped++; continue; }
    await exec(`建表 ${table}`, ddl);
  }

  // 加列
  for (const [table, col, def] of COLUMNS) {
    const [r] = await conn.query(
      'SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=? AND table_name=? AND column_name=?',
      [db, table, col]);
    if (r[0].n > 0) { console.log(`  ⏭  ${table}.${col} 已存在`); skipped++; continue; }
    await exec(`${table} 增加列 ${col}`, `ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`);
  }

  // 加索引
  for (const [table, idx, def] of INDEXES) {
    const [r] = await conn.query(
      'SELECT COUNT(*) n FROM information_schema.statistics WHERE table_schema=? AND table_name=? AND index_name=?',
      [db, table, idx]);
    if (r[0].n > 0) { console.log(`  ⏭  索引 ${table}.${idx} 已存在`); skipped++; continue; }
    await exec(`${table} 增加索引 ${idx}`, `ALTER TABLE \`${table}\` ADD ${def}`);
  }

  // 改列
  for (const [table, col, sql] of MODIFIES) {
    await exec(`${table} 修改列 ${col} 定义`, sql);
  }

  console.log(`\n完成：执行 ${applied} 项，跳过 ${skipped} 项（已存在）`);
  await conn.end();
})().catch(e => { console.error('迁移失败：', e.message); process.exit(1); });
