// 细粒度权限判断：管理员放行，其余按权限码匹配
export function hasPerm(...codes: string[]): boolean {
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : {};
  const roleCode = user.roleCode || '';
  if (roleCode === 'super_admin' || roleCode === 'super__admin' || roleCode === 'admin') {
    return true;
  }
  const permissions: string[] = user.permissions || [];
  return codes.some(code => permissions.includes(code));
}
