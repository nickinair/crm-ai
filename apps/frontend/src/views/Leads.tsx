import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Select, Modal, Row, Col, message, Tooltip, Upload, Table, ConfigProvider, Progress } from 'antd';
import { InboxOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ExcelJS from 'exceljs';
import dayjs from 'dayjs';
import { saveAs } from 'file-saver';
import request from '../utils/request';
import { startImportTask, clearImportTask, setImportModalVisible, getImportModalVisible, registerExpandModal, getImportTask } from '../utils/importTask';
import LeadAddModal from './LeadAddModal';
import { useDict } from '../hooks/useDict';
import './Leads.css';

const LeadsManagement: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [isAdvancedSearch, setIsAdvancedSearch] = useState(false);

  // ===== 常用搜索（收起态的4个槽位，按账号持久化）=====
  const DEFAULT_QUICK_KEYS = ['customerName', 'customerPhone', 'leadStatus', 'assignedAccountId'];
  const quickStorageKey = () => {
    try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return `crm-quick-search-${u.id || 'anon'}`; } catch { return 'crm-quick-search-anon'; }
  };
  const [quickSearchKeys, setQuickSearchKeys] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(quickStorageKey()) || 'null');
      if (Array.isArray(saved) && saved.length === 4) return saved;
    } catch { /* 忽略损坏的本地配置 */ }
    return DEFAULT_QUICK_KEYS;
  });
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [draftQuickKeys, setDraftQuickKeys] = useState<string[]>(DEFAULT_QUICK_KEYS);
  const [activeSlot, setActiveSlot] = useState(0);
  const { getDictOptions } = useDict();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModal, setIsViewModal] = useState(false);
  const [editLeadId, setEditLeadId] = useState<string | undefined>();
  
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  
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


  const fetchLeads = async (values: any = {}, page = 1, limit = 10) => {
    setLoading(true);
    try {
      const params: any = { ...values, page, limit };
      if (Array.isArray(params.leadStatus)) {
        params.leadStatus = params.leadStatus.join(',');
      }
      // Add sort params
      if (sortInfo.field) {
        params.sortField = sortInfo.field;
        params.sortOrder = sortInfo.order || 'descend';
      }
      const res = await request.get('/lead', { params });
      const items = (res as any).items || (Array.isArray(res) ? res : ((res as any).data || []));
      setData(items);
      setTotal((res as any).total || items.length);
      setPagination({ current: page, pageSize: limit });
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
    fetchLeads();
    fetchSales();
  }, []);

  const fetchSales = async () => {
    try {
      // 获取角色列表，找到销售角色
      const rolesRes: any = await request.get('/roles', { params: { pageSize: 100 } });
      const rolesList = rolesRes.data?.list || rolesRes.list || (Array.isArray(rolesRes) ? rolesRes : []);
      const salesRole = rolesList.find((r: any) => r.roleCode === 'sales' || r.roleName === '销售');
      
      const roleId = salesRole?.id;

      // 获取销售人员列表
      const res: any = await request.get('/account', { params: { limit: 100, roleId } });
      const items = res.items || (Array.isArray(res) ? res : (res.data || []));
      setSalesList(items);
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
      3: { text: '已完成', className: 'crm-tag-success' },
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
    const fieldStyle = { background: '#f5f7fa', padding: '6px 10px', borderRadius: 4, color: '#333', minHeight: 32, display: 'flex', alignItems: 'center', fontSize: 13 };
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
    { title: '线索状态', dataIndex: 'leadStatus', width: 100, render: (val: number) => getStatusTag(val) },
    { title: '客户沟通倾向', dataIndex: 'communicationTendency', width: 120, render: (val: string) => getPillTag(val) },
    { title: '呼叫结果', dataIndex: 'callResult', width: 100, render: (val: string) => getPillTag(val) },
    { title: '意向商品', key: 'intentProduct', width: 150, render: (_: any, record: any) => renderProducts(record.products, 1) },
    { title: '意向赠品', key: 'intentGift', width: 150, render: (_: any, record: any) => renderProducts(record.products, 2) },
    { title: '负责人', dataIndex: 'assignee', width: 100, render: (_: any, record: any) => record.assignee?.realName || record.assignee?.username || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (val: string) => val ? new Date(val).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-') : '-' },
    { title: '跟进天数', key: 'followUpDays', width: 100, render: (_: any, record: any) => record.firstFollowAt ? (Math.floor((new Date().setHours(0,0,0,0) - new Date(record.firstFollowAt).setHours(0,0,0,0)) / (1000 * 60 * 60 * 24)) + 1) : '-' },
    { title: '关联订单号', dataIndex: 'orderId', width: 120, fixed: 'right', render: (val: any) => val || '-' },
    { title: '操作', key: 'action', width: 150, fixed: 'right', render: (_: any, record: any) => {
        return (
          <div className="action-links">
            {[0, 6].includes(record.leadStatus) && (
              <a onClick={() => {
                setEditLeadId(record.id);
                setIsViewModal(false);
                setIsModalOpen(true);
              }}>编辑</a>
            )}
            
            {[1, 2, 3, 4, 5].includes(record.leadStatus) && (
              <a onClick={() => {
                setEditLeadId(record.id);
                setIsViewModal(true);
                setIsModalOpen(true);
              }}>详情</a>
            )}

            {[0, 4, 6].includes(record.leadStatus) && (
              <a onClick={() => {
                setAssignLeadIds([record.id]);
                setAssigneeId(undefined);
                setIsAssignModalOpen(true);
              }}>分配</a>
            )}

            {[0, 6].includes(record.leadStatus) && (
              <a className="delete-link" onClick={() => handleVoid(record.id)}>作废</a>
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
      disabled: ![0, 4, 6].includes(record.leadStatus),
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

  const handleVoid = (id: string) => {
    Modal.confirm({
      title: '提示',
      content: '作废后不可恢复，确定要作废吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await request.post(`/lead/${id}/void`);
          message.success('已作废');
          refreshLeads();
        } catch (err: any) {
          message.error(err.message || err.response?.data?.message || '操作失败');
        }
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <div className="table-card">
        <div className="filter-section">
          {(() => {
            const groupTitle = (text: string) => (
              <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 2px' }}>
                <span style={{ color: '#1F2937', fontSize: 15, fontWeight: 600, flexShrink: 0 }}>{text}</span>
                <span style={{ flex: 1, height: 1, background: '#EBEEF3' }} />
              </div>
            );
            const yesNoOptions = [{ value: '1', label: '是' }, { value: '0', label: '否' }];

            // 全部搜索字段注册表：key / 标签 / 分组 / 渲染器（发票日期、创建时间为复合区间字段）
            const searchFieldDefs: Array<{ key: string; label: string; group: string; render: () => React.ReactNode }> = [
              { key: 'customerName', label: '客户姓名', group: '基础信息', render: () => (
                <Form.Item name="customerName" label="客户姓名"><Input placeholder="请输入姓名" style={{ width: 140 }} allowClear /></Form.Item>) },
              { key: 'customerPhone', label: '客户电话', group: '基础信息', render: () => (
                <Form.Item name="customerPhone" label="客户电话"><Input placeholder="请输入电话" style={{ width: 140 }} allowClear /></Form.Item>) },
              { key: 'channelSource', label: '渠道来源', group: '基础信息', render: () => (
                <Form.Item name="channelSource" label="渠道来源"><Select placeholder="请选择" style={{ width: 140 }} allowClear options={getDictOptions('channel_source')} /></Form.Item>) },
              { key: 'sourceMethod', label: '线索来源方式', group: '基础信息', render: () => (
                <Form.Item name="sourceMethod" label="线索来源方式"><Select placeholder="请选择" style={{ width: 140 }} allowClear options={getDictOptions('lead_source_method')} /></Form.Item>) },
              { key: 'leadCode', label: '线索编码', group: '基础信息', render: () => (
                <Form.Item name="leadCode" label="线索编码"><Input placeholder="请输入线索编码" style={{ width: 150 }} allowClear /></Form.Item>) },
              { key: 'leadStatus', label: '线索状态', group: '基础信息', render: () => (
                <Form.Item name="leadStatus" label="线索状态">
                  <Select placeholder="请选择" style={{ width: 150 }} mode="multiple" allowClear maxTagCount="responsive">
                    <Select.Option value={0}>待分配</Select.Option>
                    <Select.Option value={1}>待跟进</Select.Option>
                    <Select.Option value={2}>跟进中</Select.Option>
                    <Select.Option value={3}>已完成</Select.Option>
                    <Select.Option value={4}>已战败</Select.Option>
                    <Select.Option value={5}>已作废</Select.Option>
                    <Select.Option value={6}>回收待分配</Select.Option>
                  </Select>
                </Form.Item>) },
              { key: 'assignedAccountId', label: '负责人', group: '基础信息', render: () => (
                <Form.Item name="assignedAccountId" label="负责人">
                  <Select placeholder="请选择" style={{ width: 140 }} allowClear showSearch optionFilterProp="label"
                    options={salesList.map((s: any) => ({ value: s.id, label: s.realName || s.username }))} />
                </Form.Item>) },
              { key: 'createdAt', label: '创建时间', group: '基础信息', render: () => (<>
                <Form.Item name="createdAtStart" label="创建时间"><Input type="date" style={{ width: 150 }} /></Form.Item>
                <Form.Item name="createdAtEnd" label="至" style={{ marginLeft: -8 }}><Input type="date" style={{ width: 150 }} /></Form.Item>
              </>) },

              { key: 'carModel', label: '车型', group: '车辆信息', render: () => (
                <Form.Item name="carModel" label="车型"><Input placeholder="请输入车型" style={{ width: 140 }} allowClear /></Form.Item>) },
              { key: 'carStyle', label: '款式', group: '车辆信息', render: () => (
                <Form.Item name="carStyle" label="款式"><Input placeholder="请输入款式" style={{ width: 140 }} allowClear /></Form.Item>) },
              { key: 'invoiceDate', label: '发票日期', group: '车辆信息', render: () => (<>
                <Form.Item name="invoiceDateStart" label="发票日期"><Input type="date" style={{ width: 150 }} /></Form.Item>
                <Form.Item name="invoiceDateEnd" label="至" style={{ marginLeft: -8 }}><Input type="date" style={{ width: 150 }} /></Form.Item>
              </>) },
              { key: 'vin', label: '车架号', group: '车辆信息', render: () => (
                <Form.Item name="vin" label="车架号"><Input placeholder="请输入车架号" style={{ width: 170 }} allowClear /></Form.Item>) },
              { key: 'vehicleAgeMin', label: '车龄（月）', group: '车辆信息', render: () => (
                <Form.Item name="vehicleAgeMin" label="车龄（月）"><Input type="number" min={0} placeholder="≥ 月数" style={{ width: 110 }} /></Form.Item>) },
              { key: 'mileageMin', label: '里程数', group: '车辆信息', render: () => (
                <Form.Item name="mileageMin" label="里程数"><Input type="number" min={0} placeholder="≥ 公里" style={{ width: 120 }} /></Form.Item>) },
              { key: 'isMileageOver40k', label: '里程≥4万公里', group: '车辆信息', render: () => (
                <Form.Item name="isMileageOver40k" label="里程≥4万公里"><Select placeholder="请选择" style={{ width: 100 }} allowClear options={yesNoOptions} /></Form.Item>) },
              { key: 'isMileageOver95k', label: '里程≥9.5万公里', group: '车辆信息', render: () => (
                <Form.Item name="isMileageOver95k" label="里程≥9.5万公里"><Select placeholder="请选择" style={{ width: 100 }} allowClear options={yesNoOptions} /></Form.Item>) },
              { key: 'hasExtendedWarranty', label: '是否已购整车延保', group: '车辆信息', render: () => (
                <Form.Item name="hasExtendedWarranty" label="是否已购整车延保"><Select placeholder="请选择" style={{ width: 100 }} allowClear options={yesNoOptions} /></Form.Item>) },
              { key: 'hasBatteryWarranty', label: '是否已购电池延保', group: '车辆信息', render: () => (
                <Form.Item name="hasBatteryWarranty" label="是否已购电池延保"><Select placeholder="请选择" style={{ width: 100 }} allowClear options={yesNoOptions} /></Form.Item>) },
              { key: 'hasPeaceOfMind', label: '是否已购安心保', group: '车辆信息', render: () => (
                <Form.Item name="hasPeaceOfMind" label="是否已购安心保"><Select placeholder="请选择" style={{ width: 100 }} allowClear options={yesNoOptions} /></Form.Item>) },
              { key: 'hasTireProtection', label: '是否已购轮胎保障', group: '车辆信息', render: () => (
                <Form.Item name="hasTireProtection" label="是否已购轮胎保障"><Select placeholder="请选择" style={{ width: 100 }} allowClear options={yesNoOptions} /></Form.Item>) },

              { key: 'isAddWechat', label: '添加微信状态', group: '跟进情况', render: () => (
                <Form.Item name="isAddWechat" label="添加微信状态"><Select placeholder="请选择" style={{ width: 130 }} allowClear options={getDictOptions('wechat_add_status')} /></Form.Item>) },
              { key: 'purchaseIntention', label: '购买意向', group: '跟进情况', render: () => (
                <Form.Item name="purchaseIntention" label="购买意向"><Select placeholder="请选择" style={{ width: 130 }} allowClear options={getDictOptions('purchase_intention')} /></Form.Item>) },
              { key: 'communicationTendency', label: '客户沟通倾向', group: '跟进情况', render: () => (
                <Form.Item name="communicationTendency" label="客户沟通倾向"><Select placeholder="请选择" style={{ width: 140 }} allowClear options={getDictOptions('communication_tendency')} /></Form.Item>) },
              { key: 'callResult', label: '呼叫结果', group: '跟进情况', render: () => (
                <Form.Item name="callResult" label="呼叫结果"><Select placeholder="请选择" style={{ width: 140 }} allowClear options={getDictOptions('call_result')} /></Form.Item>) },
              { key: 'intentProduct', label: '意向商品', group: '跟进情况', render: () => (
                <Form.Item name="intentProduct" label="意向商品"><Input placeholder="请输入商品名称" style={{ width: 150 }} allowClear /></Form.Item>) },
              { key: 'intentGift', label: '意向赠品', group: '跟进情况', render: () => (
                <Form.Item name="intentGift" label="意向赠品"><Input placeholder="请输入赠品名称" style={{ width: 150 }} allowClear /></Form.Item>) },
              { key: 'followDaysMin', label: '跟进天数', group: '跟进情况', render: () => (
                <Form.Item name="followDaysMin" label="跟进天数"><Input type="number" min={0} placeholder="精确天数" style={{ width: 110 }} /></Form.Item>) },
            ];
            const fieldMap: Record<string, typeof searchFieldDefs[number]> = Object.fromEntries(searchFieldDefs.map(f => [f.key, f]));
            const groups = ['基础信息', '车辆信息', '跟进情况'];

            const openQuickEdit = () => {
              setDraftQuickKeys([...quickSearchKeys]);
              setActiveSlot(0);
              setIsQuickEditOpen(true);
            };
            const saveQuickSearch = () => {
              setQuickSearchKeys(draftQuickKeys);
              try { localStorage.setItem(quickStorageKey(), JSON.stringify(draftQuickKeys)); } catch { /* 忽略 */ }
              setIsQuickEditOpen(false);
              message.success('常用搜索已更新');
            };

            return (<>
              <Form form={form} layout="inline" onFinish={onSearch} style={{ rowGap: 16 }}>
                {!isAdvancedSearch
                  ? quickSearchKeys.map(k => fieldMap[k] ? <React.Fragment key={k}>{fieldMap[k].render()}</React.Fragment> : null)
                  : groups.map(g => (
                      <React.Fragment key={g}>
                        {groupTitle(g)}
                        {searchFieldDefs.filter(f => f.group === g).map(f => <React.Fragment key={f.key}>{f.render()}</React.Fragment>)}
                      </React.Fragment>
                    ))}

                <Form.Item>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <Button htmlType="button" onClick={() => { form.resetFields(); onSearch({}); }} className="crm-btn crm-btn-outline" style={{ height: '36px' }}>
                      重置
                    </Button>
                    <Button htmlType="submit" className="crm-btn crm-btn-primary" style={{ height: '36px' }}>
                      查询
                    </Button>
                    <a
                      style={{ fontSize: 13, marginLeft: 4, color: '#3b82f6', cursor: 'pointer' }}
                      onClick={() => setIsAdvancedSearch(!isAdvancedSearch)}
                    >
                      {isAdvancedSearch ? '收起' : '高级搜索'}
                    </a>
                    <a
                      style={{ fontSize: 13, marginLeft: 4, color: '#3b82f6', cursor: 'pointer' }}
                      onClick={openQuickEdit}
                    >
                      编辑常用搜索
                    </a>
                  </div>
                </Form.Item>
              </Form>

              <Modal
                title="编辑常用搜索"
                open={isQuickEditOpen}
                onCancel={() => setIsQuickEditOpen(false)}
                centered
                width={780}
                className="crm-unified-modal"
                footer={[
                  <Button key="reset" onClick={() => { setDraftQuickKeys([...DEFAULT_QUICK_KEYS]); setActiveSlot(0); }} style={{ float: 'left' }}>恢复默认</Button>,
                  <Button key="cancel" onClick={() => setIsQuickEditOpen(false)}>取消</Button>,
                  <Button key="save" type="primary" onClick={saveQuickSearch}>保存</Button>,
                ]}
              >
                <div style={{ color: '#64748B', fontSize: 13, marginBottom: 12 }}>
                  先点击选中一个位置，再从下方字段中选择要放入的搜索项；每个字段只能使用一次。
                </div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                  {draftQuickKeys.map((k, i) => (
                    <div
                      key={i}
                      onClick={() => setActiveSlot(i)}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer',
                        border: activeSlot === i ? '2px solid #6366F1' : '1px solid #D1D5DB',
                        background: activeSlot === i ? '#EEF2FF' : '#F8FAFC',
                        color: '#1F2937', fontWeight: 500,
                      }}
                    >
                      <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 2 }}>位置 {i + 1}</div>
                      {fieldMap[k]?.label || '-'}
                    </div>
                  ))}
                </div>
                {groups.map(g => (
                  <div key={g} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 10px' }}>
                      <span style={{ color: '#1F2937', fontSize: 14, fontWeight: 600 }}>{g}</span>
                      <span style={{ flex: 1, height: 1, background: '#EBEEF3' }} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {searchFieldDefs.filter(f => f.group === g).map(f => {
                        const usedIdx = draftQuickKeys.indexOf(f.key);
                        const inActive = usedIdx === activeSlot;
                        const usedElsewhere = usedIdx !== -1 && !inActive;
                        return (
                          <div
                            key={f.key}
                            onClick={() => {
                              if (usedElsewhere || inActive) return;
                              setDraftQuickKeys(prev => { const next = [...prev]; next[activeSlot] = f.key; return next; });
                              setActiveSlot(s => Math.min(s + 1, 3));
                            }}
                            style={{
                              padding: '6px 14px', borderRadius: 16, fontSize: 13,
                              cursor: usedElsewhere ? 'not-allowed' : 'pointer',
                              border: inActive ? '1px solid #6366F1' : '1px solid #E2E8F0',
                              background: inActive ? '#EEF2FF' : usedElsewhere ? '#F1F5F9' : '#fff',
                              color: inActive ? '#4F46E5' : usedElsewhere ? '#B0B7C3' : '#334155',
                            }}
                          >
                            {f.label}{usedIdx !== -1 ? ` · 位置${usedIdx + 1}` : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </Modal>
            </>);
          })()}
        </div>

        <div className="table-header-actions">
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, display: 'inline-block' }}>全部线索</h3>
            {selectedRowKeys.length > 0 && <span style={{ marginLeft: 16, color: '#1890ff', fontSize: 14 }}>已选 {selectedRowKeys.length} 条数据</span>}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Button style={{ height: '36px' }} onClick={handleBatchAssign}>批量分配</Button>
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
          <div style={{ color: '#64748B', lineHeight: '28px', fontSize: '13px' }}>
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
            <p className="ant-upload-text" style={{ color: '#64748B', fontSize: '13px' }}>点击或将文件拖拽到此处上传</p>
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
                <span style={{ color: '#334155', fontSize: '13px', fontWeight: 500 }}>{stageText}</span>
                {p.phase === 'processing' && (
                  <span style={{ color: '#64748B', fontSize: '13px' }}>
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
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#1E293B' }}>数据校验完成</div>
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
