#!/usr/bin/env node
/**
 * 配置管理功能 —— 生产环境最小迁移（幂等，可重复执行）
 *
 * 仅包含「配置管理」这一个功能所需的两项变更，不含 V1.1.0 其余内容：
 *   1. sys_dict_item 增加 parent_value 列（可空，纯新增；V1.0.0 既有代码不感知）
 *   2. 新增 config 菜单权限（配置管理页）
 *
 * ⚠️ 必须先执行本脚本，再部署后端代码。
 *    新版实体带 parentValue 字段，若列不存在，现有 /api/dict/* 接口会 500，
 *    导致全系统下拉菜单不可用。
 *
 * 用法：
 *   DB_HOST=x DB_PORT=x DB_USERNAME=x DB_PASSWORD=x DB_DATABASE=crm_sales \
 *     node docs/migrations/V1.1.0-dict-only-prod.js [--dry-run]
 */
const mysql = require('mysql2/promise');
const DRY_RUN = process.argv.includes('--dry-run');

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

  // ---- 1. sys_dict_item.parent_value ----
  const [col] = await conn.query(
    `SELECT COUNT(*) n FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'sys_dict_item' AND column_name = 'parent_value'`,
    [cfg.database]);
  if (col[0].n > 0) {
    console.log('  ⏭  sys_dict_item.parent_value 已存在');
  } else if (DRY_RUN) {
    console.log('  [将执行] sys_dict_item 增加列 parent_value');
  } else {
    await conn.query(
      `ALTER TABLE sys_dict_item
       ADD COLUMN parent_value VARCHAR(64) NULL
       COMMENT '父级字典项值，用于联动字典（如商品属性按商品类型分组）' AFTER dict_type_id`);
    console.log('  ✅ sys_dict_item 增加列 parent_value');
  }

  // ---- 2. config 权限 ----
  const [perm] = await conn.query("SELECT id FROM sys_permission WHERE perm_code = 'config'");
  if (perm.length) {
    console.log('  ⏭  权限 config 已存在');
  } else if (DRY_RUN) {
    console.log('  [将执行] 新增权限 config（配置管理）');
  } else {
    const [maxRow] = await conn.query(
      'SELECT IFNULL(MAX(sort_order), 0) AS m FROM sys_permission WHERE parent_id IS NULL');
    const sortOrder = Number(maxRow[0].m) + 1;
    await conn.execute(
      `INSERT INTO sys_permission (parent_id, perm_name, perm_code, perm_type, path, icon, sort_order, status)
       VALUES (NULL, '配置管理', 'config', 1, '/config', 'Setting', ?, 1)`,
      [sortOrder]);
    console.log(`  ✅ 新增权限 config（配置管理），排序 ${sortOrder}`);
  }

  // ---- 核对 ----
  if (!DRY_RUN) {
    const [c] = await conn.query(
      `SELECT COUNT(*) n FROM information_schema.columns
       WHERE table_schema = ? AND table_name = 'sys_dict_item' AND column_name = 'parent_value'`, [cfg.database]);
    const [p] = await conn.query("SELECT COUNT(*) n FROM sys_permission WHERE perm_code = 'config'");
    const [d] = await conn.query('SELECT COUNT(*) n FROM sys_dict_item');
    console.log(`\n核对：parent_value 列 ${c[0].n ? '✅' : '❌'}｜config 权限 ${p[0].n ? '✅' : '❌'}｜字典项总数 ${d[0].n}（应与迁移前一致）`);
  }
  await conn.end();
  console.log('完成');
})().catch(e => { console.error('迁移失败：', e.message); process.exit(1); });
