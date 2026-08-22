import React, { useEffect, useState } from 'react';
import { Button, Form, Select, Modal, Row, Col, message, Tooltip, Upload, Table, ConfigProvider, Progress, Radio } from 'antd';
import { InboxOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ExcelJS from 'exceljs';
import dayjs from 'dayjs';
import { saveAs } from 'file-saver';
import request from '../utils/request';
import { startImportTask, clearImportTask, setImportModalVisible, getImportModalVisible, registerExpandModal, getImportTask } from '../utils/importTask';
import LeadAddModal from './LeadAddModal';
import LeadVoidModal from '../components/LeadVoidModal';
import LeadSearchForm from '../components/LeadSearchForm';
import './Leads.css';

const LeadsManagement: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // ===== 常用搜索（收起态的4个槽位，按账号持久化）=====
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModal, setIsViewModal] = useState(false);
  const [voidLeadId, setVoidLeadId] = useState<string | null>(null); // 作废弹框（PRD 4.3.3）
  const [editLeadId, setEditLeadId] = useState<string | undefined>();
  
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  // 重新分配（PRD 4.3.1）
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignLeads, setReassignLeads] = useState<any[]>([]);
  const [reassignAccountId, setReassignAccountId] = useState<string | undefined>(undefined);
  const [reassignMoveOrders, setReassignMoveOrders] = useState(true); // 默认选中「是」
  const [reassignLoading, setReassignLoading] = useState(false);
  
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [assignLeadIds, setAssignLeadIds] = useState<string[]>([]);
  const [salesList, setSalesList] = useState<any[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // 同步导入弹窗开关到全局标记：弹窗打开时右上角任务浮窗隐藏，关闭后浮窗接管进度展示
  useEffect(() => {
    setImportModalVisible(isImportModalOpen);
    return () => setImportModalVisible(false);
  }, [isImportModalOpen]);

  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<any>(null);
  const [sortInfo, setSortInfo] = useState<{ field?: string; order?: string }>({});

  // 列表筛选状态持久化：进详情再返回时恢复筛选值+页码+排序
  const LEADS_STATE_KEY = 'crm-leads-list-state';
  const savedListState = (() => {
    try { return JSON.parse(sessionStorage.getItem(LEADS_STATE_KEY) || 'null'); } catch { return null; }
  })();
  const persistListState = (values: any, page: number, limit: number, sort: any) => {
    try { sessionStorage.setItem(LEADS_STATE_KEY, JSON.stringify({ values, page, limit, sort })); } catch { /* 忽略 */ }
  };

  useEffect(() => {
    registerExpandModal(() => {
      setIsImportModalOpen(true);
      const task = getImportTask();
      if (task) {
        setImportProgress({ phase: 'parsing', startedAt: task.startedAt, progressId: task.progressId });
      }
    });
    return () => registerExpandModal(() => {});
  }, []);

  // 当弹窗打开，并且有恢复的任务进度但当前没有发起导入时（比如跨页面恢复），补充轮询逻辑
  useEffect(() => {
    if (!isImportModalOpen || !importProgress?.progressId || importing) return;
    
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    
    const tick = async () => {
      try {
        const p: any = await request.get(`/lead/import-progress/${importProgress.progressId}`);
        if (stopped) return;
        if (p && p.phase && p.phase !== 'unknown') {
          setImportProgress({ ...p, progressId: importProgress.progressId });
          // 如果后端指示完成，并且本页面没有执行 post (importing=false)
          // 需要我们主动结束。因为没有完整的 import 结果，只能清空任务
          if (p.phase === 'done' || p.phase === 'error') {
            if (p.phase === 'done') {
              message.success('导入已在后台完成');
            }
            clearImportTask();
            return; 
          }
        } else {
          clearImportTask();
          return;
        }
        timer = setTimeout(tick, 2000);
      } catch {
        if (!stopped) timer = setTimeout(tick, 3000);
      }
    };
    
    timer = setTimeout(tick, 500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [isImportModalOpen, importProgress?.progressId, importing]);


  const fetchLeads = async (values: any = {}, page = 1, limit = 10, sortOverride?: any) => {
    const sort = sortOverride !== undefined ? sortOverride : sortInfo;
    setLoading(true);
    try {
      const params: any = { ...values, page, limit };
      if (Array.isArray(params.leadStatus)) {
        params.leadStatus = params.leadStatus.join(',');
      }
      // Add sort params
      if (sort.field) {
        params.sortField = sort.field;
        params.sortOrder = sort.order || 'descend';
      }
      const res = await request.get('/lead', { params });
      const items = (res as any).items || (Array.isArray(res) ? res : ((res as any).data || []));
      setData(items);
      setTotal((res as any).total || items.length);
      setPagination({ current: page, pageSize: limit });
      persistListState(values, page, limit, sort);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch leads staying on current page with current filters
  const refreshLeads = () => {
    const currentValues = form.getFieldsValue();
    fetchLeads(currentValues, pagination.current, pagination.pageSize);
  };

  useEffect(() => {
    fetchSales();
    // 有保存的筛选状态则恢复（从详情返回场景），否则默认加载
    if (savedListState && savedListState.values) {
      // 用 setFieldsValue 回填而非 Form initialValues：initialValues 会让「重置」回到旧筛选值而非清空（测试问题12）
      form.setFieldsValue(savedListState.values);
      setSortInfo(savedListState.sort || {});
      fetchLeads(savedListState.values, savedListState.page || 1, savedListState.limit || 10, savedListState.sort || {});
    } else {
      fetchLeads();
    }
  }, []);

  const fetchSales = async () => {
    try {
      // 用专用接口取销售列表：已内置「仅状态正常」过滤且不分页，
      // 避免走 /account 分页接口导致的「只出 10 个」和「禁用/离职仍展示」两个问题
      const res: any = await request.get('/account/sales-list');
      const items = Array.isArray(res) ? res : (res.items || res.data || []);
      setSalesList(items.map((s: any) => ({
        id: s.id,
        realName: s.name || s.realName,
        username: s.username,
      })));
    } catch (err) {
      console.error(err);
    }
  };

  const onSearch = (values: any) => {
    fetchLeads(values, 1, pagination.pageSize);
  };

  const handleTableChange = (pag: any, _filters: any, sorter: any) => {
    const newSort = sorter?.order ? { field: sorter.field, order: sorter.order } : {};
    setSortInfo(newSort);
    const currentValues = form.getFieldsValue();
    const params: any = { ...currentValues, page: pag.current, limit: pag.pageSize };
    if (Array.isArray(params.leadStatus)) {
      params.leadStatus = params.leadStatus.join(',');
    }
    if (newSort.field) {
      params.sortField = newSort.field;
      params.sortOrder = newSort.order;
    }
    setLoading(true);
    request.get('/lead', { params }).then((res: any) => {
      const items = res.items || (Array.isArray(res) ? res : (res.data || []));
      setData(items);
      setTotal(res.total || items.length);
      setPagination({ current: pag.current, pageSize: pag.pageSize });
      persistListState(currentValues, pag.current, pag.pageSize, newSort);
    }).catch(console.error).finally(() => setLoading(false));
  };

  const handleAdd = () => {
    setIsModalOpen(true);
  };

  const getStatusTag = (status: number) => {
    const map: Record<number, { text: string, className: string }> = {
      0: { text: '待分配', className: 'crm-tag-warning' },
      1: { text: '待跟进', className: 'crm-tag-warning' },
      2: { text: '跟进中', className: 'crm-tag-info' },
      3: { text: '已成交', className: 'crm-tag-success' },
      4: { text: '已战败', className: 'crm-tag-danger' },
      5: { text: '已作废', className: 'crm-tag-default' },
      6: { text: '回收待分配', className: 'crm-tag-warning' }
    };
    const s = map[status] || { text: '未知', className: 'crm-tag-default' };
    return <span className={`crm-tag ${s.className}`}>{s.text}</span>;
  };

  // 车辆布尔字段展示：1/'1'/true → 是，其余 → 否
  const boolText = (val: any) => (val === true || val === 1 || val === '1' || val === '是') ? '是' : '否';

  const getPillTag = (val: string | null) => {
    if (!val) return '-';
    let className = 'crm-tag-default';
    if (['已添加', '明确', '成功接通'].includes(val)) className = 'crm-tag-success';
    if (['未添加', '无意向/需剔除', '已战败', '无人接听', '空号', '关机', '占线'].includes(val)) className = 'crm-tag-danger';
    if (['客户主动挂断', '意向外', '跟进中'].includes(val)) className = 'crm-tag-warning';
    if (['意向内', '待分配', '回收待分配'].includes(val)) className = 'crm-tag-info';
    return <span className={`crm-tag ${className}`}>{val}</span>;
  };

  const renderProducts = (products: any[], role: number) => {
    if (!products || !products.length) return '-';
    const filtered = products.filter(p => p.productRole === role);
    if (!filtered.length) return '-';
    const text = filtered.map(p => `${p.product?.productName || ''} ${p.product?.productCode || ''}`.trim()).join('；');
    return (
      <Tooltip title={text}>
        <div className="leads-product-cell">{text}</div>
      </Tooltip>
    );
  };

  const handleVinClick = (record: any) => {
    const v = record.vehicle || {};
    const boolLabel = (val: any) => val === true || val === 1 || val === '1' || val === '是' ? '是' : '否';
    const fieldStyle = { background: '#f5f7fa', padding: '6px 10px', borderRadius: 4, color: '#333', minHeight: 32, display: 'flex', alignItems: 'center', fontSize: 14 };
    const labelStyle: React.CSSProperties = { color: '#999', marginBottom: 4, fontSize: 12, lineHeight: 1 };

    // Calculate vehicle age in months
    let vehicleAge = '-';
    if (v.purchaseDate) {
      const months = Math.max(0, Math.round((Date.now() - new Date(v.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 30)));
      vehicleAge = String(months);
    }

    Modal.info({
      title: '车辆信息详情',
      icon: null,
      centered: true,
      width: 700,
      okText: '关闭',
      className: 'crm-unified-modal',
      content: (
        <div style={{ marginTop: 8 }}>
          <Row gutter={[16, 12]}>
            <Col span={12}>
              <div style={labelStyle}>品牌</div>
              <div style={fieldStyle}>{v.brand || '-'}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>车牌号</div>
              <div style={fieldStyle}>{v.plateNo || '-'}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>车型</div>
              <div style={fieldStyle}>{v.model || '-'}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>款式</div>
              <div style={fieldStyle}>{v.style || '-'}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>车架号（VIN）</div>
              <div style={fieldStyle}>{v.vin || '-'}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>发票日期</div>
              <div style={fieldStyle}>{v.purchaseDate || '-'}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>车龄（月）</div>
              <div style={fieldStyle}>{vehicleAge}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>里程数</div>
              <div style={fieldStyle}>{v.mileage != null ? v.mileage : '-'}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>里程 ≥ 4 万公里</div>
              <div style={fieldStyle}>{boolLabel(v.isMileageOver40k)}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>里程 ≥ 9.5 万公里</div>
              <div style={fieldStyle}>{boolLabel(v.isMileageOver95k)}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>是否已购整车延保</div>
              <div style={fieldStyle}>{boolLabel(v.hasExtendedWarranty)}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>是否已购电池延保</div>
              <div style={fieldStyle}>{boolLabel(v.hasBatteryWarranty)}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>是否已购安心保</div>
              <div style={fieldStyle}>{boolLabel(v.hasPeaceOfMind)}</div>
            </Col>
            <Col span={12}>
              <div style={labelStyle}>是否已购轮胎保障</div>
              <div style={fieldStyle}>{boolLabel(v.hasTireProtection)}</div>
            </Col>
            <Col span={24}>
              <div style={labelStyle}>备注</div>
              <div style={fieldStyle}>{v.remark || '无'}</div>
            </Col>
          </Row>
        </div>
      ),
      onOk() {},
    });
  };

  const columns: any[] = [
    { title: '序号', key: 'index', width: 60, fixed: 'left', render: (_: any, __: any, index: number) => (pagination.current - 1) * pagination.pageSize + index + 1 },
    { title: '线索编码', dataIndex: 'leadCode', width: 90, fixed: 'left' },
    { title: '客户姓名', dataIndex: 'customerName', render: (_: any, record: any) => record.customer?.customerName || '-', width: 100, fixed: 'left' },
    { title: '客户电话', dataIndex: 'customerPhone', render: (_: any, record: any) => record.customer?.phone || '-', width: 120, fixed: 'left' },
    { title: '渠道来源', dataIndex: 'channelSource', width: 100 },
    { title: '线索来源方式', dataIndex: 'sourceMethod', width: 120 },
    { title: '来源日期', dataIndex: 'sourceDate', width: 120, sorter: true, sortOrder: (sortInfo.field === 'sourceDate' ? sortInfo.order : undefined) as any },
    { title: '车型', key: 'carModel', width: 140, render: (_: any, record: any) => record.vehicle?.model || '-' },
    { title: '款式', key: 'carStyle', width: 120, render: (_: any, record: any) => record.vehicle?.style || '-' },
    { title: '车架号', dataIndex: 'vin', width: 180, render: (_: any, record: any) => record.vehicle?.vin ? <a className="vin-link" onClick={() => handleVinClick(record)}>{record.vehicle.vin}</a> : '-' },
    { title: '发票日期', key: 'purchaseDate', width: 110, render: (_: any, record: any) => record.vehicle?.purchaseDate || '-' },
    { title: '车龄（月）', key: 'vehicleAge', width: 100, render: (_: any, record: any) => record.vehicle?.purchaseDate ? dayjs().diff(dayjs(record.vehicle.purchaseDate), 'month') : '-' },
    { title: '里程数', key: 'mileage', width: 110, render: (_: any, record: any) => (record.vehicle?.mileage || record.vehicle?.mileage === 0) ? `${Number(record.vehicle.mileage).toLocaleString()} km` : '-' },
    { title: '里程≥4万公里', key: 'over40k', width: 110, render: (_: any, record: any) => record.vehicle ? boolText(record.vehicle.isMileageOver40k) : '-' },
    { title: '里程≥9.5万公里', key: 'over95k', width: 120, render: (_: any, record: any) => record.vehicle ? boolText(record.vehicle.isMileageOver95k) : '-' },
    { title: '是否已购整车延保', key: 'extWarranty', width: 130, render: (_: any, record: any) => record.vehicle ? boolText(record.vehicle.hasExtendedWarranty) : '-' },
    { title: '是否已购电池延保', key: 'batWarranty', width: 130, render: (_: any, record: any) => record.vehicle ? boolText(record.vehicle.hasBatteryWarranty) : '-' },
    { title: '是否已购安心保', key: 'peaceOfMind', width: 120, render: (_: any, record: any) => record.vehicle ? boolText(record.vehicle.hasPeaceOfMind) : '-' },
    { title: '是否已购轮胎保障', key: 'tireProtection', width: 130, render: (_: any, record: any) => record.vehicle ? boolText(record.vehicle.hasTireProtection) : '-' },
    { title: '添加微信状态', dataIndex: 'isAddWechat', width: 120, render: (val: string) => getPillTag(val) },
    { title: '购买意向', dataIndex: 'purchaseIntention', width: 100, render: (val: string) => getPillTag(val) },
    { title: '分配管控标识', dataIndex: 'assignControl', width: 110, render: (val: number | null) =>
        val === 1 ? <span className="crm-tag crm-tag-warning">战败冷却期</span>
        : val === 2 ? <span className="crm-tag crm-tag-info">战败已复活</span>
        : '-' },
    { title: '线索状态', dataIndex: 'leadStatus', width: 100, render: (val: number) => getStatusTag(val) },
    { title: '客户沟通倾向', dataIndex: 'communicationTendency', width: 120, render: (val: string) => getPillTag(val) },
    { title: '呼叫结果', dataIndex: 'callResult', width: 100, render: (val: string) => getPillTag(val) },
    { title: '意向商品', key: 'intentProduct', width: 150, render: (_: any, record: any) => renderProducts(record.products, 1) },
    { title: '意向赠品', key: 'intentGift', width: 150, render: (_: any, record: any) => renderProducts(record.products, 2) },
    { title: '负责人', dataIndex: 'assignee', width: 100, render: (_: any, record: any) => record.assignee?.realName || record.assignee?.username || '-' },
    { title: '创建人', dataIndex: 'creator', width: 100, render: (_: any, record: any) => record.createType === 2 ? '系统' : (record.creator?.realName || record.creator?.username || '-') },
    { title: '线索创建类型', dataIndex: 'createType', width: 110, render: (val: number) =>
        val === 2 ? <span className="crm-tag crm-tag-info">战败线索复活</span> : <span className="crm-tag crm-tag-default">普通新建</span> },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (val: string) => val ? new Date(val).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-') : '-' },
    { title: '跟进天数', key: 'followUpDays', width: 100, render: (_: any, record: any) => record.firstFollowAt ? (Math.floor((new Date().setHours(0,0,0,0) - new Date(record.firstFollowAt).setHours(0,0,0,0)) / (1000 * 60 * 60 * 24)) + 1) : '-' },
    { title: '订单情况', dataIndex: 'orderSituation', width: 120, render: (val: number) => {
        const map: Record<number, { text: string; cls: string }> = {
          0: { text: '未下单', cls: 'crm-tag-default' },
          1: { text: '存在未完结订单', cls: 'crm-tag-warning' },
          2: { text: '全部订单已作废', cls: 'crm-tag-danger' },
          3: { text: '全部订单已完结', cls: 'crm-tag-success' },
        };
        const m = map[val] || map[0];
        return <span className={`crm-tag ${m.cls}`}>{m.text}</span>;
    } },
    { title: '关联订单编号', key: 'orders', width: 150, render: (_: any, record: any) => {
        const orders = record.orders || [];
        if (!orders.length) return '-';
        // 多个换行展示，所有状态的订单均展示，点击跳转订单详情（PRD 4.3.1）
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {orders.map((o: any) => (
              <a key={o.id} onClick={() => navigate(`/order/detail/${o.id}`)}>{o.orderCode}</a>
            ))}
          </div>
        );
    } },
    { title: '操作', key: 'action', width: 150, fixed: 'right', render: (_: any, record: any) => {
        // 操作矩阵（PRD 4.3.1）：待分配/回收待分配→编辑、分配、作废；待跟进/跟进中→详情、重新分配、作废；
        // 已成交/已作废→详情；已战败无管控标识→详情、重新分配（分配入口保留）；有管控标识→仅详情
        const st = record.leadStatus;
        const controlled = record.assignControl != null;
        const canEditVoid = [0, 6].includes(st);
        const canAssign = [0, 6].includes(st) || (st === 4 && !controlled);
        return (
          <div className="action-links">
            {canEditVoid && (
              <a onClick={() => {
                setEditLeadId(record.id);
                setIsViewModal(false);
                setIsModalOpen(true);
              }}>编辑</a>
            )}

            {/* 详情：跳转到线索跟进页（与销售点“跟进”进入的页面一致），不再用弹窗 */}
            <a onClick={() => {
              const custId = record.customerId || record.customer?.id;
              if (!custId) { message.warning('该线索暂无关联客户，无法查看详情'); return; }
              navigate(`/customer/360/${custId}?leadId=${record.id}&from=leads`);
            }}>详情</a>

            {canAssign && (
              <a onClick={() => {
                setAssignLeadIds([record.id]);
                setAssigneeId(undefined);
                setIsAssignModalOpen(true);
              }}>{st === 4 ? '重新分配' : '分配'}</a>
            )}

            {/* 待跟进/跟进中：重新分配（换负责人，PRD 4.3.1 操作矩阵） */}
            {[1, 2].includes(st) && (
              <a onClick={() => openReassign([record])}>重新分配</a>
            )}

            {(canEditVoid || [1, 2].includes(st)) && (
              <a className="delete-link" onClick={() => setVoidLeadId(record.id)}>作废</a>
            )}
          </div>
        );
    }}
  ];

  const handleImport = async () => {
    if (!importFile) {
      message.warning('请先选择要导入的文件');
      return;
    }
    // 文件大小校验 (25MB)
    if (importFile.size > 25 * 1024 * 1024) {
      message.error('文件大小超过25M');
      return;
    }
    // 文件格式校验
    const ext = importFile.name.toLowerCase().split('.').pop();
    if (!['csv', 'xls', 'xlsx'].includes(ext || '')) {
      message.error('只支持上传.csv .xls .xlsx格式的文件');
      return;
    }
    setImporting(true);
    const progressId = `imp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const formData = new FormData();
    formData.append('file', importFile);
    formData.append('accountId', '1');
    formData.append('progressId', progressId);

    setImportProgress({ phase: 'parsing', startedAt: Date.now() });
    // 注册全局任务：关闭弹窗/切换页面后，右上角浮窗继续跟踪进度
    startImportTask({ progressId, fileName: importFile.name, startedAt: Date.now() });
    // 轮询后端进度（每2秒），驱动弹窗底部的进度条
    const progressTimer = setInterval(async () => {
      try {
        const p: any = await request.get(`/lead/import-progress/${progressId}`);
        if (p && p.phase && p.phase !== 'unknown') {
          setImportProgress(p);
        }
      } catch { /* 轮询失败忽略，下次重试 */ }
    }, 2000);

    try {
      const res = await request.post('/lead/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 1800000, // 大文件导入耗时长，单独放宽到30分钟（全局默认10秒）
      });
      if ((res as any).error) {
        message.error((res as any).message);
        if (getImportModalVisible()) clearImportTask();
      } else {
        // 用户仍守着弹窗：结果弹窗会直接展示，浮窗任务收起；
        // 用户已关闭弹窗/切走：保留浮窗展示最终结果，由用户手动关闭
        if (getImportModalVisible()) clearImportTask();
        setImportResult(res);
        setIsImportModalOpen(false);
        setIsResultModalOpen(true);
        refreshLeads();
      }
    } catch (err: any) {
      console.error(err);
      message.error(err.message || '导入失败');
    } finally {
      clearInterval(progressTimer);
      setImporting(false);
    }
  };

  const handleDownloadErrorExcel = async (withNavigate: boolean) => {
    if (!importResult || !importResult.failRows || importResult.failRows.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('错误数据');

    const headers = [
      '渠道来源', '线索来源方式', '来源日期', '客户姓名', '客户电话',
      '车架号', '品牌', '车型', '款式', '车牌号', '发票日期', '里程数', 
      '里程≥4万公里（1：是；0：否）', '里程≥9.5万公里（1：是；0：否）', 
      '是否已购整车延保（1：是；0：否）', '是否已购电池延保（1：是；0：否）', 
      '是否已购安心保（1：是；0：否）', '是否已购轮胎保障（1：是；0：否）', 
      '意向商品名称', '意向商品编码', '意向赠品名称', '错误信息'
    ];

    worksheet.addRow(headers);

    importResult.failRows.forEach((row: any) => {
      const rowData = headers.map(h => row[h] || '');
      const addedRow = worksheet.addRow(rowData);
      
      const errorCell = addedRow.getCell(headers.length);
      errorCell.font = { color: { argb: 'FFFF0000' } };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    
    const fileName = `批量导入线索错误文件_${yy}${mm}${dd} ${hh}:${min}:${ss}.xlsx`;
    saveAs(new Blob([buffer]), fileName);

    if (withNavigate && importResult?.batchNo) {
      navigate(`/lead-temp/${importResult.batchNo}`);
    }
  };

  const renderResultButton = () => {
    if (!importResult) return null;
    const { failCount, warnCount } = importResult;
    if (failCount > 0 && warnCount > 0) {
      return (
        <Button className="crm-btn crm-btn-primary" block style={{ height: '40px' }} onClick={() => handleDownloadErrorExcel(true)}>
          下载错误数据并查看警告数据
        </Button>
      );
    } else if (failCount > 0 && warnCount === 0) {
      return (
        <Button className="crm-btn crm-btn-primary" block style={{ height: '40px' }} onClick={() => handleDownloadErrorExcel(false)}>
          下载错误数据
        </Button>
      );
    } else if (failCount === 0 && warnCount > 0) {
      return (
        <Button className="crm-btn crm-btn-primary" block style={{ height: '40px' }} onClick={() => {
          setIsResultModalOpen(false);
          navigate(`/lead-temp/${importResult.batchNo}`);
        }}>
          查看警告数据
        </Button>
      );
    } else {
      return (
        <Button className="crm-btn crm-btn-primary" block style={{ height: '40px' }} onClick={() => setIsResultModalOpen(false)}>
          完成
        </Button>
      );
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
    getCheckboxProps: (record: any) => ({
      // 0/4/6 供批量分配，1/2 供批量重新分配（测试问题13）；仅已成交/已作废不可勾
      disabled: ![0, 1, 2, 4, 6].includes(record.leadStatus),
    }),
    selections: [
      {
        key: 'all',
        text: '全选 (当页)',
        onSelect: (changeableRowKeys: React.Key[]) => {
          setSelectedRowKeys(changeableRowKeys);
        },
      }
    ]
  };

  /** 重新分配入口：行内单条 / 批量勾选（PRD 4.3.1） */
  const STATUS_NAME: Record<number, string> = { 0: '待分配', 1: '待跟进', 2: '跟进中', 3: '已成交', 4: '已战败', 5: '已作废', 6: '回收待分配' };
  const openReassign = (records: any[]) => {
    if (!records.length) { message.warning('请选择要重新分配的线索'); return; }
    // 仅待跟进/跟进中可重新分配；含其他状态直接提示（PRD 4.3.1）
    const invalid = records.filter(r => ![1, 2].includes(r.leadStatus));
    if (invalid.length) {
      const names = [...new Set(invalid.map(r => STATUS_NAME[r.leadStatus] || '未知'))];
      message.error(`${names.join('、')}状态的线索不可重新分配，请重新勾选后重试！`);
      return;
    }
    setReassignLeads(records);
    setReassignAccountId(undefined);
    setReassignMoveOrders(true);
    setReassignOpen(true);
  };

  const submitReassign = async () => {
    if (!reassignAccountId) { message.warning('请选择分配的销售'); return; }
    setReassignLoading(true);
    try {
      const res: any = await request.post('/lead/reassign', {
        leadIds: reassignLeads.map(r => String(r.id)),
        accountId: reassignAccountId,
        moveOrders: reassignMoveOrders,
      }, { timeout: 120000 });
      if (res?.error) { message.error(res.message || '重新分配失败'); return; }
      setReassignOpen(false);
      setSelectedRowKeys([]);
      if (res.failCount > 0) {
        // 部分失败：可分配的已直接分配，失败明细弹框提示（PRD 4.3.1）
        Modal.info({
          title: '重新分配结果',
          centered: true,
          className: 'crm-unified-modal',
          content: (
            <div>
              <div>成功重新分配 {res.successCount}条，失败{res.failCount}条；{res.siblingCount ? `随客户一并转移 ${res.siblingCount} 条；` : ''}</div>
              <div style={{ marginTop: 8 }}>以下线索销售正在跟进中，请等待销售跟进结束再操作：{[...(res.failedCodes || []), ...(res.siblingLockedCodes || [])].join('，')}</div>
            </div>
          ),
        });
      } else {
        message.success(`成功重新分配 ${res.successCount}条${res.siblingCount ? `，客户名下其他线索随之转移 ${res.siblingCount} 条` : ''}`);
      }
      refreshLeads();
    } catch (e: any) {
      if (!e?.response) message.error(e?.message || '重新分配失败');
    } finally {
      setReassignLoading(false);
    }
  };

  const handleBatchAssign = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选需要分配的线索数据');
      return;
    }
    setAssignLeadIds(selectedRowKeys.map(String));
    setAssigneeId(undefined);
    setIsAssignModalOpen(true);
  };

  const submitAssign = async () => {
    if (!assigneeId) {
      message.error('请选择销售');
      return;
    }
    setAssignLoading(true);
    try {
      const res: any = await request.post('/lead/batch-assign', {
        leadIds: assignLeadIds,
        accountId: assigneeId
      }, { timeout: 120000 }); // 大批量分配耗时可能超过全局10秒超时
      if (res && res.error) {
        message.error(res.message || '分配失败');
        return;
      }
      message.success('分配成功');
      setIsAssignModalOpen(false);
      setSelectedRowKeys([]);
      refreshLeads();
    } catch (err: any) {
      message.error(err.message || err.response?.data?.message || '分配失败');
    } finally {
      setAssignLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <div className="table-card">
        <div className="filter-section">
          <LeadSearchForm form={form} onSearch={onSearch} salesList={salesList} storageScope="leads" />
        </div>

        <div className="table-header-actions">
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, display: 'inline-block' }}>全部线索</h3>
            {selectedRowKeys.length > 0 && <span style={{ marginLeft: 16, color: '#1890ff', fontSize: 14 }}>已选 {selectedRowKeys.length} 条数据</span>}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Button style={{ height: '36px' }} onClick={handleBatchAssign}>批量分配</Button>
            <Button style={{ height: '36px' }} onClick={() => openReassign((data as any[]).filter((l: any) => selectedRowKeys.includes(l.id)))}>重新分配</Button>
            <Button style={{ height: '36px' }} onClick={() => { 
              setIsImportModalOpen(true); 
              const task = getImportTask();
              if (task) {
                // 如果有正在进行的任务，保留进度，防止在此期间上传新文件
                setImportProgress({ phase: 'parsing', startedAt: task.startedAt, progressId: task.progressId });
              } else {
                setImportFile(null); 
                setImportProgress(null); 
              }
            }}>批量导入</Button>
            <Button type="primary" onClick={() => { setEditLeadId(undefined); handleAdd(); }} style={{ height: '36px', background: '#3b82f6' }}>+ 新增线索</Button>
          </div>
        </div>

        <ConfigProvider getPopupContainer={(trigger) => trigger?.parentElement || document.body}>
        <Table 
          className="custom-table"
          rowSelection={rowSelection}
          columns={columns} 
          dataSource={data} 
          rowKey="id" 
          loading={loading}
          locale={loading ? { emptyText: ' ' } : undefined}
          scroll={{ x: 'max-content' }}
          onChange={handleTableChange}
         pagination={{ 
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100', '200'],
            showTotal: (total) => `共 ${total} 条记录`,
          }}
        />
        </ConfigProvider>
      </div>

      {/* ===== 重新分配确认（PRD 配图 image35）===== */}
      <Modal
        centered
        title="重新分配确认"
        open={reassignOpen}
        onCancel={() => setReassignOpen(false)}
        onOk={submitReassign}
        confirmLoading={reassignLoading}
        okText="确认"
        cancelText="取消"
        width={440}
        className="crm-unified-modal"
      >
        <div style={{ marginBottom: '8px', color: '#1f2937' }}>是否连带线索未完结订单一并重新分配？</div>
        <div style={{ marginBottom: '12px', color: '#64748b', fontSize: '12px' }}>说明：客户将一并转给新销售——该客户名下原销售的其他未完结线索（待跟进/跟进中）随之转移，原销售不再看到该客户。</div>
        <Radio.Group value={reassignMoveOrders} onChange={e => setReassignMoveOrders(e.target.value)} style={{ marginBottom: '20px' }}>
          <Radio value={true}>是</Radio>
          <Radio value={false}>否</Radio>
        </Radio.Group>
        <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '6px' }}>请选择分配的销售</div>
        <Select
          style={{ width: '100%' }}
          placeholder="请选择销售"
          showSearch
          optionFilterProp="label"
          value={reassignAccountId}
          onChange={setReassignAccountId}
          options={salesList.map((sa: any) => ({ value: sa.id, label: sa.realName || sa.username }))}
        />
      </Modal>

      <LeadVoidModal
        open={!!voidLeadId}
        leadId={voidLeadId}
        onCancel={() => setVoidLeadId(null)}
        onSuccess={() => { setVoidLeadId(null); refreshLeads(); }}
      />

      <LeadAddModal 
        open={isModalOpen} 
        editId={editLeadId}
        isView={isViewModal}
        onCancel={() => { setIsModalOpen(false); setEditLeadId(undefined); setIsViewModal(false); }} 
        onSuccess={() => { setIsModalOpen(false); setEditLeadId(undefined); setIsViewModal(false); refreshLeads(); }} 
      />

      <Modal
        centered
        title="分配线索"
        open={isAssignModalOpen}
        onCancel={() => setIsAssignModalOpen(false)}
        onOk={submitAssign}
        confirmLoading={assignLoading}
        okText="确定分配"
        cancelText="取消"
        width={400}
        className="crm-unified-modal"
      >
        <div style={{ marginTop: 24, marginBottom: 24 }}>
          <div style={{ marginBottom: 8, color: '#666' }}>请选择分配的销售</div>
          <Select
            showSearch
            placeholder="请选择销售"
            style={{ width: '100%' }}
            value={assigneeId}
            onChange={setAssigneeId}
            options={salesList.map(s => ({
              label: s.realName || s.username,
              value: s.id
            }))}
            filterOption={(input, option) =>
              (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </div>
      </Modal>

      <Modal
        centered
        title="批量导入线索"
        open={isImportModalOpen}
        onCancel={() => { setIsImportModalOpen(false); setImportFile(null); }}
        footer={[
          <Button key="close" onClick={() => { setIsImportModalOpen(false); setImportFile(null); }} style={{ borderRadius: '6px' }}>关闭</Button>,
          !importProgress && <Button key="import" type="primary" loading={importing} onClick={handleImport} style={{ padding: '0 24px' }}>开始导入</Button>
        ].filter(Boolean)}
        width={640}
        className="crm-unified-modal"
      >
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#475569', fontSize: '14px' }}>第一步：下载导入模板，按格式填写数据</span>
          <Button type="primary" style={{ borderRadius: '6px' }} onClick={async () => {
            const workbook = new ExcelJS.Workbook();
            const ws = workbook.addWorksheet('线索导入模板');
            const headersInfo = [
              { name: '渠道来源', required: true }, { name: '线索来源方式', required: true }, { name: '来源日期', required: true }, { name: '客户姓名', required: false }, { name: '客户电话', required: true },
              { name: '车架号', required: false }, { name: '品牌', required: false }, { name: '车型', required: false }, { name: '款式', required: false }, { name: '车牌号', required: false }, { name: '发票日期', required: false }, { name: '里程数', required: false },
              { name: '里程≥4万公里（1：是；0：否）', required: false }, { name: '里程≥9.5万公里（1：是；0：否）', required: false },
              { name: '是否已购整车延保（1：是；0：否）', required: false }, { name: '是否已购电池延保（1：是；0：否）', required: false },
              { name: '是否已购安心保（1：是；0：否）', required: false }, { name: '是否已购轮胎保障（1：是；0：否）', required: false },
              { name: '意向商品名称', required: false }, { name: '意向商品编码', required: false }, { name: '意向赠品名称', required: false }
            ];
            const headerRow = ws.addRow(headersInfo.map(h => h.name));
            headerRow.eachCell((cell, colNumber) => {
              const info = headersInfo[colNumber - 1];
              if (info && info.required) {
                cell.value = {
                  richText: [
                    { text: info.name, font: { bold: true, color: { argb: 'FFFFFFFF' } } },
                    { text: ' *', font: { bold: true, color: { argb: 'FFFF0000' } } }
                  ]
                };
              } else {
                cell.value = info ? info.name : '';
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
              }
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
              cell.alignment = { horizontal: 'center' };
            });
            // 示例数据行
            ws.addRow([
              '抖音直播', '线上填单', '2026-07-16', '张三', '13800138000',
              'LSVAM4187C2123456', '比亚迪', '秦PLUS', 'DM-i 120KM旗舰型', '渝A12345', '2026-06-15', 50000, 
              '1', '0', 
              '0', '1', 
              '0', '0', 
              '延保服务', 'DM-i专属版', '车载充电器'
            ]);
            // 自动列宽
            ws.columns.forEach((col) => { col.width = 18; });
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '线索导入模板.xlsx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}>下载模板</Button>
        </div>
        
        <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '16px 20px', marginBottom: '32px', border: '1px solid #E2E8F0' }}>
          <div style={{ color: '#475569', marginBottom: '12px', fontWeight: 500 }}>模板包含字段（带 <span style={{ color: '#EF4444' }}>*</span> 为必填项）：</div>
          <div style={{ color: '#64748B', lineHeight: '28px', fontSize: '12px' }}>
            <span style={{ color: '#EF4444' }}>* 渠道来源 * 线索来源方式 * 来源日期 * 客户电话</span> 客户姓名 车架号 品牌 车型 款式 车牌号 发票日期 里程数 里程≥4万公里（1：是；0：否） 里程≥9.5万公里（1：是；0：否） 是否已购整车延保（1：是；0：否） 是否已购电池延保（1：是；0：否） 是否已购安心保（1：是；0：否） 是否已购轮胎保障（1：是；0：否） 意向商品名称 意向商品编码 意向赠品名称
          </div>
        </div>

        <div style={{ color: '#475569', marginBottom: '16px', fontSize: '14px' }}>第二步：上传填写好的数据文件 (仅支持 .csv, .xlsx)</div>
        
        {!importProgress && (
          <Upload.Dragger 
            accept=".csv,.xlsx" 
            style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '8px' }}
            beforeUpload={(file) => {
              setImportFile(file as any);
              return false;
            }}
            fileList={importFile ? [importFile as any] : []}
            onRemove={() => setImportFile(null)}
            showUploadList={true}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ color: '#94A3B8', fontSize: '32px' }} />
            </p>
            <p className="ant-upload-text" style={{ color: '#64748B', fontSize: '12px' }}>点击或将文件拖拽到此处上传</p>
          </Upload.Dragger>
        )}

        {importProgress && (() => {
          const p = importProgress;
          const fmtDur = (sec: number) => {
            if (!Number.isFinite(sec) || sec < 0) return '--';
            const s = Math.round(sec);
            if (s >= 3600) return `${Math.floor(s / 3600)}小时${Math.floor((s % 3600) / 60)}分`;
            if (s >= 60) return `${Math.floor(s / 60)}分${s % 60}秒`;
            return `${s}秒`;
          };
          const elapsedSec = ((p.finishedAt || Date.now()) - (p.startedAt || Date.now())) / 1000;
          // 校验阶段占 30%，写库阶段占 70%（写库为耗时大头）；用浮点比例估算，整数取整会让大文件前期恒为 0 导致预估失真
          let frac = 0;
          if (p.phase === 'done') frac = 1;
          else if (p.stage === 'validate' && p.stageTotal > 0) frac = (p.stageProcessed / p.stageTotal) * 0.3;
          else if (p.stage === 'insert' && p.stageTotal > 0) frac = 0.3 + (p.stageProcessed / p.stageTotal) * 0.7;
          const percent = Math.floor(frac * 100);
          const etaReady = p.stageProcessed >= 50 && frac > 0 && frac < 1 && elapsedSec > 3;
          const remainSec = etaReady ? elapsedSec * (1 - frac) / frac : 0;
          const stageText = p.phase === 'parsing' ? '正在解析文件…'
            : p.phase === 'error' ? `导入失败：${p.message || ''}`
            : p.phase === 'done' ? '导入完成'
            : p.stage === 'validate' ? `校验中 ${p.stageProcessed}/${p.stageTotal} 行`
            : `写入中 ${p.stageProcessed}/${p.stageTotal} 条`;
          return (
            <div style={{ marginTop: '20px', padding: '14px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#334155', fontSize: '14px', fontWeight: 500 }}>{stageText}</span>
                {p.phase === 'processing' && (
                  <span style={{ color: '#64748B', fontSize: '12px' }}>
                    成功 {p.successCount || 0} · 失败 {p.failCount || 0} · 冲突 {p.warnCount || 0}
                  </span>
                )}
              </div>
              <Progress
                percent={percent}
                status={p.phase === 'error' ? 'exception' : p.phase === 'done' ? 'success' : 'active'}
                strokeColor={p.phase === 'error' ? undefined : '#6366F1'}
              />
              {p.phase !== 'parsing' && (
                <div style={{ color: '#64748B', fontSize: '12px', marginTop: '4px' }}>
                  已用时 {fmtDur(elapsedSec)}
                  {p.phase === 'processing' && (etaReady
                    ? ` · 预计剩余 ${fmtDur(remainSec)} · 预计总耗时 ${fmtDur(elapsedSec + remainSec)}`
                    : ' · 预计剩余 计算中…')}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={isResultModalOpen}
        closable={true}
        onCancel={() => setIsResultModalOpen(false)}
        centered
        footer={null}
        width={400}
        styles={{ body: { padding: '32px 24px 24px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <CheckCircleFilled style={{ fontSize: '48px', color: '#10B981', marginBottom: '16px' }} />
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#1E293B' }}>数据校验完成</div>
        </div>

        <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#475569' }}>成功导入</span>
            <span><span style={{ color: '#10B981', fontWeight: 600, fontSize: '16px' }}>{importResult?.successCount || 0}</span> 条</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#475569' }}>警告待确认</span>
            <span><span style={{ color: '#F59E0B', fontWeight: 600, fontSize: '16px' }}>{importResult?.warnCount || 0}</span> 条</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#475569' }}>导入失败</span>
            <span><span style={{ color: '#EF4444', fontWeight: 600, fontSize: '16px' }}>{importResult?.failCount || 0}</span> 条</span>
          </div>
        </div>

        {renderResultButton()}
      </Modal>


    </div>
  );
};

export default LeadsManagement;
