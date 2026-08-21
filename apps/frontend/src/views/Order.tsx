import React, { useEffect, useState } from 'react';
import { Table, Form, Input, Button, Select, ConfigProvider, message, Modal } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import request from '../utils/request';
import { hasPerm } from '../utils/perm';
import './Leads.css';

/** 订单状态（PRD 4.2.2） */
export const ORDER_STATUS_OPTIONS = [
  { label: '待发送电子签', value: 0 },
  { label: '待签署电子签', value: 1 },
  { label: '待三方下单', value: 2 },
  { label: '待发货', value: 3 },
  { label: '已完结', value: 4 },
  { label: '已作废', value: 5 },
];

/** 状态标签样式（配色参照 PRD 配图 image4） */
export const getOrderStatusTag = (status: number) => {
  const map: Record<number, { text: string; className: string }> = {
    0: { text: '待发送电子签', className: 'crm-tag-warning' },
    1: { text: '待签署电子签', className: 'crm-tag-warning' },
    2: { text: '待三方下单', className: 'crm-tag-info' },
    3: { text: '待发货', className: 'crm-tag-info' },
    4: { text: '已完结', className: 'crm-tag-success' },
    5: { text: '已作废', className: 'crm-tag-default' },
  };
  const s = map[status] || { text: '未知', className: 'crm-tag-default' };
  return <span className={`crm-tag ${s.className}`}>{s.text}</span>;
};

/** 终态订单不可再操作 */
export const isOrderFinal = (status: number) => status === 4 || status === 5;

const OrderManagement: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // 作废弹框（PRD 4.2.3.1：作废需填写原因）
  const [voidTarget, setVoidTarget] = useState<any>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const userInfo = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();
  /** 仅订单跟进人具备操作权限（PRD 4.2.3）；超管不受限 */
  const canOperate = (record: any) =>
    userInfo.roleCode === 'super_admin' || String(record.salespersonId || '') === String(userInfo.id || '');

  const fetchOrders = async (values: any = {}, page = 1, limit = 10) => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      Object.keys(values).forEach(k => {
        if (values[k] !== undefined && values[k] !== null && values[k] !== '') params[k] = values[k];
      });
      const res: any = await request.get('/order', { params });
      setData(res.items || []);
      setTotal(res.total || 0);
      setPagination({ current: page, pageSize: limit });
    } catch (error) {
      console.error(error);
      message.error('获取订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const onSearch = () => fetchOrders(form.getFieldsValue(), 1, pagination.pageSize);
  const onReset = () => { form.resetFields(); fetchOrders({}, 1, pagination.pageSize); };
  const handleTableChange = (pag: any) => fetchOrders(form.getFieldsValue(), pag.current, pag.pageSize);

  const submitVoid = async () => {
    if (!voidReason.trim()) {
      message.warning('请填写作废原因');
      return;
    }
    setVoiding(true);
    try {
      await request.post(`/order/${voidTarget.id}/void`, { voidReason: voidReason.trim() });
      message.success('订单已作废！');
      setVoidTarget(null);
      setVoidReason('');
      fetchOrders(form.getFieldsValue(), pagination.current, pagination.pageSize);
    } catch (e: any) {
      if (!e?.response) message.error(e?.message || '作废失败');
    } finally {
      setVoiding(false);
    }
  };

  // 列与 PRD 配图 image4 对齐
  const columns: any[] = [
    { title: '序号', key: 'index', width: 60, fixed: 'left', render: (_: any, __: any, i: number) => (pagination.current - 1) * pagination.pageSize + i + 1 },
    { title: '订单编号', dataIndex: 'orderCode', width: 160, fixed: 'left' },
    { title: '客户姓名', key: 'customerName', width: 100, fixed: 'left', render: (_: any, r: any) => r.customer?.customerName || r.snapCustomerName || '-' },
    { title: '客户电话', key: 'customerPhone', width: 130, fixed: 'left', render: (_: any, r: any) => r.customer?.phone || r.snapCustomerPhone || '-' },
    { title: '车品牌', dataIndex: 'snapVehicleBrand', width: 100, render: (v: any) => v || '-' },
    { title: '车型', dataIndex: 'snapVehicleModel', width: 120, render: (v: any) => v || '-' },
    { title: '车架号', dataIndex: 'snapVehicleVin', width: 180, render: (v: any) => v || '-' },
    { title: '下单平台', dataIndex: 'orderPlatform', width: 110, render: (v: any) => v || '-' },
    { title: '平台订单编号', dataIndex: 'platformOrderNo', width: 150, render: (v: any) => v || '-' },
    { title: '三方订单编号', dataIndex: 'thirdOrderNo', width: 150, render: (v: any) => v || '-' },
    { title: '订单状态', dataIndex: 'orderStatus', width: 120, render: (v: number) => getOrderStatusTag(v) },
    { title: '实付金额', dataIndex: 'totalAmount', width: 120, render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '跟进人', key: 'salesperson', width: 100, render: (_: any, r: any) => r.salesperson?.realName || r.salesperson?.username || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-' },
    { title: '创建人', key: 'creator', width: 100, render: (_: any, r: any) => r.creator?.realName || r.creator?.username || '系统' },
    { title: '更新时间', dataIndex: 'updatedAt', width: 170, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-' },
    { title: '更新人', key: 'updater', width: 100, render: (_: any, r: any) => r.updater?.realName || r.updater?.username || '系统' },
    {
      title: '操作', key: 'action', width: 110, fixed: 'right',
      render: (_: any, record: any) => (
        <div className="action-links">
          <a onClick={() => navigate(`/order/detail/${record.id}`)}>详情</a>
          {/* 非终态且（跟进人或订单管理权限）且有作废权限时可作废（PRD 4.2.3 + 订单权限细分） */}
          {!isOrderFinal(record.orderStatus) && canOperate(record) && hasPerm('order:void', 'order') && (
            <a className="delete-link" onClick={() => { setVoidTarget(record); setVoidReason(''); }}>作废</a>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, background: '#ffffff', borderRadius: '16px', overflow: 'hidden' }}>
      <div className="table-card" style={{ borderRadius: '16px', border: 'none', boxShadow: 'none' }}>
        {/* ===== 筛选区（PRD 配图 image4）===== */}
        <div className="filter-section" style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
          <Form form={form} layout="inline" onFinish={onSearch} style={{ display: 'flex', width: '100%', alignItems: 'center', flexWrap: 'wrap', rowGap: '12px' }}>
            <Form.Item name="orderCode" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>订单编号</span>} style={{ marginRight: '24px' }}>
              <Input placeholder="请输入订单编号" allowClear style={{ width: '200px', height: '36px', borderRadius: '6px' }} />
            </Form.Item>
            <Form.Item name="orderStatus" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>订单状态</span>} style={{ marginRight: '24px' }}>
              <Select placeholder="全部" allowClear style={{ width: '160px', height: '36px' }} options={ORDER_STATUS_OPTIONS} />
            </Form.Item>
            <Form.Item name="customerPhone" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>客户手机号</span>} style={{ marginRight: '24px' }}>
              <Input placeholder="请输入手机号" allowClear style={{ width: '180px', height: '36px', borderRadius: '6px' }} />
            </Form.Item>
            <Form.Item name="customerName" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>客户姓名</span>} style={{ marginRight: '24px' }}>
              <Input placeholder="请输入客户姓名" allowClear style={{ width: '180px', height: '36px', borderRadius: '6px' }} />
            </Form.Item>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <Button onClick={onReset} className="crm-btn crm-btn-outline" style={{ height: '36px' }}>重置</Button>
              <Button htmlType="submit" style={{ height: '36px', padding: '0 20px', borderRadius: '6px', backgroundColor: '#3b82f6', color: '#fff', border: 'none' }}>查询</Button>
            </div>
          </Form>
        </div>

        <div className="table-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>订单列表</h3>
        </div>

        <ConfigProvider getPopupContainer={(trigger) => trigger?.parentElement || document.body}>
          <Table
            className="custom-table"
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            onChange={handleTableChange}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100', '200'],
              showTotal: (t) => `共 ${t} 条数据`,
            }}
            scroll={{ x: 'max-content' }}
          />
        </ConfigProvider>
      </div>

      {/* ===== 作废弹框（PRD 配图 image14）===== */}
      <Modal
        centered
        title="作废订单"
        open={!!voidTarget}
        onCancel={() => { setVoidTarget(null); setVoidReason(''); }}
        onOk={submitVoid}
        confirmLoading={voiding}
        okText="确定"
        cancelText="取消"
        width={600}
        className="crm-unified-modal"
      >
        <div style={{ marginBottom: '12px', color: '#4b5563' }}>
          订单 <span style={{ fontWeight: 600 }}>{voidTarget?.orderCode}</span> 作废后不可恢复，请填写作废原因：
        </div>
        <Input.TextArea
          value={voidReason}
          onChange={e => setVoidReason(e.target.value)}
          placeholder="请输入作废原因"
          maxLength={255}
          showCount
          rows={3}
        />
      </Modal>
    </div>
  );
};

export default OrderManagement;
