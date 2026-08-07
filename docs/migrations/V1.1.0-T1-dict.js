#!/usr/bin/env node
/**
 * CRM V1.1.0 — T1 数据字典扩充（幂等，可重复执行）
 *
 * 对应 PRD 4.7：
 *   订单相关：下单平台（已存在，跳过）、营销活动名称
 *   车辆相关：品牌、车型、款式
 *   商品相关：适用车型、安装属性、商品属性（按商品类型联动）
 *   其他：战败线索冷却期（单位：天，单值配置）
 *
 * 用法（不在脚本内硬编码任何密码）：
 *   DB_HOST=x DB_PORT=3306 DB_USERNAME=x DB_PASSWORD=x DB_DATABASE=crm_test \
 *     node docs/migrations/V1.1.0-T1-dict.js [--dry-run]
 *
 * 说明：车辆品牌/车型/款式的初始选项从现有 biz_vehicle 真实数据中提取（避免凭空造数），
 *      不足部分由业务后续在字典维护页补充。
 */
const mysql = require('mysql2/promise');

const DRY_RUN = process.argv.includes('--dry-run');

// 字典类型定义：[typeCode, typeName, remark]
const TYPES = [
  ['marketing_activity', '营销活动名称', '订单-营销活动'],
  ['vehicle_brand', '车辆品牌', '车辆-品牌'],
  ['vehicle_model', '车辆车型', '车辆-车型'],
  ['vehicle_style', '车辆款式', '车辆-款式'],
  ['product_applicable_model', '适用车型', '商品-适用车型'],
  ['product_install_attribute', '安装属性', '商品-安装属性'],
  ['product_attribute', '商品属性', '商品-商品属性（选项随商品类型联动，parent_value=商品类型）'],
  ['defeat_cooldown_days', '战败线索冷却期', '单位：天；仅一条有效配置，item_value 为天数'],
];

// 固定字典项：typeCode -> [[label, value, sort, parentValue|null], ...]
const ITEMS = {
  // PRD 4.7 表格：商品属性按商品类型取不同选项
  product_attribute: [
    ['交付之日起90天内', '交付之日起90天内', 1, '整车延保'],
    ['交付之日起91天~45个月', '交付之日起91天~45个月', 2, '整车延保'],
    ['交付之日起45个月且行驶里程9.5万公里内', '交付之日起45个月且行驶里程9.5万公里内', 1, '电池延保'],
    ['交付之日起24个月内且行驶里程4万公里', '交付之日起24个月内且行驶里程4万公里', 2, '电池延保'],
  ],
  product_install_attribute: [
    ['需安装', '需安装', 1, null],
    ['无需安装', '无需安装', 2, null],
  ],
  // 冷却期默认 30 天，业务可在字典维护页调整
  defeat_cooldown_days: [
    ['战败线索冷却期(天)', '30', 1, null],
  ],
};

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

  let addedTypes = 0, addedItems = 0, skipped = 0;

  // 1. 字典类型
  const typeIdOf = {};
  for (const [code, name, remark] of TYPES) {
    const [r] = await conn.query('SELECT id FROM sys_dict_type WHERE dict_type_code=?', [code]);
    if (r.length) {
      typeIdOf[code] = r[0].id;
      console.log(`  ⏭  字典类型 ${code} 已存在`);
      skipped++;
      continue;
    }
    if (DRY_RUN) { console.log(`  [将新增] 字典类型 ${code} ${name}`); addedTypes++; continue; }
    const [ins] = await conn.execute(
      'INSERT INTO sys_dict_type (dict_type_code, dict_type_name, status, remark) VALUES (?,?,1,?)',
      [code, name, remark]);
    typeIdOf[code] = ins.insertId;
    console.log(`  ✅ 新增字典类型 ${code} ${name}`);
    addedTypes++;
  }

  // 2. 车辆品牌/车型/款式：从真实车辆数据提取初始选项
  const vehicleSources = {
    vehicle_brand: 'brand',
    vehicle_model: 'model',
    vehicle_style: 'style',
  };
  for (const [code, column] of Object.entries(vehicleSources)) {
    const [rows] = await conn.query(
      `SELECT \`${column}\` v, COUNT(*) n FROM biz_vehicle
       WHERE \`${column}\` IS NOT NULL AND \`${column}\` <> ''
       GROUP BY \`${column}\` ORDER BY n DESC LIMIT 200`);
    ITEMS[code] = rows.map((r, i) => [String(r.v), String(r.v), i + 1, null]);
    console.log(`  ℹ  ${code} 从现有车辆数据提取到 ${rows.length} 个选项`);
  }

  // 适用车型：先放系统在用的通用口径（存量商品的真实取值），再补具体车型
  ITEMS.product_applicable_model = [
    ['通用', '通用', 1, null],
    ['专车专用', '专车专用', 2, null],
    ...(ITEMS.vehicle_model || []).map(([l, v, s]) => [l, v, s + 2, null]),
  ];

  // 3. 字典项
  for (const [code, items] of Object.entries(ITEMS)) {
    const typeId = typeIdOf[code];
    if (!typeId) {
      if (DRY_RUN) { console.log(`  [将新增] ${code} 的 ${items.length} 个字典项（类型待创建）`); addedItems += items.length; continue; }
      console.log(`  ⚠  跳过 ${code} 的字典项：类型ID未知`);
      continue;
    }
    for (const [label, value, sort, parentValue] of items) {
      const [r] = await conn.query(
        'SELECT id FROM sys_dict_item WHERE dict_type_id=? AND item_value=? AND (parent_value <=> ?)',
        [typeId, value, parentValue]);
      if (r.length) { skipped++; continue; }
      if (DRY_RUN) { addedItems++; continue; }
      await conn.execute(
        'INSERT INTO sys_dict_item (dict_type_id, parent_value, item_code, item_label, item_value, sort_order, status) VALUES (?,?,?,?,?,?,1)',
        [typeId, parentValue, value, label, value, sort]);
      addedItems++;
    }
    console.log(`  ✅ ${code}：字典项处理完成（共 ${items.length} 条）`);
  }

  console.log(`\n完成：新增类型 ${addedTypes} 个，新增字典项 ${addedItems} 条，跳过 ${skipped} 项（已存在）`);
  await conn.end();
})().catch(e => { console.error('字典初始化失败：', e.message); process.exit(1); });
