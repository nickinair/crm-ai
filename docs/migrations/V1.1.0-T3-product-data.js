#!/usr/bin/env node
/**
 * CRM V1.1.0 — T3 商品历史数据迁移（幂等）
 *
 * 背景：V1.0.0 把「适用车型 / 安装属性」存在 biz_product.spec_params 这个 JSON 列里；
 *      V1.1.0 起改为独立字段（applicable_model / install_attribute，字典驱动）。
 *      本脚本把存量数据搬到新列，避免商品列表这两列显示为空。
 *
 * 用法：
 *   DB_HOST=x DB_PORT=3306 DB_USERNAME=x DB_PASSWORD=x DB_DATABASE=crm_test \
 *     node docs/migrations/V1.1.0-T3-product-data.js [--dry-run]
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

  const [rows] = await conn.query(
    `SELECT id, product_code, spec_params, applicable_model, install_attribute
     FROM biz_product WHERE spec_params IS NOT NULL`);

  let migrated = 0, skipped = 0;
  for (const r of rows) {
    let spec = r.spec_params;
    if (typeof spec === 'string') {
      try { spec = JSON.parse(spec); } catch { spec = null; }
    }
    if (!spec) { skipped++; continue; }

    const model = spec.applicableModel ?? null;
    const install = spec.installAttr ?? spec.installAttribute ?? null;

    // 已有新值则不覆盖（幂等：重复执行不会把手工改过的数据冲掉）
    const setModel = !r.applicable_model && model ? model : null;
    const setInstall = !r.install_attribute && install ? install : null;
    if (!setModel && !setInstall) { skipped++; continue; }

    if (DRY_RUN) {
      console.log(`  [将迁移] ${r.product_code}: 适用车型=${setModel ?? '(不变)'} 安装属性=${setInstall ?? '(不变)'}`);
      migrated++;
      continue;
    }
    const sets = [], params = [];
    if (setModel) { sets.push('applicable_model=?'); params.push(setModel); }
    if (setInstall) { sets.push('install_attribute=?'); params.push(setInstall); }
    params.push(r.id);
    await conn.execute(`UPDATE biz_product SET ${sets.join(', ')} WHERE id=?`, params);
    migrated++;
  }

  console.log(`\n完成：迁移 ${migrated} 条，跳过 ${skipped} 条（无数据或已有值）`);
  await conn.end();
})().catch(e => { console.error('迁移失败：', e.message); process.exit(1); });
