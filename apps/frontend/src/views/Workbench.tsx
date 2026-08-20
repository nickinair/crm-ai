import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, message, Table, ConfigProvider, Select } from 'antd';
import request from '../utils/request';
import { hasPerm } from '../utils/perm';
import dayjs from 'dayjs';
import ExcelJS from 'exceljs';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import OrderCreateModal from '../components/OrderCreateModal';
import LeadVoidModal from '../components/LeadVoidModal';
import LeadAddModal from './LeadAddModal';
import { getOrderStatusTag, isOrderFinal } from './Order';
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
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSearch, setPhoneSearch] = useState(''); // 点查询后生效的手机号筛选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isReturnModalVisible, setIsReturnModalVisible] = useState(false);
  const [stats, setStats] = useState({ todayPendingFollowUp: 0, publicPoolCount: 0 });
  const [orderSituationFilter, setOrderSituationFilter] = useState<number | undefined>(undefined); // 订单情况筛选，单选（PRD 4.2.4.1）
  const [voidLeadId, setVoidLeadId] = useState<string | null>(null); // 作废弹框（PRD 4.2.4.1）
  const [isOrderCreateOpen, setIsOrderCreateOpen] = useState(false); // 快捷工具栏-创建订单（PRD 4.2.3）
  const [isLeadAddOpen, setIsLeadAddOpen] = useState(false); // 快捷工具栏-新增线索（PRD 4.2.3）

  // ===== 我的跟单订单 tab（PRD 4.2.3.1）=====
  const [activeTab, setActiveTab] = useState<'leads' | 'orders'>('leads');
  const [orders, setOrders] = useState<any[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(10);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<number[]>([]); // 默认全部；切换其他状态可多选
  const [orderPhoneInput, setOrderPhoneInput] = useState('');
  const [orderPhoneSearch, setOrderPhoneSearch] = useState('');
  const [orderSort, setOrderSort] = useState<{ field?: string; order?: string }>({});
  const [orderCounts, setOrderCounts] = useState<{ total: number; byStatus: Record<number, number> }>({ total: 0, byStatus: {} });
  // 行内操作弹框
  const [voidTarget, setVoidTarget] = useState<any>(null);
  const [voidReason, setVoidReason] = useState('');
  const [thirdTarget, setThirdTarget] = useState<any>(null);
  const [thirdNo, setThirdNo] = useState('');
  const [orderOpLoading, setOrderOpLoading] = useState(false);
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
        sortField: 'workbench' // 按 待跟进→跟进中→已战败→已成交 分组，组内最新跟进时间升序
      };
      if (statusFilter.length > 0) {
        params.leadStatus = statusFilter.join(',');
      } else {
        // 全部 = 私池四种状态，排除作废/战败已被领取等
        params.leadStatus = '1,2,4,3';
      }
      if (phoneSearch) {
        params.customerPhone = phoneSearch;
      }
      if (orderSituationFilter !== undefined) {
        params.orderSituation = orderSituationFilter;
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
  }, [page, pageSize, statusFilter, phoneSearch, orderSituationFilter]);

  const applyPhoneSearch = () => {
    setPhoneSearch(phoneInput.trim());
    setPage(1);
  };

  // ===== 我的跟单订单：数据与操作（PRD 4.2.3.1）=====
  const userInfoRef = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();

  const fetchOrderCounts = async () => {
    try {
      const res: any = await request.get('/order/status-count');
      setOrderCounts({ total: res.total || 0, byStatus: res.byStatus || {} });
    } catch { /* 忽略 */ }
  };

  const fetchOrders = async () => {
    setOrderLoading(true);
    try {
      const params: any = {
        page: orderPage,
        limit: orderPageSize,
        salespersonId: userInfoRef.id, // 仅展示跟进人=当前登录人的订单
      };
      if (orderStatusFilter.length > 0) params.orderStatus = orderStatusFilter.join(',');
      if (orderPhoneSearch) params.customerPhone = orderPhoneSearch;
      if (orderSort.field) { params.sortField = orderSort.field; params.sortOrder = orderSort.order; }
      const res: any = await request.get('/order', { params });
      setOrders(res.items || []);
      setOrderTotal(res.total || 0);
    } catch (e) {
      console.error(e);
      message.error('获取订单失败');
    } finally {
      setOrderLoading(false);
    }
    fetchOrderCounts();
  };

  useEffect(() => {
    if (activeTab === 'orders') fetchOrders();
  }, [activeTab, orderPage, orderPageSize, orderStatusFilter, orderPhoneSearch, orderSort]);

  const toggleOrderStatus = (status: number) => {
    setOrderStatusFilter(prev => prev.includes(status) ? prev.filter(x => x !== status) : [...prev, status]);
    setOrderPage(1);
  };

  const refreshOrders = () => { fetchOrders(); };

  /** 已发送电子签 / 已签署电子签（PRD 4.2.3.1 弹框文案） */
  const handleOrderSign = (record: any, action: 'sendSign' | 'signed') => {
    Modal.confirm({
      title: '提示',
      content: action === 'sendSign' ? '确定已将电子签已发送给客户？' : '确定用户已完成电子签签署？',
      okText: '确定', cancelText: '取消', centered: true, className: 'crm-unified-modal',
      onOk: async () => {
        await request.post(`/order/${record.id}/status`, { action });
        message.success('订单状态修改成功！');
        refreshOrders();
      },
    });
  };

  /** 已完成发货：按 complete-check 决定弹框文案（PRD 配图 image12） */
  const handleOrderDelivered = async (record: any) => {
    try {
      const check: any = await request.get(`/order/${record.id}/complete-check`);
      const content = check?.willCloseLead
        ? (
          <div>
            <div>1. 请确认三方平台订单已完结；</div>
            <div>2. 完结订单将一并完结线索；</div>
            <div style={{ marginTop: 8 }}>确定要完结订单吗？</div>
          </div>
        )
        : '提交后，订单将不可跟进，确定三方平台订单已完结？';
      Modal.confirm({
        title: '提示', content,
        okText: '确定', cancelText: '取消', centered: true, className: 'crm-unified-modal',
        onOk: async () => {
          await request.post(`/order/${record.id}/status`, { action: 'delivered' });
          message.success('订单已完结！');
          refreshOrders();
          fetchLeads(); // 可能一并完结线索，刷新私池数据
        },
      });
    } catch (e: any) {
      if (!e?.response) message.error(e?.message || '操作失败');
    }
  };

  const submitOrderThirdNo = async () => {
    if (!thirdNo.trim()) { message.warning('请填写三方订单编号'); return; }
    setOrderOpLoading(true);
    try {
      await request.put(`/order/${thirdTarget.id}/third-order-no`, { thirdOrderNo: thirdNo.trim() });
      message.success('三方订单编号提交成功！');
      setThirdTarget(null);
      setThirdNo('');
      refreshOrders();
    } catch (e: any) {
      if (!e?.response) message.error(e?.message || '提交失败');
    } finally {
      setOrderOpLoading(false);
    }
  };

  const submitOrderVoid = async () => {
    if (!voidReason.trim()) { message.warning('请填写作废原因'); return; }
    setOrderOpLoading(true);
    try {
      await request.post(`/order/${voidTarget.id}/void`, { voidReason: voidReason.trim() });
      message.success('订单已作废！');
      setVoidTarget(null);
      setVoidReason('');
      refreshOrders();
    } catch (e: any) {
      if (!e?.response) message.error(e?.message || '作废失败');
    } finally {
      setOrderOpLoading(false);
    }
  };

  // 我的跟单订单列（PRD 配图 image8）
  const orderColumns: any[] = [
    { title: '序号', key: 'idx', width: 56, render: (_: any, __: any, i: number) => (orderPage - 1) * orderPageSize + i + 1 },
    { title: '订单编码', dataIndex: 'orderCode', width: 150 },
    { title: '客户姓名', key: 'cname', width: 90, render: (_: any, r: any) => r.customer?.customerName || r.snapCustomerName || '-' },
    { title: '客户电话', key: 'cphone', width: 120, render: (_: any, r: any) => r.customer?.phone || r.snapCustomerPhone || '-' },
    { title: '下单平台', dataIndex: 'orderPlatform', width: 100, render: (v: any) => v || '-' },
    { title: '平台订单编号', dataIndex: 'platformOrderNo', width: 140, render: (v: any) => v || '-' },
    { title: '三方订单编号', dataIndex: 'thirdOrderNo', width: 140, render: (v: any) => v || '-' },
    { title: '订单状态', dataIndex: 'orderStatus', width: 115, render: (v: number) => getOrderStatusTag(v) },
    { title: '实付金额', dataIndex: 'totalAmount', width: 100, render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '跟进人', key: 'sales', width: 90, render: (_: any, r: any) => r.salesperson?.realName || r.salesperson?.username || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 150, sorter: true, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
    { title: '创建人', key: 'creator', width: 90, render: (_: any, r: any) => r.creator?.realName || r.creator?.username || '系统' },
    { title: '更新时间', dataIndex: 'updatedAt', width: 150, sorter: true, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
    { title: '更新人', key: 'updater', width: 90, render: (_: any, r: any) => r.updater?.realName || r.updater?.username || '系统' },
    {
      title: '操作', key: 'op', width: 210, fixed: 'right',
      render: (_: any, r: any) => (
        <div className="action-links" style={{ flexWrap: 'wrap' }}>
          {r.orderStatus === 0 && <a onClick={() => handleOrderSign(r, 'sendSign')}>已发送电子签</a>}
          {r.orderStatus === 1 && <a onClick={() => handleOrderSign(r, 'signed')}>已签署电子签</a>}
          {r.orderStatus === 2 && <a onClick={() => { setThirdTarget(r); setThirdNo(''); }}>录入三方订单编号</a>}
          {r.orderStatus === 3 && <a onClick={() => handleOrderDelivered(r)}>已完成发货</a>}
          <a onClick={() => navigate(`/order/detail/${r.id}`)}>详情</a>
          {!isOrderFinal(r.orderStatus) && <a className="delete-link" onClick={() => { setVoidTarget(r); setVoidReason(''); }}>作废</a>}
        </div>
      ),
    },
  ];

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
      await request.post('/lead/return-public', { leadIds: selectedRowKeys }, { timeout: 120000 });
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
      0: '待分配', 1: '待跟进', 2: '跟进中', 3: '已成交', 4: '已战败', 5: '作废', 6: '回收待分配'
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
      3: getPillTag('已成交', 'status-success'),
      4: getPillTag('已战败', 'status-gray'),
      5: getPillTag('作废', 'status-danger'),
      6: getPillTag('回收待分配', 'status-gray'),
    };
    return map[status] || getPillTag('未知', 'status-gray');
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

  // 车辆布尔字段展示：1/'1'/true/'是' → 是，其余 → 否
  const boolText = (val: any) => (val === true || val === 1 || val === '1' || val === '是') ? '是' : '否';

  // 订单情况（PRD 4.2.4.1，枚举同线索池管理）
  const ORDER_SITUATION: Record<number, { text: string; cls: string }> = {
    0: { text: '未下单', cls: 'crm-tag-default' },
    1: { text: '存在未完结订单', cls: 'crm-tag-warning' },
    2: { text: '全部订单已作废', cls: 'crm-tag-danger' },
    3: { text: '全部订单已完结', cls: 'crm-tag-success' },
  };

  // 列表字段（PRD 4.2.4.1）：序号、线索编码、客户姓名、客户电话、来源时间、购买意向、线索状态、
  // 添加微信状态、客户沟通倾向、呼叫结果、是否购买整车延保、是否购买电池延保、订单情况、
  // 最新跟进时间、下次计划跟进时间、操作；首尾列固定
  const columns = [
    { title: '序号', dataIndex: 'id', width: 60, fixed: 'left' as const, render: (_: any, __: any, index: number) => (page - 1) * pageSize + index + 1 },
    { title: '线索编码', dataIndex: 'leadCode', width: 110, fixed: 'left' as const },
    { title: '客户姓名', dataIndex: ['customer', 'customerName'], width: 90, fixed: 'left' as const },
    { title: '客户电话', dataIndex: ['customer', 'phone'], width: 120, fixed: 'left' as const },
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
    { title: '是否购买整车延保', key: 'extWarranty', width: 130, render: (_: any, record: any) => record.vehicle ? boolText(record.vehicle.hasExtendedWarranty) : '-' },
    { title: '是否购买电池延保', key: 'batteryWarranty', width: 130, render: (_: any, record: any) => record.vehicle ? boolText(record.vehicle.hasBatteryWarranty) : '-' },
    { title: '订单情况', dataIndex: 'orderSituation', width: 130, render: (val: number) => {
      const m = ORDER_SITUATION[val] || ORDER_SITUATION[0];
      return <span className={`crm-tag ${m.cls}`}>{m.text}</span>;
    } },
    { title: '最新跟进时间', dataIndex: 'lastFollowAt', width: 120, fixed: 'right' as const, render: (val: any) => val ? dayjs(val).format('YYYY-MM-DD') : '无记录' },
    { title: '下次计划跟进时间', dataIndex: 'nextFollowAt', width: 140, fixed: 'right' as const, render: (val: any) => val ? dayjs(val).format('YYYY-MM-DD') : <span style={{ color: '#94A3B8' }}>-</span> },
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
                {/* 待跟进/跟进中 可作废（PRD 4.2.4.1），交互同线索池管理 */}
                {[1, 2].includes(record.leadStatus) && <a className="delete-link" onClick={() => setVoidLeadId(record.id)}>作废</a>}
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
              <div className="quick-tool-btn" onClick={() => setIsLeadAddOpen(true)}>
                <div className="quick-tool-icon">
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                </div>
                新增线索
              </div>
              <div className="quick-tool-btn" onClick={() => setIsOrderCreateOpen(true)}>
                <div className="quick-tool-icon">
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                </div>
                创建订单
              </div>
            </div>
          </div>

            <div className="card" style={{ padding: '24px', marginBottom: '24px', overflow: 'hidden' }}>
              {/* tab 头：我的线索私池 / 我的跟单订单（PRD 配图 image7/8） */}
              <div style={{ display: 'flex', gap: '28px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {([['leads', '我的线索私池'], ['orders', '我的跟单订单']] as const).map(([key, label]) => (
                  <div
                    key={key}
                    onClick={() => setActiveTab(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                      padding: '4px 2px 12px', fontSize: '15px', fontWeight: 600,
                      color: activeTab === key ? '#818CF8' : 'var(--text-secondary)',
                      borderBottom: activeTab === key ? '2px solid #6366F1' : '2px solid transparent',
                      marginBottom: '-1px', transition: 'color 0.2s',
                    }}
                  >
                    {key === 'leads'
                      ? <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                      : <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>}
                    {label}
                  </div>
                ))}
              </div>
            {activeTab === 'leads' && (<>
            <div className="lead-header-controls">
              <div className="filters">
                <button className={`filter-btn ${statusFilter.length === 0 ? 'active' : ''}`} onClick={() => { setStatusFilter([]); setPage(1); }}>全部<span className="filter-count">{poolCounts.total}</span></button>
                <button className={`filter-btn ${statusFilter.includes(1) ? 'active' : ''}`} onClick={() => toggleStatusFilter(1)}>待跟进<span className="filter-count">{poolCounts.byStatus[1] || 0}</span></button>
                <button className={`filter-btn ${statusFilter.includes(2) ? 'active' : ''}`} onClick={() => toggleStatusFilter(2)}>跟进中<span className="filter-count">{poolCounts.byStatus[2] || 0}</span></button>
                <button className={`filter-btn ${statusFilter.includes(4) ? 'active' : ''}`} onClick={() => toggleStatusFilter(4)}>已战败<span className="filter-count">{poolCounts.byStatus[4] || 0}</span></button>
                <button className={`filter-btn ${statusFilter.includes(3) ? 'active' : ''}`} onClick={() => toggleStatusFilter(3)}>已成交<span className="filter-count">{poolCounts.byStatus[3] || 0}</span></button>
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
                  onChange={e => {
                    setPhoneInput(e.target.value);
                    // 清空输入时立即恢复全量列表，避免残留旧搜索条件（测试问题15）
                    if (!e.target.value.trim() && phoneSearch) { setPhoneSearch(''); setPage(1); }
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') applyPhoneSearch(); }}
                  placeholder="搜索客户手机号"
                  style={{
                    width: 240, padding: '7px 12px 7px 34px', paddingRight: 30, borderRadius: 8,
                    background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)',
                    color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box'
                  }}
                />
                {phoneInput && (
                  <span
                    onClick={() => { setPhoneInput(''); setPhoneSearch(''); setPage(1); }}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#8892b0', fontSize: 14, lineHeight: 1 }}
                  >✕</span>
                )}
              </div>
              {/* 订单情况：置于查询按钮左侧，深色风格（面板渲染进容器内以套用深色样式） */}
              <div className="wb-dark-select">
                <ConfigProvider
                  getPopupContainer={(trigger: any) => trigger?.parentElement || document.body}
                  theme={{
                    components: {
                      Select: {
                        /* antd v6：Select DOM 已重构（无 .ant-select-selector），深色必须走主题 token */
                        colorBgContainer: '#1e293b',
                        colorBgElevated: '#1e293b',
                        colorText: '#e2e8f0',
                        colorTextPlaceholder: 'rgba(255,255,255,0.35)',
                        colorBorder: 'rgba(255,255,255,0.15)',
                        colorTextQuaternary: 'rgba(255,255,255,0.55)',
                        optionActiveBg: 'rgba(255,255,255,0.08)',
                        optionSelectedBg: 'rgba(99,102,241,0.28)',
                        optionSelectedColor: '#ffffff',
                        activeBorderColor: '#6366F1',
                        hoverBorderColor: '#6366F1',
                      },
                    },
                  }}
                >
                  <Select
                    placeholder="订单情况"
                    allowClear
                    value={orderSituationFilter}
                    onChange={(v) => { setOrderSituationFilter(v); setPage(1); }}
                    style={{ width: 160 }}
                    options={[
                      { value: 0, label: '未下单' },
                      { value: 1, label: '存在未完结订单' },
                      { value: 2, label: '全部订单已作废' },
                      { value: 3, label: '全部订单已完结' },
                    ]}
                  />
                </ConfigProvider>
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
              scroll={{ x: 1810 }}
            />
            </ConfigProvider>
            </>)}

            {activeTab === 'orders' && (<>
            {/* 状态筛选 pills：默认全部，可多选（PRD 4.2.3.1） */}
            <div className="lead-header-controls">
              <div className="filters">
                <button className={`filter-btn ${orderStatusFilter.length === 0 ? 'active' : ''}`} onClick={() => { setOrderStatusFilter([]); setOrderPage(1); }}>全部<span className="filter-count">{orderCounts.total}</span></button>
                {[[0, '待发送电子签'], [1, '待签署电子签'], [2, '待三方下单'], [3, '待发货'], [4, '已完结'], [5, '已作废']].map(([val, label]) => (
                  <button key={val} className={`filter-btn ${orderStatusFilter.includes(val as number) ? 'active' : ''}`} onClick={() => toggleOrderStatus(val as number)}>
                    {label}<span className="filter-count">{orderCounts.byStatus[val as number] || 0}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 16px' }}>
              <div style={{ position: 'relative' }}>
                <svg width="14" height="14" fill="none" stroke="#8892b0" viewBox="0 0 24 24" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
                <input
                  value={orderPhoneInput}
                  onChange={e => {
                    setOrderPhoneInput(e.target.value);
                    if (!e.target.value.trim() && orderPhoneSearch) { setOrderPhoneSearch(''); setOrderPage(1); }
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') { setOrderPhoneSearch(orderPhoneInput.trim()); setOrderPage(1); } }}
                  placeholder="搜索客户手机号"
                  style={{
                    width: 240, padding: '7px 12px 7px 34px', paddingRight: 30, borderRadius: 8,
                    background: '#1e293b', border: '1px solid rgba(255,255,255,0.15)',
                    color: '#e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box'
                  }}
                />
                {orderPhoneInput && (
                  <span
                    onClick={() => { setOrderPhoneInput(''); setOrderPhoneSearch(''); setOrderPage(1); }}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#8892b0', fontSize: 14, lineHeight: 1 }}
                  >✕</span>
                )}
              </div>
              <button className="call-btn btn-primary" onClick={() => { setOrderPhoneSearch(orderPhoneInput.trim()); setOrderPage(1); }}>查 询</button>
            </div>
            <ConfigProvider
              getPopupContainer={(trigger) => trigger?.parentElement || document.body}
              theme={{
                components: {
                  Pagination: { colorBgContainer: '#1e293b', colorText: '#e2e8f0', colorBorder: 'rgba(255, 255, 255, 0.3)' },
                }
              }}
            >
            <Table
              className="workbench-table custom-table"
              columns={orderColumns}
              dataSource={orders}
              rowKey="id"
              loading={orderLoading}
              locale={orderLoading ? { emptyText: ' ' } : undefined}
              onChange={(pag: any, _f: any, sorter: any) => {
                setOrderPage(pag.current); setOrderPageSize(pag.pageSize);
                // 创建时间/更新时间排序（PRD 4.2.3.1）
                if (sorter && sorter.field && sorter.order) setOrderSort({ field: sorter.field, order: sorter.order });
                else setOrderSort({});
              }}
              pagination={{
                current: orderPage,
                pageSize: orderPageSize,
                total: orderTotal,
                showSizeChanger: true,
                showTotal: (t) => `共 ${t} 条`,
                pageSizeOptions: ['10', '20', '50', '100', '200'],
              }}
              scroll={{ x: 1800 }}
            />
            </ConfigProvider>
            </>)}
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
      <OrderCreateModal
        open={isOrderCreateOpen}
        onClose={() => setIsOrderCreateOpen(false)}
        onSuccess={() => { fetchLeads(); if (activeTab === 'orders') fetchOrders(); }}
      />

      {/* 快捷工具栏-新增线索：保存后自动分配给当前销售（PRD 4.2.3.3） */}
      <LeadVoidModal
        open={!!voidLeadId}
        leadId={voidLeadId}
        onCancel={() => setVoidLeadId(null)}
        onSuccess={() => { setVoidLeadId(null); fetchLeads(); }}
      />

      <LeadAddModal
        open={isLeadAddOpen}
        onCancel={() => setIsLeadAddOpen(false)}
        onSuccess={() => { setIsLeadAddOpen(false); fetchLeads(); }}
        defaultAssigneeId={userInfoRef.id}
      />

      {/* 录入三方订单编号（PRD 4.2.3.1：其他字段回显不可编辑） */}
      <Modal
        centered title="录入三方订单编号" open={!!thirdTarget}
        onCancel={() => { setThirdTarget(null); setThirdNo(''); }}
        onOk={submitOrderThirdNo} confirmLoading={orderOpLoading}
        okText="确定" cancelText="取消" width={600} className="crm-unified-modal"
      >
        {thirdTarget && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '4px' }}>订单编号</div>
                <input disabled value={thirdTarget.orderCode} style={{ width: '100%', height: 40, borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', color: '#6b7280', padding: '0 12px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '4px' }}>下单平台</div>
                <input disabled value={thirdTarget.orderPlatform || ''} style={{ width: '100%', height: 40, borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', color: '#6b7280', padding: '0 12px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '4px' }}>平台订单编号</div>
                <input disabled value={thirdTarget.platformOrderNo || ''} style={{ width: '100%', height: 40, borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', color: '#6b7280', padding: '0 12px', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '4px' }}><span style={{ color: '#ef4444' }}>*</span> 三方订单编号</div>
              <input
                value={thirdNo}
                onChange={e => setThirdNo(e.target.value)}
                maxLength={30}
                placeholder="请输入三方订单编号"
                style={{ width: '100%', height: 40, borderRadius: 6, border: '1px solid #d1d5db', padding: '0 12px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </>
        )}
      </Modal>

      {/* 作废订单（PRD 4.2.3.1：填写作废原因） */}
      <Modal
        centered title="作废订单" open={!!voidTarget}
        onCancel={() => { setVoidTarget(null); setVoidReason(''); }}
        onOk={submitOrderVoid} confirmLoading={orderOpLoading}
        okText="确定" cancelText="取消" width={600} className="crm-unified-modal"
      >
        <div style={{ marginBottom: '12px', color: '#4b5563' }}>
          订单 <span style={{ fontWeight: 600 }}>{voidTarget?.orderCode}</span> 作废后不可恢复，请填写作废原因：
        </div>
        <textarea
          value={voidReason}
          onChange={e => setVoidReason(e.target.value)}
          maxLength={255}
          rows={3}
          placeholder="请输入作废原因"
          style={{ width: '100%', borderRadius: 6, border: '1px solid #d1d5db', padding: '8px 12px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
        />
      </Modal>
    </div>
  );
};

export default Workbench;
