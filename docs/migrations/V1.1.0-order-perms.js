/**
 * 订单权限细分：新增 order:create / order:void 两个权限码（幂等）
 *
 * 背景：订单模块此前只有模块级 `order` 一个码，无法配置
 * 「能看不能作废」「不允许创建」等差异化角色。
 * 权限配置抽屉为数据驱动，插表后自动出现在配置界面。
 *
 * 用法：
 *   DB_HOST=x DB_PORT=3306 DB_USERNAME=x DB_PASSWORD=x DB_DATABASE=crm_test \
 *     node docs/migrations/V1.1.0-order-perms.js
 */
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, charset: 'utf8mb4',
  });
  console.log(`目标库：${process.env.DB_HOST}/${process.env.DB_DATABASE}`);

  const [[parent]] = await conn.query("SELECT id FROM sys_permission WHERE perm_code = 'order'");
  if (!parent) { console.error('未找到模块权限 order，中止'); process.exit(1); }

  const items = [
    ['order:create', '创建订单', 1],
    ['order:void', '作废订单', 2],
  ];
  for (const [code, name, sort] of items) {
    const [r] = await conn.query('SELECT id FROM sys_permission WHERE perm_code = ?', [code]);
    if (r.length) { console.log(`  ⏭  ${code} 已存在`); continue; }
    await conn.query(
      'INSERT INTO sys_permission (parent_id, perm_name, perm_code, perm_type, sort_order, status) VALUES (?, ?, ?, 2, ?, 1)',
      [parent.id, name, code, sort]);
    console.log(`  ✅ 已创建 ${code}（${name}）`);
  }
  const [rows] = await conn.query("SELECT perm_code, perm_name FROM sys_permission WHERE perm_code LIKE 'order%' ORDER BY perm_code");
  console.log('订单权限现状:', rows.map(r => r.perm_code).join(', '));
  await conn.end();
  console.log('完成');
})().catch(e => { console.error('失败：', e.message); process.exit(1); });
