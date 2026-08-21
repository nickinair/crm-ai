/**
 * 最近使用的客户（浏览器本地，按登录账号隔离）
 *
 * 创建订单等流程中新增或选择过的客户会被记录，
 * 客户选择框未输入搜索词时默认展示这份列表。
 * 最多保留 10 个，最近使用排最前，满员后滚动覆盖最旧的。
 */
export interface RecentCustomer {
  id: string;
  customerName: string;
  phone: string;
}

const MAX_RECENT = 10;

function storageKey(): string {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return `crm-recent-customers-${u.id || 'anon'}`;
  } catch {
    return 'crm-recent-customers-anon';
  }
}

export function getRecentCustomers(): RecentCustomer[] {
  try {
    const list = JSON.parse(localStorage.getItem(storageKey()) || '[]');
    return Array.isArray(list) ? list.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function addRecentCustomer(c: RecentCustomer): void {
  if (!c?.id) return;
  try {
    const list = getRecentCustomers().filter(x => String(x.id) !== String(c.id));
    list.unshift({ id: String(c.id), customerName: c.customerName || '', phone: c.phone || '' });
    localStorage.setItem(storageKey(), JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* 本地存储不可用时静默降级 */
  }
}
