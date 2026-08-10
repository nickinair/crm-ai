#!/usr/bin/env node
/**
 * 新建「配置管理员」角色并授予指定账号（幂等，可重复执行）
 *
 * 背景：配置管理（数据字典维护）希望由专人负责。超管权限保持不变，
 *      额外叠加一个只含 config 权限的角色，需要时按角色增减人即可，无需改代码。
 *
 * 用法：
 *   DB_HOST=x DB_PORT=x DB_USERNAME=x DB_PASSWORD=x DB_DATABASE=crm_sales \
 *     node docs/migrations/V1.1.0-config-admin-role.js [--dry-run] [--users=wuxia,zhs]
 *
 *   --users 不传时默认授予 wuxia。
 */
const mysql = require('mysql2/promise');
const DRY_RUN = process.argv.includes('--dry-run');
const usersArg = process.argv.find(a => a.startsWith('--users='));
const TARGET_USERS = usersArg ? usersArg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean) : ['wuxia'];

const ROLE_CODE = 'config_admin';
const ROLE_NAME = '配置管理员';
const PERM_CODE = 'config';

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
  console.log(`目标库：${cfg.host}:${cfg.port}/${cfg.database}${DRY_RUN ? '  [DRY RUN]' : ''}`);
  console.log(`授予账号：${TARGET_USERS.join('、')}\n`);
  const conn = await mysql.createConnection(cfg);

  // ---- 前置：config 权限必须已存在 ----
  const [perm] = await conn.query('SELECT id FROM sys_permission WHERE perm_code = ?', [PERM_CODE]);
  if (!perm.length) {
    console.error(`❌ 权限 ${PERM_CODE} 不存在，请先执行 V1.1.0-dict-only-prod.js`);
    process.exit(1);
  }
  const permId = perm[0].id;

  // ---- 1. 角色 ----
  let roleId;
  const [role] = await conn.query('SELECT id FROM sys_role WHERE role_code = ?', [ROLE_CODE]);
  if (role.length) {
    roleId = role[0].id;
    console.log(`  ⏭  角色 ${ROLE_NAME}(${ROLE_CODE}) 已存在，id=${roleId}`);
  } else if (DRY_RUN) {
    console.log(`  [将新增] 角色 ${ROLE_NAME}(${ROLE_CODE})`);
  } else {
    const [ins] = await conn.execute(
      'INSERT INTO sys_role (role_name, role_code, status, remark) VALUES (?, ?, 1, ?)',
      [ROLE_NAME, ROLE_CODE, '仅用于维护数据字典（配置管理页），可叠加在其他角色之上'],
    );
    roleId = ins.insertId;
    console.log(`  ✅ 新增角色 ${ROLE_NAME}(${ROLE_CODE})，id=${roleId}`);
  }

  // ---- 2. 角色-权限：只绑定 config ----
  if (roleId) {
    const [rp] = await conn.query(
      'SELECT id FROM sys_role_permission WHERE role_id = ? AND permission_id = ?', [roleId, permId]);
    if (rp.length) {
      console.log('  ⏭  角色已绑定 config 权限');
    } else if (DRY_RUN) {
      console.log('  [将绑定] 角色 -> config 权限');
    } else {
      await conn.execute(
        'INSERT INTO sys_role_permission (role_id, permission_id) VALUES (?, ?)', [roleId, permId]);
      console.log('  ✅ 角色绑定 config 权限');
    }
  }

  // ---- 3. 账号-角色 ----
  for (const username of TARGET_USERS) {
    const [acc] = await conn.query('SELECT id, real_name FROM sys_account WHERE username = ?', [username]);
    if (!acc.length) {
      console.log(`  ⚠  账号 ${username} 不存在，跳过`);
      continue;
    }
    const accountId = acc[0].id;
    if (!roleId) {
      console.log(`  [将授予] ${username}（${acc[0].real_name}）配置管理员角色`);
      continue;
    }
    const [ar] = await conn.query(
      'SELECT id FROM sys_account_role WHERE account_id = ? AND role_id = ?', [accountId, roleId]);
    if (ar.length) {
      console.log(`  ⏭  ${username}（${acc[0].real_name}）已拥有该角色`);
    } else if (DRY_RUN) {
      console.log(`  [将授予] ${username}（${acc[0].real_name}）配置管理员角色`);
    } else {
      await conn.execute(
        'INSERT INTO sys_account_role (account_id, role_id) VALUES (?, ?)', [accountId, roleId]);
      console.log(`  ✅ ${username}（${acc[0].real_name}）已授予配置管理员角色`);
    }
  }

  // ---- 核对 ----
  if (!DRY_RUN && roleId) {
    const [members] = await conn.query(
      `SELECT a.username, a.real_name FROM sys_account_role ar
       JOIN sys_account a ON a.id = ar.account_id WHERE ar.role_id = ?`, [roleId]);
    const [perms] = await conn.query(
      `SELECT p.perm_code FROM sys_role_permission rp
       JOIN sys_permission p ON p.id = rp.permission_id WHERE rp.role_id = ?`, [roleId]);
    console.log(`\n核对：角色权限 [${perms.map(p => p.perm_code).join(', ')}]`);
    console.log(`      角色成员 ${members.map(m => `${m.username}(${m.real_name})`).join('、') || '无'}`);
  }
  await conn.end();
  console.log('完成');
})().catch(e => { console.error('失败：', e.message); process.exit(1); });
