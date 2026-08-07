import { useEffect } from 'react';
import request from '../utils/request';

/**
 * 线索锁定（PRD 4.3.1）
 * 进入线索详情页加锁，关闭页面释放；每 60s 心跳续期（后端锁 TTL 5 分钟）。
 * 浏览器崩溃/断网/会话过期时不发释放请求，由后端 expire_at 超时自动视为解锁。
 */

/** 浏览器会话标识：会话级持久（关标签页即失效），同一会话内多页面共用 */
export const getBrowserSessionId = (): string => {
  const KEY = 'crm-session-id';
  let sid = sessionStorage.getItem(KEY);
  if (!sid) {
    sid = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(KEY, sid);
  }
  return sid;
};

const HEARTBEAT_MS = 60 * 1000;

export function useLeadLock(leadId?: string | null) {
  useEffect(() => {
    if (!leadId) return;
    const sessionId = getBrowserSessionId();
    let timer: any = null;
    let stopped = false;

    const lock = async () => {
      try { await request.post(`/lead/${leadId}/lock`, { sessionId }); } catch { /* 静默：锁失败不阻塞浏览 */ }
    };
    const unlock = () => {
      // 页面关闭时也尽力释放：keepalive fetch 带上登录态；失败由后端 TTL 兜底
      try {
        const token = localStorage.getItem('token');
        fetch(`/api/lead/${leadId}/unlock`, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ sessionId }),
        }).catch(() => {});
      } catch { /* 忽略 */ }
    };

    lock();
    timer = setInterval(() => { if (!stopped) lock(); }, HEARTBEAT_MS);
    window.addEventListener('beforeunload', unlock);

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      window.removeEventListener('beforeunload', unlock);
      unlock();
    };
  }, [leadId]);
}
