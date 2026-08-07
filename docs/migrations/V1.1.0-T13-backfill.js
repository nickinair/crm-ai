#!/usr/bin/env node
/**
 * CRM V1.1.0 — T13 历史数据刷数（幂等，可重复执行）
 *
 * 对应 PRD 4.3.1「历史数据处理」：
 *   1. 线索创建类型：无关联父线索 → 普通新建(1)；有父线索 → 战败线索复活(2)
 *   2. 线索状态 = 战败已领取(旧状态7) → 恢复为已战败(4)，分配管控标识 = 战败已复活(2)
 *   3. 分配管控标识：执行一次冷却期定时任务逻辑（对已战败无标识的按冷却期规则补打标识）
 *
 * 用法：
 *   DB_HOST=x DB_PORT=3306 DB_USERNAME=x DB_PASSWORD=x DB_DATABASE=crm_test \
 *     node docs/migrations/V1.1.0-T13-backfill.js [--dry-run]
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

  const count = async (sql, params = []) => (await conn.query(sql, params))[0][0].n;
  const exec = async (label, sql, params = []) => {
    if (DRY_RUN) { console.log(`  [将执行] ${label}`); return; }
    const [r] = await conn.query(sql, params);
    console.log(`  ✅ ${label}：影响 ${r.affectedRows} 行`);
  };

  // ---- 现状盘点 ----
  console.log('现状：');
  console.log('  状态7(战败已领取) 线索:', await count('SELECT COUNT(*) n FROM biz_lead WHERE lead_status = 7'));
  console.log('  有父线索但创建类型≠2 :', await count('SELECT COUNT(*) n FROM biz_lead WHERE parent_lead_id IS NOT NULL AND create_type != 2'));
  console.log('  无父线索但创建类型≠1 :', await count('SELECT COUNT(*) n FROM biz_lead WHERE parent_lead_id IS NULL AND create_type != 1'));
  console.log('');

  // 1. 线索创建类型刷数
  await exec('创建类型：有父线索 → 战败线索复活(2)',
    'UPDATE biz_lead SET create_type = 2 WHERE parent_lead_id IS NOT NULL AND create_type != 2');
  await exec('创建类型：无父线索 → 普通新建(1)',
    'UPDATE biz_lead SET create_type = 1 WHERE parent_lead_id IS NULL AND create_type != 1');

  // 2. 旧状态7 → 已战败(4) + 管控标识=战败已复活(2)
  await exec('状态7 → 已战败 + 战败已复活标识',
    'UPDATE biz_lead SET lead_status = 4, assign_control = 2 WHERE lead_status = 7');

  // 3. 冷却期标识补打（与后端定时任务同一逻辑；冷却天数取字典，默认30）
  let cooldownDays = 30;
  try {
    const [rows] = await conn.query(
      `SELECT i.item_value FROM sys_dict_item i
       JOIN sys_dict_type t ON t.id = i.dict_type_id
       WHERE t.dict_type_code = 'defeat_cooldown_days' AND i.status = 1
       ORDER BY i.sort_order LIMIT 1`);
    if (rows.length && !Number.isNaN(Number(rows[0].item_value))) cooldownDays = Number(rows[0].item_value);
  } catch { /* 默认值 */ }
  console.log(`  冷却天数：${cooldownDays} 天`);
  // 业务规则（已确认）：战败线索先冻结，满冷却天数后解冻
  await exec('冷却期标识：战败未满冷却天数的补打「战败冷却期」（冻结中）',
    `UPDATE biz_lead SET assign_control = 1
     WHERE lead_status = 4 AND assign_control IS NULL
       AND DATE_ADD(DATE(IFNULL(updated_at, created_at)), INTERVAL ? DAY) >= CURDATE()`, [cooldownDays]);

  // ---- 结果核对 ----
  if (!DRY_RUN) {
    console.log('\n刷数后：');
    console.log('  状态7 线索:', await count('SELECT COUNT(*) n FROM biz_lead WHERE lead_status = 7'), '（应为0）');
    console.log('  战败已复活(管控2):', await count('SELECT COUNT(*) n FROM biz_lead WHERE assign_control = 2'));
    console.log('  战败冷却期(管控1):', await count('SELECT COUNT(*) n FROM biz_lead WHERE assign_control = 1'));
    console.log('  战败线索复活(类型2):', await count('SELECT COUNT(*) n FROM biz_lead WHERE create_type = 2'));
  }
  await conn.end();
  console.log('\n完成');
})().catch(e => { console.error('刷数失败：', e.message); process.exit(1); });
