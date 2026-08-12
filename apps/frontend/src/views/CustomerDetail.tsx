import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, message, Modal, Form, Input, Select, Table } from 'antd';
import { EditOutlined, WarningOutlined, InboxOutlined, DeleteOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, MinusCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../utils/request';
import { useDict } from '../hooks/useDict';
import { maskPhone, maskIdCard } from '../utils/mask';
import EditCustomerModal from './Customer360EditCustomerModal';
import LeadAddModal from './LeadAddModal';
import OrderCreateModal from '../components/OrderCreateModal';
import { getOrderStatusTag } from './Order';
import LinkVehicleModal from './LinkVehicleModal';
import LoadingLogo from '../components/LoadingLogo';
import EditVehicleModal from './EditVehicleModal';
import FollowAddModal from './FollowAddModal';
import './CustomerDetail.css';
import './Workbench.css';

// Removed unused Option

const leadStatusMap: Record<number, { label: string; color: string }> = {
  0: { label: '待分配', color: '#94A3B8' },
  1: { label: '待跟进', color: '#FBBF24' },
  2: { label: '跟进中', color: '#38BDF8' },
  3: { label: '已成交', color: '#10B981' },
  4: { label: '已战败', color: '#F87171' },
  5: { label: '已作废', color: '#94A3B8' },
  6: { label: '回收待分配', color: '#94A3B8' },
};

const CustomerDetail: React.FC = () => {
  const { getDictOptions } = useDict();
  const wechatColor = (v: string) => (v === '已通过' || v === '已添加') ? '#52c41a'
    : v === '添加待通过' ? '#F97316'
    : v === '拒绝添加' ? '#F87171'
    : '#94A3B8';
  const wechatIcon = (v: string) => (v === '已通过' || v === '已添加') ? <CheckCircleOutlined />
    : v === '添加待通过' ? <ClockCircleOutlined />
    : v === '拒绝添加' ? <CloseCircleOutlined />
    : <MinusCircleOutlined />;
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ctxLeadId = searchParams.get('leadId');
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  
  const [editCustomerVisible, setEditCustomerVisible] = useState(false);
  const [addLeadVisible, setAddLeadVisible] = useState(false);
  // 创建订单（客户360入口，PRD 4.2.5.1：客户信息带入且不可编辑）
  const [orderCreateVisible, setOrderCreateVisible] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);

  const fetchCustomerOrders = async (custId: string) => {
    try {
      const res: any = await request.get(`/order/customer/${custId}`);
      setCustomerOrders(Array.isArray(res) ? res : []);
    } catch { setCustomerOrders([]); }
  };
  const [addFollowUpVisible, setAddFollowUpVisible] = useState(false);
  const [addNoteVisible, setAddNoteVisible] = useState(false);
  const [linkVehicleVisible, setLinkVehicleVisible] = useState(false);
  
  // Removed unused wechatDict
  const [isEditingWechat, setIsEditingWechat] = useState(false);
  
  const [noteForm] = Form.useForm();
  const [activeTabKey, setActiveTabKey] = useState<string>("1");
  const [isReturnModalVisible, setIsReturnModalVisible] = useState(false);
  const [returnLeadId, setReturnLeadId] = useState<number | null>(null);
  const [editVehicleVisible, setEditVehicleVisible] = useState(false);
  const [editVehicleInfo, setEditVehicleInfo] = useState<any>(null);
  const [deleteVehicleId, setDeleteVehicleId] = useState<number | null>(null);
  const [deleteVehicleVisible, setDeleteVehicleVisible] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await request.get(`/customer/360/${id}`) as any;
      if (res && res.id) {
        setData(res);
        fetchCustomerOrders(String(res.id));
      } else {
        message.error('加载客户数据失败');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // fetchDicts removed

  const updateWechatStatus = async (val: string) => {
    try {
      const res = await request.put(`/customer/${id}`, { wechatStatus: val }) as any;
      if (res && res.id) {
        message.success('微信状态更新成功');
        setData((prev: any) => ({ ...prev, wechatStatus: val }));
        setIsEditingWechat(false);
      } else {
        message.error('更新失败');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddNote = async () => {
    try {
      const values = await noteForm.validateFields();
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : {};
      await request.post(`/customer/${id}/notes`, {
        noteContent: values.noteContent,
        accountId: user.id,
      });
      message.success('备注添加成功');
      setAddNoteVisible(false);
      noteForm.resetFields();
      fetchData();
    } catch (e: any) {
      message.error(e.message || '添加失败');
    }
  };

  const handleAddLeadClick = () => {
    if (data?.leads) {
      const hasUnfinished = data.leads.some((l: any) => [0, 1, 2, 6].includes(l.lead_status));
      if (hasUnfinished) {
        message.warning('当前客户存在未完成的线索，不可新增线索！');
        return;
      }
    }
    setAddLeadVisible(true);
  };

  const handleReturnConfirm = async () => {
    if (!returnLeadId) return;
    try {
      await request.post('/lead/return-public', { leadIds: [returnLeadId] });
      message.success('退回成功');
      setIsReturnModalVisible(false);
      setReturnLeadId(null);
      fetchData();
    } catch (e) {
      message.error('退回失败');
    }
  };

  // Compute wechat status color class
  const getWechatClass = (status: string) => {
    if (status === '已添加' || status === '已通过') return 'cd-wechat-added';
    if (status === '添加待通过') return 'cd-wechat-pending';
    if (status === '添加中') return 'cd-wechat-pending';
    return 'cd-wechat-not-added';
  };

  // 从已成交/已战败线索跳转进来时（URL 带 leadId），页面隐藏操作按钮
  const ctxLead = ctxLeadId ? data?.leads?.find((l: any) => String(l.id) === String(ctxLeadId)) : null;
  const isCtxLeadClosed = !!ctxLead && [3, 4].includes(Number(ctxLead.lead_status));

  // Get active lead status label
  const getLeadStatusLabel = () => {
    if (!data?.leads || data.leads.length === 0) return null;
    const activeLead = data.leads.find((l: any) => l.lead_status !== 4 && l.lead_status !== 5);
    if (!activeLead) return null;
    const st = leadStatusMap[activeLead.lead_status];
    return st ? st.label : '未知';
  };

  // Get customer tags (e.g. 反感高频外呼)
  const getCustomerTags = () => {
    const tags: { label: string; type: string }[] = [];
    if (data?.blacklistMark && data.blacklistMark !== '无') {
      tags.push({ label: data.blacklistMark, type: 'warning' });
    }
    return tags;
  };

  // Empty state with icon (matches image 4)
  const renderEmpty = (text: string = '暂无数据') => (
    <div className="cd-empty-state">
      <InboxOutlined className="cd-empty-icon" />
      <div className="cd-empty-text">{text}</div>
    </div>
  );

  // Tag color for follow record tags
  const getFollowTagColor = (key: string, value?: string): string => {
    if (key === 'callResult' && value) {
      if (value === '成功接通') return 'tag-green';
      if (value === '客户主动挂断') return 'tag-orange';
      // 无人接听、空号、关机、占线 → 红色
      return 'tag-red';
    }
    const map: Record<string, string> = {
      callResult: 'tag-green',
      communicationTendency: 'tag-red',
      purchaseIntention: 'tag-yellow',
      nextFollowAt: 'tag-purple',
      leadStatus: 'tag-blue',
    };
    return map[key] || 'tag-green';
  };

  if (loading || !data) {
    return <LoadingLogo />;
  }

  const statusLabel = getLeadStatusLabel();
  const customerTags = getCustomerTags();
  const wechatStatus = data.wechatStatus || '未添加';

  return (
    <div className="customer-detail-page">
      {/* ── 顶部：客户名称 + 标签 + 操作 ───────────── */}
      <div className="cd-top-section">
        <div className="cd-customer-name-row">
          <div className="cd-name-left">
            <span className="cd-customer-name">{data.customerName || '未命名客户'}</span>
            <EditOutlined className="cd-edit-icon" onClick={() => setEditCustomerVisible(true)} />
            {customerTags.map((t, i) => (
              <span key={i} className={`cd-tag cd-tag-${t.type}`}>
                <WarningOutlined /> {t.label}
              </span>
            ))}
            {statusLabel && <span className="cd-tag cd-tag-primary">{statusLabel}</span>}
          </div>
          <div className="cd-actions">
            <button className="cd-action-btn" onClick={() => setOrderCreateVisible(true)}>创建订单</button>
            <button className="cd-action-btn" onClick={handleAddLeadClick}>新增线索</button>
            {!isCtxLeadClosed && <>
              <button className="cd-action-btn" onClick={() => setLinkVehicleVisible(true)}>关联车辆</button>
              <button className="cd-action-btn" onClick={() => setAddFollowUpVisible(true)}>新增跟进记录</button>
            </>}
          </div>
        </div>

        {/* ── 信息卡片 ───────────────────────────────── */}
        <div className="cd-info-card">
          <div className="cd-info-grid">
            <div className="cd-info-item">
              <div className="cd-info-label">手机号</div>
              <div className="cd-info-value">{maskPhone(data.phone)}</div>
            </div>
            <div className="cd-info-item">
              <div className="cd-info-label">身份证号</div>
              <div className="cd-info-value">{maskIdCard(data.idCardNo)}</div>
            </div>
            <div className="cd-info-item">
              <div className="cd-info-label">性别</div>
              <div className="cd-info-value">{data.gender === 1 ? '男' : data.gender === 2 ? '女' : '未知'}</div>
            </div>
            <div className="cd-info-item">
              <div className="cd-info-label">生日</div>
              <div className="cd-info-value">{data.birthday ? dayjs(data.birthday).format('YYYY-MM-DD') : '-'}</div>
            </div>
            <div className="cd-info-item">
              <div className="cd-info-label">微信状态</div>
              <div className="cd-info-value">
                {isEditingWechat ? (
                  <Select
                    value={wechatStatus}
                    onChange={updateWechatStatus}
                    onBlur={() => setIsEditingWechat(false)}
                    autoFocus
                    style={{ width: '150px' }}
                    popupMatchSelectWidth={false}
                    labelRender={(p: any) => {
                      const v = String(p.value ?? '');
                      return <span style={{ color: wechatColor(v), display: 'inline-flex', alignItems: 'center', gap: 4 }}>{wechatIcon(v)}{v || '未添加'}</span>;
                    }}
                  >
                  {getDictOptions('wechat_add_status').map(o => (
                    <Select.Option key={o.value} value={o.value}>
                      <span style={{ color: wechatColor(o.value), display: 'flex', alignItems: 'center', gap: '4px' }}>{wechatIcon(o.value)}{o.label}</span>
                    </Select.Option>
                  ))}
                  </Select>
                ) : (
                  <span 
                    className={`cd-wechat-status ${getWechatClass(wechatStatus)}`}
                    onClick={() => setIsEditingWechat(true)}
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span style={{ color: wechatColor(wechatStatus), display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {wechatIcon(wechatStatus)}{wechatStatus}
                    </span>
                    <EditOutlined className="cd-edit-icon" style={{ marginLeft: '4px' }} />
                  </span>
                )}
              </div>
            </div>
            <div className="cd-info-item">
              <div className="cd-info-label">归属销售</div>
              <div className="cd-info-value">{data.ownerName || '-'}</div>
            </div>
            <div className="cd-info-item">
              <div className="cd-info-label">黑名单标记</div>
              <div className="cd-info-value">{data.blacklistMark || '无'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────── */}
      <Tabs activeKey={activeTabKey} onChange={(key) => setActiveTabKey(key)} className="cd-tabs">
        {/* ──── 名下全部车辆 ──── */}
        <Tabs.TabPane tab="名下全部车辆" key="1">
          {data.vehicles && data.vehicles.length > 0 ? (
            <div className="cd-vehicle-grid">
              {data.vehicles.map((v: any) => (
                <div key={v.id} className={`cd-vehicle-card${v.vehicleStatus !== 1 ? ' unbound' : ''}`}>
                  {/* Header: plate + icons + status */}
                  <div className="cd-vehicle-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`cd-vehicle-plate${v.vehicleStatus !== 1 ? ' unbound' : ''}`}>{v.plateNo || '-'}</span>
                      <span className="cd-vehicle-actions">
                        <EditOutlined
                          style={{ color: '#818CF8', fontSize: '14px', cursor: 'pointer' }}
                          onClick={() => { setEditVehicleInfo(v); setEditVehicleVisible(true); }}
                        />
                        <DeleteOutlined
                          style={{ color: '#F87171', fontSize: '14px', cursor: 'pointer' }}
                          onClick={() => { setDeleteVehicleId(v.id); setDeleteVehicleVisible(true); }}
                        />
                      </span>
                    </div>
                    <span className={`cd-vehicle-status ${v.vehicleStatus === 1 ? 'status-normal' : 'status-unbound'}`}>
                      {v.vehicleStatus === 1 ? '正常使用' : '已解绑'}
                    </span>
                  </div>
                  {/* Details grid */}
                  <div className="cd-vehicle-details">
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">品牌</span>
                      <span className="cd-vehicle-value">{v.brand || '-'}</span>
                    </div>
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">车型</span>
                      <span className="cd-vehicle-value">{v.model || '-'}</span>
                    </div>
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">款式</span>
                      <span className="cd-vehicle-value">{v.style || '-'}</span>
                    </div>
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">VIN码</span>
                      <span className="cd-vehicle-value">{v.vin || '-'}</span>
                    </div>
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">发票日期</span>
                      <span className="cd-vehicle-value">{v.purchaseDate || '-'}</span>
                    </div>
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">里程数</span>
                      <span className="cd-vehicle-value">{v.mileage ? `${Number(v.mileage).toLocaleString()}km` : '-'}</span>
                    </div>
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">车龄（月）</span>
                      <span className="cd-vehicle-value">{v.vehicleAge ? `${v.vehicleAge}个月` : '-'}</span>
                    </div>
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">里程≥ 4万公里</span>
                      <span className={`cd-vehicle-value ${v.isMileageOver40k === '是' || v.isMileageOver40k === '1' || (v.mileage && Number(v.mileage) >= 40000) ? 'yes' : ''}`}>
                        {v.isMileageOver40k === '是' || v.isMileageOver40k === '1' || (v.mileage && Number(v.mileage) >= 40000) ? '是' : '否'}
                      </span>
                    </div>
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">里程≥9.5万公里</span>
                      <span className={`cd-vehicle-value ${v.isMileageOver95k === '是' || v.isMileageOver95k === '1' || (v.mileage && Number(v.mileage) >= 95000) ? 'yes' : ''}`}>
                        {v.isMileageOver95k === '是' || v.isMileageOver95k === '1' || (v.mileage && Number(v.mileage) >= 95000) ? '是' : '否'}
                      </span>
                    </div>
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">是否已购整车延保</span>
                      <span className={`cd-vehicle-value ${v.hasExtendedWarranty === '是' || v.hasExtendedWarranty === '1' ? 'yes' : ''}`}>
                        {v.hasExtendedWarranty === '是' || v.hasExtendedWarranty === '1' ? '是' : '否'}
                      </span>
                    </div>
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">是否已购电池延保</span>
                      <span className={`cd-vehicle-value ${v.hasBatteryWarranty === '是' || v.hasBatteryWarranty === '1' ? 'yes' : ''}`}>
                        {v.hasBatteryWarranty === '是' || v.hasBatteryWarranty === '1' ? '是' : '否'}
                      </span>
                    </div>
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">是否已购安心保</span>
                      <span className={`cd-vehicle-value ${v.hasPeaceOfMind === '是' || v.hasPeaceOfMind === '1' ? 'yes' : ''}`}>
                        {v.hasPeaceOfMind === '是' || v.hasPeaceOfMind === '1' ? '是' : '否'}
                      </span>
                    </div>
                    <div className="cd-vehicle-detail-item">
                      <span className="cd-vehicle-label">是否已购轮胎保障</span>
                      <span className={`cd-vehicle-value ${v.hasTireProtection === '是' || v.hasTireProtection === '1' ? 'yes' : ''}`}>
                        {v.hasTireProtection === '是' || v.hasTireProtection === '1' ? '是' : '否'}
                      </span>
                    </div>
                  </div>
                  {/* Unbound reason */}
                  {v.vehicleStatus !== 1 && v.remark && (
                    <div className="cd-vehicle-reason">
                      <div className="cd-reason-label">解绑原因</div>
                      <div className="cd-reason-text">{v.remark}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            renderEmpty('暂无车辆信息')
          )}
        </Tabs.TabPane>

        {/* ──── 客户跟进记录 ──── */}
        <Tabs.TabPane tab="客户跟进记录" key="2">
          {data.follows && data.follows.length > 0 ? (
            <div className="cd-follow-list">
              {data.follows.map((f: any, idx: number) => (
                <div key={f.id || idx} className="cd-follow-item">
                  <div className="cd-follow-header">
                    <span>
                      <strong>{f.accountName || (String(f.accountId) === '0' ? '系统' : '销售')}{f.accountUsername ? ` (${f.accountUsername})` : ''}</strong>
                      {f.leadCode && <><span className="divider">|</span>线索: {f.leadCode}</>}
                      <span className="divider">|</span>
                      {f.followTime ? dayjs(f.followTime).format('YYYY-MM-DD HH:mm') : '-'}
                    </span>
                  </div>
                  <div className="cd-follow-tags">
                    {f.callResult && <span className={`cd-follow-tag ${getFollowTagColor('callResult', f.callResult)}`}>呼叫结果: {f.callResult}</span>}
                    {f.communicationTendency && <span className={`cd-follow-tag ${getFollowTagColor('communicationTendency')}`}>沟通倾向: {f.communicationTendency}</span>}
                    {f.purchaseIntention && <span className={`cd-follow-tag ${getFollowTagColor('purchaseIntention')}`}>购买意向: {f.purchaseIntention}</span>}
                    {f.nextFollowAt && <span className={`cd-follow-tag ${getFollowTagColor('nextFollowAt')}`}>下次回访: {dayjs(f.nextFollowAt).format('YYYY-MM-DD HH:mm')}</span>}
                    {f.leadStatus !== undefined && f.leadStatus !== null && <span className={`cd-follow-tag ${getFollowTagColor('leadStatus')}`}>线索状态: {f.leadStatus === 0 ? '待分配' : f.leadStatus === 1 ? '待跟进' : f.leadStatus === 2 ? '跟进中' : f.leadStatus === 3 ? '已成交' : '已战败'}</span>}
                  </div>
                  <div className="cd-follow-content">{f.followContent || '-'}</div>
                </div>
              ))}
            </div>
          ) : (
            renderEmpty('暂无跟进记录')
          )}
        </Tabs.TabPane>

        {/* ──── 客户备注 ──── */}
        <Tabs.TabPane tab="客户备注" key="3">
          <div className="cd-notes-header">
            <button className="cd-action-btn cd-action-btn-primary" onClick={() => setAddNoteVisible(true)}>添加备注</button>
          </div>
          {data.notes && data.notes.length > 0 ? (
            <div className="cd-notes-list">
              {data.notes.map((n: any) => (
                <div key={n.id} className="cd-note-item">
                  <div className="cd-note-header">
                    {n.createdByName || '未知'}{n.createdByAccount ? ` (${n.createdByAccount})` : ''}
                    <span className="divider">|</span>
                    {n.createdAt ? dayjs(n.createdAt).format('YYYY-MM-DD HH:mm') : '-'}
                  </div>
                  <div className="cd-note-content">{n.noteContent}</div>
                </div>
              ))}
            </div>
          ) : (
            renderEmpty('暂无客户备注')
          )}
        </Tabs.TabPane>

        {/* ──── 历史线索 ──── */}
        <Tabs.TabPane tab="历史线索" key="4">
          {data.leads && data.leads.length > 0 ? (
            <div className="cd-leads-table-wrapper">
              <Table
                dataSource={data.leads}
                rowKey="id"
                pagination={false}
                scroll={{ x: 1600 }}
                className="workbench-table"
                columns={[
                  { title: '线索ID', dataIndex: 'lead_code', key: 'lead_code', width: 120, fixed: 'left' as const, render: (v: string) => <span style={{ color: '#818CF8', fontWeight: 600 }}>{v || '-'}</span> },
                  { title: '线索来源', dataIndex: 'channel_source', key: 'channel_source', width: 100, render: (v: string) => v || '-' },
                  { title: '线索来源方式', dataIndex: 'source_method', key: 'source_method', width: 110, render: (v: string) => v || '-' },
                  { title: '车架号', dataIndex: 'vin', key: 'vin', width: 140, render: (_v: string, record: any) => {
                    const vehicle = data.vehicles?.find((veh: any) => String(veh.id) === String(record.vehicle_id));
                    return vehicle?.vin || '-';
                  }},
                  { title: '意向商品', dataIndex: 'intentProduct', key: 'intentProduct', width: 100, render: (v: string) => v || '-' },
                  { title: '意向赠品', dataIndex: 'intentGift', key: 'intentGift', width: 100, render: (v: string) => v || '-' },
                  { title: '线索状态', dataIndex: 'lead_status', key: 'lead_status', width: 80, render: (v: number) => {
                    const st = leadStatusMap[v];
                    return st ? <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span> : '未知';
                  }},
                  { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 110, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
                  { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', width: 110, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
                  { title: '结束时间', key: 'endTime', width: 110, render: (_v: any, record: any) => {
                    const isEndState = record.lead_status === 3 || record.lead_status === 4 || record.lead_status === 5;
                    return isEndState && record.updated_at ? dayjs(record.updated_at).format('YYYY-MM-DD') : '-';
                  }},
                  { title: '归属销售', key: 'assignedAccountName', width: 90, render: (_v: any, record: any) => record.assignedAccountName || '-' },
                  { title: '操作', key: 'action', width: 150, fixed: 'right' as const, render: (_v: any, record: any) => (
                    <div className="action-links">
                      <a style={{ color: '#6366F1', marginRight: 12 }} onClick={() => navigate(`/customer/360/${id}?leadId=${record.id}`)}>查看</a>
                      {[0, 1, 2, 6].includes(record.lead_status) && (
                        <a style={{ color: '#6366F1' }} onClick={() => {
                          setReturnLeadId(record.id);
                          setIsReturnModalVisible(true);
                        }}>退回公域池</a>
                      )}
                    </div>
                  )},
                ]}
              />
            </div>
          ) : (
            renderEmpty('暂无历史线索')
          )}
        </Tabs.TabPane>

        {/* ──── 历史订单（PRD 4.2.5.1 / 配图 image32）──── */}
        <Tabs.TabPane tab="历史订单" key="5">
          {customerOrders.length > 0 ? (
            <div className="cd-leads-table-wrapper">
              <Table
                dataSource={customerOrders}
                rowKey="id"
                className="workbench-table"
                scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: (t: number) => `共 ${t} 条数据` }}
                columns={[
                  { title: '订单编号', dataIndex: 'orderCode', width: 150, fixed: 'left' as const },
                  { title: '客户姓名', key: 'cname', width: 90, render: (_: any, r: any) => r.customer?.customerName || r.snapCustomerName || '-' },
                  { title: '客户电话', key: 'cphone', width: 120, render: (_: any, r: any) => r.customer?.phone || r.snapCustomerPhone || '-' },
                  { title: '车品牌', dataIndex: 'snapVehicleBrand', width: 90, render: (v: any) => v || '-' },
                  { title: '车型', dataIndex: 'snapVehicleModel', width: 110, render: (v: any) => v || '-' },
                  { title: '车架号', dataIndex: 'snapVehicleVin', width: 170, render: (v: any) => v || '-' },
                  { title: '下单平台', dataIndex: 'orderPlatform', width: 100, render: (v: any) => v || '-' },
                  { title: '平台订单编号', dataIndex: 'platformOrderNo', width: 140, render: (v: any) => v || '-' },
                  { title: '三方订单编号', dataIndex: 'thirdOrderNo', width: 140, render: (v: any) => v || '-' },
                  { title: '订单状态', dataIndex: 'orderStatus', width: 115, render: (v: number) => getOrderStatusTag(v) },
                  { title: '实付金额', dataIndex: 'totalAmount', width: 100, render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
                  { title: '跟进人', key: 'sales', width: 90, render: (_: any, r: any) => r.salesperson?.realName || r.salesperson?.username || '-' },
                  { title: '创建时间', dataIndex: 'createdAt', width: 150, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
                  { title: '创建人', key: 'creator', width: 90, render: (_: any, r: any) => r.creator?.realName || r.creator?.username || '系统' },
                  { title: '更新时间', dataIndex: 'updatedAt', width: 150, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
                  { title: '更新人', key: 'updater', width: 90, render: (_: any, r: any) => r.updater?.realName || r.updater?.username || '系统' },
                  { title: '操作', key: 'op', width: 70, fixed: 'right' as const, render: (_: any, r: any) => (
                    <a style={{ color: '#6366F1' }} onClick={() => navigate(`/order/detail/${r.id}`)}>详情</a>
                  ) },
                ]}
              />
            </div>
          ) : (
            renderEmpty('暂无订单信息')
          )}
        </Tabs.TabPane>
      </Tabs>

      {/* Modals */}
      <EditCustomerModal
        visible={editCustomerVisible}
        onCancel={() => setEditCustomerVisible(false)}
        onSuccess={() => {
          setEditCustomerVisible(false);
          fetchData();
        }}
        customerData={data}
      />

      {/* 三步式创建订单（客户360入口，PRD 4.2.5.1）：客户信息带入且不可编辑、不可新增 */}
      <OrderCreateModal
        open={orderCreateVisible}
        onClose={() => setOrderCreateVisible(false)}
        onSuccess={() => {
          if (data?.id) fetchCustomerOrders(String(data.id));
          fetchData();
        }}
        fixedCustomer={data ? { id: String(data.id), customerName: data.customerName, phone: data.phone } : null}
      />

      <LeadAddModal 
        open={addLeadVisible}
        onCancel={() => setAddLeadVisible(false)}
        onSuccess={() => {
          setAddLeadVisible(false);
          fetchData();
        }}
        showWorkbenchFields
        defaultAssigneeId={localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).id : undefined}
        lockedCustomer={data ? { id: data.id, customerName: data.customerName, phone: data.phone } : null}
      />

      <FollowAddModal
        open={addFollowUpVisible}
        onCancel={() => setAddFollowUpVisible(false)}
        onSuccess={() => {
          setAddFollowUpVisible(false);
          fetchData();
        }}
        leadId={data?.leads?.find((l: any) => [0, 1, 2, 6].includes(l.lead_status))?.id || ''}
        customerId={data?.id}
        leadCode={data?.leads?.find((l: any) => [0, 1, 2, 6].includes(l.lead_status))?.lead_code}
        lastFollowRecord={data?.follows?.length > 0 ? data.follows[0] : undefined}
      />

      {/* 添加备注 Modal */}
      <Modal
        centered
        title="添加备注"
        open={addNoteVisible}
        onCancel={() => setAddNoteVisible(false)}
        onOk={handleAddNote}
        okText="保存"
        cancelText="取消"
        className="crm-unified-modal"
      >
        <Form form={noteForm} layout="vertical">
          <Form.Item label="备注内容" name="noteContent" rules={[{ required: true, message: '请输入备注内容' }]}>
            <Input.TextArea rows={4} placeholder="请输入..." />
          </Form.Item>
        </Form>
      </Modal>

      <LinkVehicleModal
        open={linkVehicleVisible}
        onCancel={() => setLinkVehicleVisible(false)}
        onSuccess={() => {
          setLinkVehicleVisible(false);
          fetchData();
        }}
        customerId={id!}
      />

      <Modal
        title="提示"
        open={isReturnModalVisible}
        onOk={handleReturnConfirm}
        onCancel={() => {
          setIsReturnModalVisible(false);
          setReturnLeadId(null);
        }}
        okText="确定"
        cancelText="取消"
        centered
        className="crm-unified-modal"
      >
        <div style={{ padding: '20px 0' }}>
          <span style={{ fontSize: '15px' }}>确定要退回公域池吗？</span>
        </div>
      </Modal>

      <EditVehicleModal
        open={editVehicleVisible}
        onCancel={() => { setEditVehicleVisible(false); setEditVehicleInfo(null); }}
        onSuccess={() => {
          setEditVehicleVisible(false);
          setEditVehicleInfo(null);
          fetchData();
        }}
        vehicleInfo={editVehicleInfo}
        customerId={id}
      />

      <Modal
        title="提示"
        open={deleteVehicleVisible}
        onOk={async () => {
          if (!deleteVehicleId) return;
          try {
            await request.delete(`/customer/vehicle/${deleteVehicleId}`);
            message.success('车辆删除成功');
            setDeleteVehicleVisible(false);
            setDeleteVehicleId(null);
            fetchData();
          } catch (e) {
            message.error('删除失败');
          }
        }}
        onCancel={() => {
          setDeleteVehicleVisible(false);
          setDeleteVehicleId(null);
        }}
        okText="确定删除"
        cancelText="取消"
        centered
        className="crm-unified-modal"
        okButtonProps={{ danger: true }}
      >
        <div style={{ padding: '20px 0' }}>
          <span style={{ fontSize: '15px' }}>确定要删除该车辆信息吗？删除后不可恢复。</span>
        </div>
      </Modal>
    </div>
  );
};

export default CustomerDetail;
