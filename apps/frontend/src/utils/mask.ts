/**
 * 隐私数据打码工具
 * 仅在销售角色下生效
 */

/** 判断当前用户是否为销售角色 */
export function isSalesRole(): boolean {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    const user = JSON.parse(userStr);
    return user.roleCode === 'sales';
  } catch {
    return false;
  }
}

/** 手机号打码：中间四位用 * 替换，如 138****0001 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  if (!isSalesRole()) return phone;
  if (phone.length >= 7) {
    return phone.substring(0, 3) + '****' + phone.substring(7);
  }
  return phone;
}

/** 身份证打码：第7~14位用 * 替换，如 420102********1234 */
export function maskIdCard(idCard: string | null | undefined): string {
  if (!idCard) return '-';
  if (!isSalesRole()) return idCard;
  if (idCard.length >= 14) {
    return idCard.substring(0, 6) + '********' + idCard.substring(14);
  }
  return idCard;
}
