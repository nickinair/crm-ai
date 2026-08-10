import { isOptInPerm } from './optInPerms';
// 细粒度权限判断：管理员放行，其余按权限码匹配
export function hasPerm(...codes: string[]): boolean {
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : {};
  const roleCode = user.roleCode || '';
  const permissions: string[] = user.permissions || [];
  // 显式授权制权限（如配置管理）：超管也不自动放行，必须显式持有
  if (codes.every(isOptInPerm)) {
    return codes.some(code => permissions.includes(code));
  }
  if (roleCode === 'super_admin' || roleCode === 'super__admin' || roleCode === 'admin') {
    return true;
  }
  return codes.some(code => permissions.includes(code));
}
