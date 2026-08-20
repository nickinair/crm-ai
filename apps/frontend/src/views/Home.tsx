import React, { useEffect, useState } from 'react';
import { Table, message } from 'antd';
import request from '../utils/request';
import './Workbench.css';

/**
 * 首页概览（PRD 4.4）
 * 核心经营指标卡片 + 销售线索分布列表
 */
const Home: React.FC = () => {
  const [metrics, setMetrics] = useState<any>({ todayNewLeads: 0, leadConversionRate: 0, answerRate: 0, monthAmount: 0 });
  const [distribution, setDistribution] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [m, d]: any[] = await Promise.all([
        request.get('/lead/home-metrics'),
        request.get('/lead/sales-distribution'),
      ]);
      if (m && !m.error) setMetrics(m);
      setDistribution(Array.isArray(d) ? d : []);
    } catch (e) {
      console.error(e);
      message.error('获取首页数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const cardStyle: React.CSSProperties = {
    background: 'rgba(30, 41, 59, 0.7)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '20px 24px',
    flex: 1,
    minWidth: 0,
  };

  /** 金额千分位展示 */
  const fmtAmount = (v: number) => `¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const metricCards = [
    { label: '今日新增线索', value: String(metrics.todayNewLeads ?? 0) },
    { label: '线索转化率', value: `${metrics.leadConversionRate ?? 0}%` },
    { label: '接通率', value: `${metrics.answerRate ?? 0}%` },
    { label: '本月成交额', value: fmtAmount(metrics.monthAmount) },
  ];

  /** 转化率标签配色：≥40% 绿、≥20% 蓝、否则橙（沿用系统标签体系） */
  const rateTag = (rate: number) => {
    const cls = rate >= 40 ? 'crm-tag-success' : rate >= 20 ? 'crm-tag-info' : 'crm-tag-warning';
    return <span className={`crm-tag ${cls}`}>{rate}%</span>;
  };

  const columns: any[] = [
    { title: '销售名称', dataIndex: 'salesName', width: 160, render: (v: string) => v || '-' },
    { title: '待跟进', dataIndex: 'pending', width: 110 },
    { title: '跟进中', dataIndex: 'following', width: 110 },
    { title: '已成交', dataIndex: 'done', width: 110 },
    { title: '已战败', dataIndex: 'defeated', width: 110 },
    { title: '合计', dataIndex: 'total', width: 110, render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: '线索转化率', dataIndex: 'conversionRate', width: 130, render: (v: number) => rateTag(v) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      {/* ===== 核心经营指标（PRD 4.4 / 配图 image39）===== */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {metricCards.map(card => (
          <div key={card.label} style={cardStyle}>
            <div style={{ color: '#94A3B8', fontSize: '13px', marginBottom: '10px' }}>{card.label}</div>
            <div style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 700, lineHeight: 1.2 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ===== 销售线索分布 ===== */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '20px 24px',
      }}>
        <div style={{
          color: '#F8FAFC', fontSize: '15px', fontWeight: 600, marginBottom: '16px',
          borderLeft: '3px solid #6366F1', paddingLeft: '10px',
        }}>
          销售线索分布
        </div>
        <Table
          className="workbench-table"
          columns={columns}
          dataSource={distribution}
          rowKey="accountId"
          loading={loading}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (t: number) => `共 ${t} 条数据`,
          }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: '暂无销售数据' }}
        />
      </div>
    </div>
  );
};

export default Home;
