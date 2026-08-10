import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, message, Table, ConfigProvider } from 'antd';
import request from '../utils/request';
import { hasPerm } from '../utils/perm';
import dayjs from 'dayjs';
import ExcelJS from 'exceljs';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import './Workbench.css';
import './Leads.css';

const Workbench: React.FC = () => {
  const navigate = useNavigate();

  const [leads, setLeads] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<number[]>([1, 2]); // 默认待跟进、跟进中
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isReturnModalVisible, setIsReturnModalVisible] = useState(false);
  const [stats, setStats] = useState({ todayPendingFollowUp: 0, publicPoolCount: 0 });
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSearch, setPhoneSearch] = useState(''); // 点查询后生效的手机号筛选
  const [poolCounts, setPoolCounts] = useState<{ total: number; byStatus: Record<number, number> }>({ total: 0, byStatus: {} });

  const fetchStats = async () => {
    try {
      const userInfoStr = localStorage.getItem('user');
      if (!userInfoStr) return;
      const userInfo = JSON.parse(userInfoStr);
      const res: any = await request.get('/lead/workbench-stats', { params: { accountId: userInfo.id } });
      if (res && typeof res.todayPendingFollowUp === 'number') {
        setStats({
          todayPendingFollowUp: res.todayPendingFollowUp,
          publicPoolCount: res.publicPoolCount,
        });
        setPoolCounts({ total: res.poolTotal || 0, byStatus: res.poolStatusCounts || {} });
      }
    } catch (e) {
      console.error('Failed to fetch stats', e);
    }
  };

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const userInfoStr = localStorage.getItem('user');
      if (!userInfoStr) return;
      const userInfo = JSON.parse(userInfoStr);

      const params: any = {
        page,
        limit: pageSize,
        assignedAccountId: userInfo.id,
        sortField: 'workbench' // 按 待跟进→跟进中→已战败→已完成 分组，组内最新跟进时间升序
      };
      if (statusFilter.length > 0) {
        params.leadStatus = statusFilter.join(',');
      } else {
        // 全部 = 私池四种状态，排除作废/待分配
        params.leadStatus = '1,2,4,3';
      }
      if (phoneSearch) {
        params.customerPhone = phoneSearch;
      }

      const res: any = await request.get('/lead', { params });
      setLeads(res.items || []);
      setTotal(res.total || 0);
    } catch (error) {
      console.error(error);
      message.error('获取线索失败');
    } finally {
      setLoading(false);
    }
    fetchStats();
  };

  const [recentCustomers, setRecentCustomers] = useState<any[]>([]);

  const fetchRecentCustomers = async () => {
    try {
      const userInfoStr = localStorage.getItem('user');
      if (!userInfoStr) return;
      const userInfo = JSON.parse(userInfoStr);
      const res: any = await request.get('/customer/recent-followed', { params: { accountId: userInfo.id } });
      setRecentCustomers(res || []);
    } catch (e) {
      console.error('Failed to fetch recent customers', e);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchRecentCustomers();
  }, [page, pageSize, statusFilter, phoneSearch]);

  const applyPhoneSearch = () => {
    setPhoneSearch(phoneInput.trim());
    setPage(1);
  };

  const toggleStatusFilter = (status: number) => {
    setStatusFilter(prev => {
      if (prev.includes(status)) {
        return prev.filter(s => s !== status);
      }
      return [...prev, status];
    });
    setPage(1);
  };

  const submitReturnToPublic = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要退回公域池的线索');
      return;
    }
    setIsReturnModalVisible(true);
  };

  const handleReturnConfirm = async () => {
    try {
      await request.post('/lead/return-public', { leadIds: selectedRowKeys });
      message.success('退回成功');
      setSelectedRowKeys([]);
      setIsReturnModalVisible(false);
      fetchLeads();
    } catch (e) {
      message.error('退回失败');
    }
  };

  const handleBatchExport = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择线索');
      return;
    }

    const statusMap: Record<number, string> = {
      0: '待分配', 1: '待跟进', 2: '跟进中', 3: '已完成', 4: '已战败', 5: '作废', 6: '回收待分配'
    };

    const selectedLeads = leads.filter(l => selectedRowKeys.includes(l.id));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('线索数据');

    const headers = [
      '序号', '线索编码', '客户姓名', '客户电话', '渠道来源', '线索来源方式',
      '来源时间', '购买意向', '线索状态', '客户沟通倾向', '呼叫结果',
      '意向商品', '意向赠品', '最新跟进时间', '下次计划跟进时间'
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    selectedLeads.forEach((lead, index) => {
      const intentProducts = (lead.products || []).filter((p: any) => p.productRole === 1).map((p: any) => p.product?.productName || '-').join('、');
      const intentGifts = (lead.products || []).filter((p: any) => p.productRole === 2).map((p: any) => p.product?.productName || '-').join('、');

      const row = worksheet.addRow([
        index + 1,
        lead.leadCode || '',
        lead.customer?.customerName || '',
        lead.customer?.phone || '',
        lead.channelSource || '',
        lead.sourceMethod || '',
        lead.sourceDate || '',
        lead.purchaseIntention || '',
        statusMap[lead.leadStatus] || '',
        lead.communicationTendency || '',
        lead.callResult || '',
        intentProducts || '-',
        intentGifts || '-',
        lead.lastFollowAt ? dayjs(lead.lastFollowAt).format('YYYY-MM-DD') : '',
        lead.nextFollowAt ? dayjs(lead.nextFollowAt).format('YYYY-MM-DD') : '',
      ]);
      row.eachCell(cell => {
        cell.alignment = { vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' }
        };
      });
    });

    // Auto-fit column widths
    worksheet.columns.forEach(col => {
      let maxLen = 10;
      col.eachCell?.({ includeEmpty: true }, cell => {
        const len = String(cell.value || '').length;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 4, 30);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const userStr = localStorage.getItem('user');
    const userName = userStr ? (JSON.parse(userStr).realName || JSON.parse(userStr).username || '') : '';
    a.download = `${userName}私域线索_${dayjs().format('YYMMDD HH:mm:ss')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`成功导出 ${selectedLeads.length} 条线索`);
  };

  const getPillTag = (status: string, className: string) => (
    <span className={`status-badge ${className}`}>{status}</span>
  );

  const getLeadStatusElement = (status: number) => {
    const map: any = {
      0: getPillTag('待分配', 'status-gray'),
      1: getPillTag('待跟进', 'status-warning'),
      2: getPillTag('跟进中', 'status-primary'),
      3: getPillTag('已完成', 'status-success'),
      4: getPillTag('已战败', 'status-gray'),
      5: getPillTag('作废', 'status-danger'),
      6: getPillTag('回收待分配', 'status-gray'),
    };
    return map[status] || getPillTag('未知', 'status-gray');
  };

  const renderProducts = (products: any[], role: number) => {
    if (!products || products.length === 0) return <span style={{ color: '#94A3B8' }}>-</span>;
    const filtered = products.filter((p: any) => p.productRole === role).map((p: any) => p.product);
    if (!filtered.length) return <span style={{ color: '#94A3B8' }}>-</span>;
    const names = filtered.map((p: any) => p?.productName || '').filter(Boolean);
    return names.join(', ') || '-';
  };

  const getPurchaseIntentionTag = (val: string) => {
    if (!val) return <span style={{ color: '#94A3B8' }}>-</span>;
    const colorMap: any = {
      '意向内': 'status-warning',
      '意向外': 'status-primary',
      '无意向': 'status-gray',
      '高意向': 'status-warning',
      '一般': 'status-gray',
      '低意向': 'status-danger',
    };
    return getPillTag(val, colorMap[val] || 'status-gray');
  };

  const getCommunicationTag = (val: string) => {
    if (!val) return <span style={{ color: '#94A3B8' }}>-</span>;
    const colorMap: any = {
      '高': 'status-success',
      '明确': 'status-success',
      '活跃': 'status-success',
      '中': 'status-warning',
      '低': 'status-danger',
      '投诉倾向': 'status-danger',
      '未知': 'status-gray',
    };
    return getPillTag(val, colorMap[val] || 'status-gray');
  };

  const getCallResultTag = (val: string) => {
    if (!val) return <span style={{ color: '#94A3B8' }}>-</span>;
    const colorMap: any = {
      '成功接通': 'status-success',
      '客户主动挂断': 'status-warning',
      '无人接听': 'status-danger',
      '空号': 'status-danger',
      '关机': 'status-danger',
      '占线': 'status-danger',
    };
    return getPillTag(val, colorMap[val] || 'status-gray');
  };

  const columns = [
    { title: '序号', dataIndex: 'id', width: 60, render: (_: any, __: any, index: number) => (page - 1) * pageSize + index + 1 },
    { title: '线索编码', dataIndex: 'leadCode', width: 110 },
    { title: '客户姓名', dataIndex: ['customer', 'customerName'], width: 90 },
    { title: '客户电话', dataIndex: ['customer', 'phone'], width: 120 },
    { title: '渠道来源', dataIndex: 'channelSource', width: 100 },
    { title: '线索来源方式', dataIndex: 'sourceMethod', width: 110 },
    { title: '来源时间', dataIndex: 'sourceDate', width: 110, render: (val: any) => val || '-' },
    { title: '购买意向', dataIndex: 'purchaseIntention', width: 90, render: (val: any) => getPurchaseIntentionTag(val) },
    { title: '线索状态', dataIndex: 'leadStatus', width: 90, render: (val: any) => getLeadStatusElement(val) },
    { title: '添加微信状态', dataIndex: 'isAddWechat', width: 110, render: (val: any) => {
      if (!val) return '-';
      const cls = val === '已通过' || val === '已添加' ? 'status-success'
        : val === '添加待通过' ? 'status-warning'
        : val === '拒绝添加' ? 'status-danger'
        : 'status-gray';
      return getPillTag(val, cls);
    } },
    { title: '客户沟通倾向', dataIndex: 'communicationTendency', width: 110, render: (val: any) => getCommunicationTag(val) },
    { title: '呼叫结果', dataIndex: 'callResult', width: 100, render: (val: any) => getCallResultTag(val) },
    { title: '意向商品', key: 'intentProduct', width: 100, render: (_: any, record: any) => renderProducts(record.products, 1) },
    { title: '意向赠品', key: 'intentGift', width: 100, render: (_: any, record: any) => renderProducts(record.products, 2) },
    { title: '备注', dataIndex: 'remark', width: 150, render: (_: any, record: any) => record.vehicle?.remark || <span style={{ color: '#94A3B8' }}>-</span> },
    { title: '最新跟进时间', dataIndex: 'lastFollowAt', width: 120, render: (val: any) => val ? dayjs(val).format('YYYY-MM-DD') : '无记录' },
    { title: '下次计划跟进时间', dataIndex: 'nextFollowAt', width: 140, render: (val: any) => val ? dayjs(val).format('YYYY-MM-DD') : <span style={{ color: '#94A3B8' }}>-</span> },
    { 
      title: '操作', 
      key: 'action', 
      width: 180, 
      fixed: 'right' as const,
      render: (_: any, record: any) => {
        return (
          <div className="action-links">
            {[3, 4].includes(record.leadStatus) ? (
              <a onClick={() => navigate(`/customer/360/${record.customerId}?leadId=${record.id}`)}>详情</a>
            ) : (
              <>
                <a onClick={() => navigate(`/customer/360/${record.customerId}?leadId=${record.id}`)}>跟进</a>
                {hasPerm('workbench:return_public') && <a onClick={() => {
                  setSelectedRowKeys([record.id]);
                  setIsReturnModalVisible(true);
                }}>退回公域池</a>}
              </>
            )}
          </div>
        );
      }
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (newKeys: React.Key[]) => setSelectedRowKeys(newKeys),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>

      <div className="workbench-grid">
        <div className="workbench-content">
          <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
            {/* 左侧：今日数据卡片 */}
            <div className="data-cards-panel" style={{ flex: 1, backgroundColor: '#1d2238', borderRadius: '8px', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#e2e8f0', fontSize: '16px', fontWeight: 500 }}>
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '4px' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>今日数据卡片
              </div>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ flex: '0 0 240px', backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '20px' }}>
                  <div style={{ color: '#8892b0', fontSize: '14px', marginBottom: '12px' }}>今日待跟进</div>
                  <div style={{ color: '#ffffff', fontSize: '28px', fontWeight: 600 }}>{stats.todayPendingFollowUp} <span style={{ fontSize: '14px', color: '#8892b0', fontWeight: 'normal' }}>条</span></div>
                </div>
                <div style={{ flex: '0 0 240px', backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '8px', padding: '20px' }}>
                  <div style={{ color: '#8892b0', fontSize: '14px', marginBottom: '12px' }}>可抢公域池</div>
                  <div style={{ color: '#ffffff', fontSize: '28px', fontWeight: 600 }}>{stats.publicPoolCount} <span style={{ fontSize: '14px', color: '#8892b0', fontWeight: 'normal' }}>条</span></div>
                </div>
              </div>
            </div>

            {/* 右侧：快捷工具栏 */}
            <div className="quick-tools-panel-static" style={{ flex: '0 0 300px', backgroundColor: '#1d2238', borderRadius: '8px', padding: '24px' }}>
              <div className="quick-tools-header">
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '8px' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                快捷工具栏
              </div>
              {hasPerm('workbench:grab') && <div className="quick-tool-btn" onClick={() => navigate('/public-pool')}>
                <div className="quick-tool-icon">
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
                </div>
                公域池抢单
              </div>}
            </div>
          </div>

            <div className="card" style={{ padding: '24px', marginBottom: '24px', overflow: 'hidden' }}>
              <div className="card-header" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '4px' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
              我的线索私池
            </div>
            <div className="lead-header-controls">
              <div className="filters">
                <button className={`filter-btn ${statusFilter.length === 0 ? 'active' : ''}`} onClick={() => { setStatusFilter([]); setPage(1); }}>全部<span className="filter-count">{poolCounts.total}</span></button>
                <button className={`filter-btn ${statusFilter.includes(1) ? 'active' : ''}`} onClick={() => toggleStatusFilter(1)}>待跟进<span className="filter-count">{poolCounts.byStatus[1] || 0}</span></button>
                <button className={`filter-btn ${statusFilter.includes(2) ? 'active' : ''}`} onClick={() => toggleStatusFilter(2)}>跟进中<span className="filter-count">{poolCounts.byStatus[2] || 0}</span></button>
                <button className={`filter-btn ${statusFilter.includes(4) ? 'active' : ''}`} onClick={() => toggleStatusFilter(4)}>已战败<span className="filter-count">{poolCounts.byStatus[4] || 0}</span></button>
                <button className={`filter-btn ${statusFilter.includes(3) ? 'active' : ''}`} onClick={() => toggleStatusFilter(3)}>已完成<span className="filter-count">{poolCounts.byStatus[3] || 0}</span></button>
              </div>
              <div className="quick-actions">
                {hasPerm('workbench:export') && <button className="call-btn btn-primary" onClick={handleBatchExport}>批量导出</button>}
                {hasPerm('workbench:return_public') && <button className="call-btn btn-primary" onClick={submitReturnToPublic}>退回公域池</button>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 16px' }}>
              <div style={{ position: 'relative' }}>
                <svg width="14" height="14" fill="none" stroke="#8892b0" viewBox="0 0 24 24" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
                <input
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') applyPhoneSearch(); }}
                  placeholder="搜索客户手机号"
                  style={{
                    width: 240, padding: '7px 12px 7px 34px', borderRadius: 8,
                    background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)',
                    color: '#e2e8f0', fontSize: 13, outline: 'none'
                  }}
                />
              </div>
              <button className="call-btn btn-primary" onClick={applyPhoneSearch}>查 询</button>
            </div>
            
            <ConfigProvider 
              getPopupContainer={(trigger) => trigger?.parentElement || document.body}
              theme={{
                components: {
                  Checkbox: {
                    colorBgContainer: '#1e293b',
                    colorBorder: 'rgba(255, 255, 255, 0.3)',
                  },
                  Pagination: {
                    colorBgContainer: '#1e293b',
                    colorText: '#e2e8f0',
                    colorBorder: 'rgba(255, 255, 255, 0.3)',
                  },
                  Select: {
                    colorBgContainer: '#1e293b',
                    colorText: '#e2e8f0',
                    colorBorder: 'rgba(255, 255, 255, 0.3)',
                    controlItemBgActive: 'rgba(59, 130, 246, 0.15)',
                    controlItemBgHover: 'rgba(255, 255, 255, 0.08)',
                  }
                }
              }}
            >
            <Table 
              className="workbench-table custom-table"
              columns={columns} 
              dataSource={leads} 
              rowKey="id"
              loading={loading}
              locale={loading ? { emptyText: ' ' } : undefined}
              rowSelection={rowSelection}

              pagination={{ 
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
                pageSizeOptions: ['10', '20', '50', '100', '200'],
                onChange: (p: number, s: number) => { setPage(p); setPageSize(s); },
              }}
              scroll={{ x: 1830 }}
            />
            </ConfigProvider>
          </div>

          <div className="card">
            <div className="card-header">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              最近跟进客户 - 快捷入口
              <a onClick={() => navigate('/customer?from=workbench')} className="header-link" style={{ cursor: 'pointer' }}>
                我的客户 <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
              </a>
            </div>
            <div className="recent-list">
              {recentCustomers.length === 0 ? (
                <div style={{ color: '#94a3b8', padding: '16px', textAlign: 'center' }}>暂无最近跟进客户</div>
              ) : (
                recentCustomers.map(customer => (
                  <div className="recent-item" key={customer.customerId} onClick={() => navigate(`/customer/detail/${customer.customerId}?from=workbench${customer.leadId ? `&leadId=${customer.leadId}` : ''}`)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <div className="recent-avatar">{customer.customerName ? customer.customerName.charAt(0) : '客'}</div>
                    <div className="recent-info" style={{ flex: 1 }}>
                      <div className="recent-name">{customer.customerName}</div>
                      <div className="recent-desc">{customer.latestNote}</div>
                    </div>
                    <button
                      style={{ background: 'transparent', border: '1px solid #6366F1', color: '#818CF8', borderRadius: '8px', padding: '8px 20px', fontSize: '14px', cursor: 'pointer', flexShrink: 0 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/customer/detail/${customer.customerId}?from=workbench${customer.leadId ? `&leadId=${customer.leadId}` : ''}`);
                      }}
                    >查看</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>



      <Modal
        title="提示"
        open={isReturnModalVisible}
        onCancel={() => setIsReturnModalVisible(false)}
        onOk={handleReturnConfirm}
        centered
        className="crm-unified-modal"
        width={400}
        okText="确定"
        cancelText="取消"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px 0' }}>
          <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: '20px' }} />
          <span style={{ fontSize: '15px' }}>确定要退回公域池吗？</span>
        </div>
      </Modal>
    </div>
  );
};

export default Workbench;
