// 全局导入任务跟踪：任务信息存 sessionStorage，页面切换/刷新后浮窗仍可继续跟踪后端进度
export interface ImportTaskInfo {
  progressId: string;
  fileName: string;
  startedAt: number;
  accountId?: string;
}

const STORAGE_KEY = 'crm-import-task';

function currentAccountId(): string {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return String(u.id || '');
  } catch {
    return '';
  }
}
let importModalVisible = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

export function subscribeImportTask(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getImportTask(): ImportTaskInfo | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const task: ImportTaskInfo = JSON.parse(raw);
    // 任务按账号隔离：换账号登录后，上一账号的任务记录自动失效
    if (task.accountId && task.accountId !== currentAccountId()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return task;
  } catch {
    return null;
  }
}

export function startImportTask(task: ImportTaskInfo) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...task, accountId: currentAccountId() }));
  notify();
}

export function clearImportTask() {
  sessionStorage.removeItem(STORAGE_KEY);
  notify();
}

// 导入弹窗打开时浮窗隐藏，避免双重展示
export function setImportModalVisible(visible: boolean) {
  importModalVisible = visible;
  notify();
}

export function getImportModalVisible() {
  return importModalVisible;
}

let _expandModalFn: (() => void) | null = null;
export function registerExpandModal(fn: () => void) {
  _expandModalFn = fn;
}
export function triggerExpandModal() {
  if (_expandModalFn) _expandModalFn();
}
