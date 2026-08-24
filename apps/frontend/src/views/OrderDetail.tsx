import React, { useEffect, useState } from 'react';
import { message, Modal, Input, Table, Empty } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import request from '../utils/request';
import { hasPerm } from '../utils/perm';
import { getOrderStatusTag, isOrderFinal } from './Order';
import './Customer360.css';
import './Workbench.css';

/**
 * 订单详情页（PRD 4.2.3 / 配图 image5、image6）
 * 结构：头部（编号+状态+跟进人+操作） → 订单基础信息 → 线索与客户 / 车辆信息 → 商品 → 赠品 → 操作日志
 */
const OrderDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 作废
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 录入三方订单编号
  const [thirdOpen, setThirdOpen] = useState(false);
  const [thirdNo, setThirdNo] = useState('');

  const userInfo = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
  })();

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const res: any = await request.get(`/order/${id}`);
      setOrder(res);
    } catch (e) {
      console.error(e);
      message.error('获取订单详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (id) fetchOrder(); }, [id]);

  /** 状态流转按钮仅订单跟进人本人可见（PRD 4.2.3；测试反馈：管理员等非跟进人只保留作废） */
  const canOperate = order
    && String(order.salespersonId || '') === String(userInfo.id || '')
    && !isOrderFinal(order.orderStatus);

  const doStatus = async (action: string, successText: string) => {
    setSubmitting(true);
    try {
      await request.post(`/order/${id}/status`, { action });
      message.success(successText);
      fetchOrder();
    } catch (e: any) {
      if (!e?.response) message.error(e?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  /** 已发送电子签（PRD 4.2.3.1） */
  const handleSendSign = () => {
    Modal.confirm({
      title: '提示', content: '确定已将电子签已发送给客户？',
      okText: '确定', cancelText: '取消', centered: true, className: 'crm-unified-modal',
      onOk: () => doStatus('sendSign', '订单状态修改成功！'),
    });
  };

  /** 已签署电子签（PRD 4.2.3.1） */
  const handleSigned = () => {
    Modal.confirm({
      title: '提示', content: '确定用户已完成电子签签署？',
      okText: '确定', cancelText: '取消', centered: true, className: 'crm-unified-modal',
      onOk: () => doStatus('signed', '订单状态修改成功！'),
    });
  };

  /** 已完成发货：先判断是否会一并完结线索（PRD 配图 image12） */
  const handleDelivered = async () => {
    try {
      const check: any = await request.get(`/order/${id}/complete-check`);
      if (check?.willCloseLead) {
        Modal.confirm({
          title: '提示',
          content: (
            <div>
              <div>1. 请确认三方平台订单已完结；</div>
              <div>2. 完结订单将一并完结线索；</div>
              <div style={{ marginTop: 8 }}>确定要完结订单吗？</div>
            </div>
          ),
          okText: '确定', cancelText: '取消', centered: true, className: 'crm-unified-modal',
          onOk: () => doStatus('delivered', '订单已完结！'),
        });
      } else {
        Modal.confirm({
          title: '提示', content: '提交后，订单将不可跟进，确定三方平台订单已完结？',
          okText: '确定', cancelText: '取消', centered: true, className: 'crm-unified-modal',
          onOk: () => doStatus('delivered', '订单已完结！'),
        });
      }
    } catch (e: any) {
      if (!e?.response) message.error(e?.message || '操作失败');
    }
  };

  const submitThirdNo = async () => {
    if (!thirdNo.trim()) { message.warning('请填写三方订单编号'); return; }
    setSubmitting(true);
    try {
      await request.put(`/order/${id}/third-order-no`, { thirdOrderNo: thirdNo.trim() });
      message.success('三方订单编号提交成功！');
      setThirdOpen(false);
      setThirdNo('');
      fetchOrder();
    } catch (e: any) {
      if (!e?.response) message.error(e?.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const submitVoid = async () => {
    if (!voidReason.trim()) { message.warning('请填写作废原因'); return; }
    setSubmitting(true);
    try {
      await request.post(`/order/${id}/void`, { voidReason: voidReason.trim() });
      message.success('订单已作废！');
      setVoidOpen(false);
      setVoidReason('');
      fetchOrder();
    } catch (e: any) {
      if (!e?.response) message.error(e?.message || '作废失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (!order) {
    return <div className="cd-container" style={{ minHeight: 400 }}>{loading ? '' : '订单不存在'}</div>;
  }

  const fmt = (v: any) => v || '-';
  const fmtTime = (v: any) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-';
  const person = (p: any) => p ? `${p.realName || p.username}（${p.username}）` : '系统（system）';

  const labelStyle: React.CSSProperties = { color: '#64748B', fontSize: '12px', marginBottom: '4px' };
  const valueStyle: React.CSSProperties = { color: '#E8ECF3', fontSize: '14px' };
  const cardStyle: React.CSSProperties = {
    background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px', padding: '20px', marginBottom: '16px',
  };
  const titleStyle: React.CSSProperties = {
    color: '#F8FAFC', fontSize: '16px', fontWeight: 600, marginBottom: '16px',
    borderLeft: '3px solid #6366F1', paddingLeft: '10px',
  };

  const itemColumns = (isGift: boolean) => [
    { title: isGift ? '赠品名称' : '商品名称', dataIndex: 'productName', render: (v: any) => fmt(v) },
    { title: '编码', dataIndex: 'productCode', render: (v: any) => fmt(v) },
    { title: '售价', dataIndex: 'unitPrice', render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '数量', dataIndex: 'quantity', render: (v: any) => v ?? 1 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      {/* ===== 头部：编号 + 状态 + 跟进人 + 操作按钮 ===== */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ color: '#F8FAFC', fontSize: '20px', fontWeight: 600 }}>订单编号</span>
          <span style={{ color: '#94A3B8', fontSize: '14px' }}>（{order.orderCode}）</span>
          {getOrderStatusTag(order.orderStatus)}
          <span style={{ color: '#94A3B8', fontSize: '12px', marginLeft: '12px' }}>
            跟进人：<span style={{ color: '#E8ECF3' }}>{person(order.salesperson)}</span>
          </span>
        </div>
        {(canOperate || (order && !isOrderFinal(order.orderStatus) && hasPerm('order'))) && (
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* 状态流转按钮仅跟进人可见；作废：跟进人或订单管理权限（管理侧）可见，
                其他销售查看他人订单时不可作废（测试反馈：不能作废别人的订单） */}
            {canOperate && order.orderStatus === 0 && <button className="call-btn btn-primary" disabled={submitting} onClick={handleSendSign}>已发送电子签</button>}
            {canOperate && order.orderStatus === 1 && <button className="call-btn btn-primary" disabled={submitting} onClick={handleSigned}>已签署电子签</button>}
            {canOperate && order.orderStatus === 2 && <button className="call-btn btn-primary" disabled={submitting} onClick={() => { setThirdNo(''); setThirdOpen(true); }}>录入三方订单编号</button>}
            {canOperate && order.orderStatus === 3 && <button className="call-btn btn-primary" disabled={submitting} onClick={handleDelivered}>已完成发货</button>}
            {hasPerm('order:void', 'order') && (canOperate || hasPerm('order')) && <button className="call-btn btn-secondary" disabled={submitting} onClick={() => { setVoidReason(''); setVoidOpen(true); }}>作废</button>}
          </div>
        )}
      </div>

      {/* ===== 订单基础信息 ===== */}
      <div style={cardStyle}>
        <div style={titleStyle}>订单基础信息</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px 24px' }}>
          <div><div style={labelStyle}>下单平台</div><div style={valueStyle}>{fmt(order.orderPlatform)}</div></div>
          <div><div style={labelStyle}>平台订单编号</div><div style={valueStyle}>{fmt(order.platformOrderNo)}</div></div>
          <div><div style={labelStyle}>三方订单编号</div><div style={valueStyle}>{fmt(order.thirdOrderNo)}</div></div>
          <div><div style={labelStyle}>实付金额</div><div style={{ ...valueStyle, color: '#F59E0B' }}>¥{Number(order.totalAmount || 0).toFixed(2)}</div></div>
          <div><div style={labelStyle}>营销活动</div><div style={valueStyle}>{fmt(order.marketingActivity)}</div></div>
          <div><div style={labelStyle}>创建时间 / 创建人</div><div style={valueStyle}>{fmtTime(order.createdAt)} / {person(order.creator)}</div></div>
          <div><div style={labelStyle}>更新时间 / 更新人</div><div style={valueStyle}>{fmtTime(order.updatedAt)} / {person(order.updater)}</div></div>
        </div>

        {/* 作废订单展示作废原因（PRD 配图 image6） */}
        {order.orderStatus === 5 && (
          <div style={{
            marginTop: '20px', padding: '14px 16px', borderRadius: '8px',
            border: '1px solid #EF4444', background: 'rgba(239, 68, 68, 0.06)',
          }}>
            <div style={{ color: '#EF4444', fontSize: '12px', marginBottom: '6px' }}>作废原因</div>
            <div style={{ color: '#EF4444', fontSize: '14px' }}>{fmt(order.voidReason)}</div>
          </div>
        )}
      </div>

      {/* ===== 线索与客户信息 / 车辆信息 ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={titleStyle}>线索与客户信息</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={labelStyle}>关联线索</div>
              <div style={valueStyle}>
                {order.leadId && order.snapLeadCode
                  ? <a style={{ color: '#818CF8' }} onClick={() => navigate(`/customer/360/${order.customerId}?leadId=${order.leadId}&from=leads`)}>{order.snapLeadCode}</a>
                  : '-'}
              </div>
            </div>
            <div><div style={labelStyle}>客户姓名</div><div style={valueStyle}>{fmt(order.customer?.customerName || order.snapCustomerName)}</div></div>
            <div><div style={labelStyle}>客户电话</div><div style={valueStyle}>{fmt(order.customer?.phone || order.snapCustomerPhone)}</div></div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={titleStyle}>车辆信息</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
            <div><div style={labelStyle}>品牌</div><div style={valueStyle}>{fmt(order.vehicle?.brand || order.snapVehicleBrand)}</div></div>
            <div><div style={labelStyle}>车型</div><div style={valueStyle}>{fmt(order.vehicle?.model || order.snapVehicleModel)}</div></div>
            <div><div style={labelStyle}>车架号(VIN)</div><div style={valueStyle}>{fmt(order.vehicle?.vin || order.snapVehicleVin)}</div></div>
            <div><div style={labelStyle}>发票日期</div><div style={valueStyle}>{fmt(order.vehicle?.purchaseDate)}</div></div>
          </div>
        </div>
      </div>

      {/* ===== 商品信息 ===== */}
      <div style={cardStyle}>
        <div style={{ ...titleStyle, borderLeftColor: '#F59E0B' }}>商品信息</div>
        <Table
          className="workbench-table"
          columns={itemColumns(false)}
          dataSource={order.products || []}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无商品" style={{ margin: '24px auto' }} /> }}
        />
      </div>

      {/* ===== 赠品信息 ===== */}
      <div style={cardStyle}>
        <div style={{ ...titleStyle, borderLeftColor: '#A78BFA' }}>赠品信息</div>
        <Table
          className="workbench-table"
          columns={itemColumns(true)}
          dataSource={order.gifts || []}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无赠品" style={{ margin: '24px auto' }} /> }}
        />
      </div>

      {/* ===== 订单操作日志（PRD 4.3.3 日志结构：操作类型/操作人/操作时间/操作内容）===== */}
      <div style={cardStyle}>
        <div style={titleStyle}>订单操作日志</div>
        {(order.operationLogs || []).length === 0 && <div style={{ color: '#64748B', fontSize: '14px' }}>暂无操作日志</div>}
        {(order.operationLogs || []).map((log: any) => (
          <div key={log.id} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', marginTop: '6px', flexShrink: 0 }} />
            <div>
              <div style={{ color: '#E8ECF3', fontSize: '14px' }}>{log.action}</div>
              <div style={{ color: '#94A3B8', fontSize: '12px', marginTop: '2px' }}>操作人：{log.operator}</div>
              <div style={{ color: '#94A3B8', fontSize: '12px' }}>操作内容：{log.content}</div>
              <div style={{ color: '#64748B', fontSize: '12px', marginTop: '2px' }}>{dayjs(log.createdAt).format('YYYY-MM-DD HH:mm')}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== 录入三方订单编号弹框（PRD 4.2.3.1）===== */}
      <Modal
        centered title="录入三方订单编号" open={thirdOpen}
        onCancel={() => setThirdOpen(false)} onOk={submitThirdNo} confirmLoading={submitting}
        okText="确定" cancelText="取消" width={740} className="crm-unified-modal"
      >
        {/* 其他字段回显不可编辑，仅三方订单编号可填 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>订单编号</div>
            <Input value={order.orderCode} disabled />
          </div>
          <div>
            <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>下单平台</div>
            <Input value={order.orderPlatform || ''} disabled />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>平台订单编号</div>
            <Input value={order.platformOrderNo || ''} disabled />
          </div>
        </div>
        <div>
          <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: '#ef4444' }}>*</span> 三方订单编号
          </div>
          <Input
            value={thirdNo}
            onChange={e => setThirdNo(e.target.value)}
            placeholder="请输入三方订单编号"
            maxLength={30}
            showCount
          />
        </div>
      </Modal>

      {/* ===== 作废弹框（PRD 配图 image14）===== */}
      <Modal
        centered title="作废订单" open={voidOpen}
        onCancel={() => setVoidOpen(false)} onOk={submitVoid} confirmLoading={submitting}
        okText="确定" cancelText="取消" width={600} className="crm-unified-modal"
      >
        <div style={{ marginBottom: '12px', color: '#4b5563' }}>
          订单 <span style={{ fontWeight: 600 }}>{order.orderCode}</span> 作废后不可恢复，请填写作废原因：
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

export default OrderDetail;
