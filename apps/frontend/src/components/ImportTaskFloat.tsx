import React, { useEffect, useState } from 'react';
import { Progress } from 'antd';
import { CloseOutlined, FullscreenOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import request from '../utils/request';
import { hasPerm } from '../utils/perm';
import { getImportTask, startImportTask, clearImportTask, subscribeImportTask, getImportModalVisible, triggerExpandModal } from '../utils/importTask';

// 右上角导入任务浮窗：导入弹窗关闭后接管进度展示，跨页面/刷新持续跟踪
const ImportTaskFloat: React.FC = () => {
  const navigate = useNavigate();
  const [task, setTask] = useState(getImportTask());
  const [modalVisible, setModalVisible] = useState(getImportModalVisible());
  const [progress, setProgress] = useState<any>(null);

  useEffect(() => subscribeImportTask(() => {
    setTask(getImportTask());
    setModalVisible(getImportModalVisible());
  }), []);

  // 兜底发现：本地没有任务记录时，主动向后端询问是否有进行中的导入
  // （覆盖旧版页面发起、换标签页/换浏览器等场景），仅对有线索管理权限的用户生效
  useEffect(() => {
    if (!hasPerm('lead')) return;
    let cancelled = false;
    const discover = async () => {
      if (getImportTask()) return;
      try {
        const res: any = await request.get('/lead/import-active');
        if (!cancelled && res && res.progressId) {
          startImportTask({
            progressId: res.progressId,
            fileName: res.fileName || '导入任务',
            startedAt: res.startedAt || Date.now(),
          });
        }
      } catch { /* 忽略，下次再试 */ }
    };
    discover();
    const timer = setInterval(discover, 30000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!task) { setProgress(null); return; }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const p: any = await request.get(`/lead/import-progress/${task.progressId}`);
        if (stopped) return;
        if (p && p.phase && p.phase !== 'unknown') {
          setProgress(p);
          if (p.phase === 'done' || p.phase === 'error') return; // 终态停止轮询
        } else {
          // 服务端无此任务（已清理或服务重启），停止跟踪
          clearImportTask();
          return;
        }
        timer = setTimeout(tick, 2000);
      } catch {
        if (!stopped) timer = setTimeout(tick, 3000);
      }
    };
    timer = setTimeout(tick, 300);
    return () => { stopped = true; clearTimeout(timer); };
  }, [task?.progressId]);

  if (!task || modalVisible) return null;

  const p = progress;
  const fmtDur = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return '--';
    const s = Math.round(sec);
    if (s >= 3600) return `${Math.floor(s / 3600)}小时${Math.floor((s % 3600) / 60)}分`;
    if (s >= 60) return `${Math.floor(s / 60)}分${s % 60}秒`;
    return `${s}秒`;
  };
  // 校验占 30%、写库占 70%；用浮点比例估算，整数取整会让大文件前期恒为 0 导致预估失真
  let frac = 0;
  let stageText = '正在解析文件…';
  let elapsedSec = (Date.now() - task.startedAt) / 1000;
  let remainSec = 0;
  let etaReady = false;
  if (p) {
    elapsedSec = ((p.finishedAt || Date.now()) - (p.startedAt || task.startedAt)) / 1000;
    if (p.phase === 'done') { frac = 1; stageText = '导入完成'; }
    else if (p.phase === 'error') { stageText = `导入失败：${p.message || ''}`; }
    else if (p.stage === 'validate' && p.stageTotal > 0) {
      frac = (p.stageProcessed / p.stageTotal) * 0.3;
      stageText = `校验中 ${p.stageProcessed}/${p.stageTotal} 行`;
    } else if (p.stage === 'insert' && p.stageTotal > 0) {
      frac = 0.3 + (p.stageProcessed / p.stageTotal) * 0.7;
      stageText = `写入中 ${p.stageProcessed}/${p.stageTotal} 条`;
    }
    etaReady = p.stageProcessed >= 50 && frac > 0 && frac < 1 && elapsedSec > 3;
    if (etaReady) remainSec = elapsedSec * (1 - frac) / frac;
  }
  const percent = Math.floor(frac * 100);
  const isFinal = p && (p.phase === 'done' || p.phase === 'error');

  const handleExpand = () => {
    navigate('/leads');
    // slight delay to allow navigation to mount Leads page if not already there
    setTimeout(() => {
      triggerExpandModal();
    }, 100);
  };

  return (
    <div 
      style={{
        position: 'fixed', top: '76px', right: '24px', width: '300px', zIndex: 1100,
        background: '#1E293B', border: '1px solid #334155', borderRadius: '12px',
        padding: '14px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        cursor: 'pointer'
      }}
      onClick={handleExpand}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ color: '#E2E8F0', fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '230px' }}>
          批量导入：{task.fileName}
        </span>
        <div style={{ display: 'flex', gap: '10px' }}>
          <FullscreenOutlined 
            style={{ color: '#94A3B8', fontSize: '12px', cursor: 'pointer' }}
            title="放大查看详细进度"
          />
          <CloseOutlined
            style={{ color: '#94A3B8', fontSize: '12px', cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              clearImportTask();
            }}
          />
        </div>
      </div>
      <div style={{ color: p && p.phase === 'error' ? '#F87171' : '#94A3B8', fontSize: '12px', marginBottom: '2px' }}>{stageText}</div>
      <Progress
        percent={percent}
        size="small"
        status={p && p.phase === 'error' ? 'exception' : p && p.phase === 'done' ? 'success' : 'active'}
        strokeColor={p && p.phase === 'error' ? undefined : '#38BDF8'}
        trailColor="rgba(255, 255, 255, 0.15)"
        format={(pct) => <span style={{ color: '#CBD5E1' }}>{pct}%</span>}
      />
      {p && p.phase === 'processing' && (
        <div style={{ color: '#64748B', fontSize: '12px', marginTop: '2px' }}>
          成功 {p.successCount || 0} · 失败 {p.failCount || 0} · 冲突 {p.warnCount || 0}
          <br />已用时 {fmtDur(elapsedSec)}{etaReady
            ? ` · 预计剩余 ${fmtDur(remainSec)} · 预计总耗时 ${fmtDur(elapsedSec + remainSec)}`
            : ' · 预计剩余 计算中…'}
        </div>
      )}
      {isFinal && p.phase === 'done' && (
        <div style={{ color: '#64748B', fontSize: '12px', marginTop: '2px' }}>
          成功 {p.successCount || 0} · 失败 {p.failCount || 0} · 冲突 {p.warnCount || 0} · 用时 {fmtDur(elapsedSec)}
        </div>
      )}
    </div>
  );
};

export default ImportTaskFloat;
