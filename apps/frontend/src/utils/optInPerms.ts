/**
 * 「显式授权制」权限：不随超级管理员身份自动放行，必须在权限列表中显式存在。
 * 与后端 jwt-auth.guard.ts 的 OPT_IN_PERMISSIONS 保持一致。
 * 目前仅 config（配置管理/数据字典维护）——由「配置管理员」角色单独授予。
 */
export const OPT_IN_PERMISSIONS = ['config'];

/** 该权限码是否为显式授权制（超管也不自动拥有） */
export const isOptInPerm = (code: string) => OPT_IN_PERMISSIONS.includes(code);
