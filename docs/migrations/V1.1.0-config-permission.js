#!/usr/bin/env node
/**
 * CRM V1.1.0 — 新增「配置管理」菜单权限（幂等，可重复执行）
 *
 * 配置管理页用于维护数据字典（如战败线索冷却期天数、渠道来源、下单平台等）。
 * 权限编码 config，超级管理员自动拥有全部权限，其他角色需在权限配置中勾选。
 *
 * 用法：
 *   DB_HOST=x DB_PORT=3306 DB_USERNAME=x DB_PASSWORD=x DB_DATABASE=crm_test \
 *     node docs/migrations/V1.1.0-config-permission.js [--dry-run]
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

  const [exist] = await conn.query("SELECT id FROM sys_permission WHERE perm_code = 'config'");
  if (exist.length) {
    console.log('  ⏭  权限 config 已存在，跳过');
  } else if (DRY_RUN) {
    console.log('  [将新增] 权限 config（配置管理）');
  } else {
    // 排序号取当前最大值 +1，排在菜单末尾
    const [maxRow] = await conn.query('SELECT IFNULL(MAX(sort_order), 0) AS m FROM sys_permission WHERE parent_id IS NULL');
    const sortOrder = Number(maxRow[0].m) + 1;
    await conn.execute(
      `INSERT INTO sys_permission (parent_id, perm_name, perm_code, perm_type, path, icon, sort_order, status)
       VALUES (NULL, '配置管理', 'config', 1, '/config', 'Setting', ?, 1)`,
      [sortOrder],
    );
    console.log(`  ✅ 新增权限 config（配置管理），排序 ${sortOrder}`);
  }

  const [all] = await conn.query("SELECT id, perm_name, perm_code, path FROM sys_permission WHERE perm_code = 'config'");
  console.log('\n当前配置管理权限：', all);
  await conn.end();
  console.log('完成');
})().catch(e => { console.error('失败：', e.message); process.exit(1); });
