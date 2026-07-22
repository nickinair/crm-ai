import React, { useState, useEffect } from 'react';
import { Tabs, message, Tooltip, Select, Input, Modal } from 'antd';
import { 
  EditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
  InboxOutlined
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import request from '../utils/request';
import { useDict } from '../hooks/useDict';
import { maskPhone, maskIdCard } from '../utils/mask';
import EditProductsModal from './Customer360EditProductsModal';
import EditCustomerModal from './Customer360EditCustomerModal';
import EditVehicleModal from './EditVehicleModal';
import LeadAddModal from './LeadAddModal';
import FollowAddModal from './FollowAddModal';
import OrderAddModal from './OrderAddModal';
import './Customer360.css';
import dayjs from 'dayjs';

const Customer360: React.FC = () => {
  const { getDictOptions } = useDict();
  // 微信状态颜色：已通过/已添加=绿，添加待通过=黄，拒绝添加=红，其余=灰
  const wechatColor = (v: string) => (v === '已通过' || v === '已添加') ? '#52c41a'
    : v === '添加待通过' ? '#F97316'
    : v === '拒绝添加' ? '#F87171'
    : '#94A3B8';
  const wechatIcon = (v: string) => (v === '已通过' || v === '已添加') ? <CheckCircleOutlined />
    : v === '添加待通过' ? <ClockCircleOutlined />
    : v === '拒绝添加' ? <CloseCircleOutlined />
    : <MinusCircleOutlined />;
  const [activeTab, setActiveTab] = useState('1');
  const [searchParams] = useSearchParams();
  const leadId = searchParams.get('leadId');
  const navigate = useNavigate();

  const [leadInfo, setLeadInfo] = useState<any>({});
  const [customerInfo, setCustomerInfo] = useState<any>({});
  const [vehicleInfo, setVehicleInfo] = useState<any>({});
  const [followRecords, setFollowRecords] = useState<any[]>([]);
  const [customerNotes, setCustomerNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');

  const [productsModalVisible, setProductsModalVisible] = useState(false);
  const [productsModalMode, setProductsModalMode] = useState<'product' | 'gift'>('product');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [isAddLeadModalVisible, setIsAddLeadModalVisible] = useState(false);
  const [isReturnModalVisible, setIsReturnModalVisible] = useState(false);
  const [isNoteModalVisible, setIsNoteModalVisible] = useState(false);
  const [isFollowModalVisible, setIsFollowModalVisible] = useState(false);
  const [isOrderModalVisible, setIsOrderModalVisible] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);

  useEffect(() => {
    if (leadId) {
      fetchLeadData();
    }
  }, [leadId]);

  const fetchLeadData = async () => {
    try {
      const res = await request.get(`/lead/${leadId}`) as any;
      if (res && !res.error) {
        setLeadInfo(res);
        if (res.vehicle) {
          setVehicleInfo(res.vehicle);
        } else {
          setVehicleInfo({});
        }
        if (res.customer) {
          const customerDetail = await request.get(`/customer/360/${res.customer.id}`) as any;
          if (customerDetail && !customerDetail.error) {
            setCustomerInfo(customerDetail);
            setFollowRecords((customerDetail.follows || []).filter((f: any) => String(f.leadCode) === String(res.leadCode) || !f.leadCode));
          } else {
            setCustomerInfo(res.customer);
            setFollowRecords((res.follows || []).filter((f: any) => String(f.leadCode) === String(res.leadCode) || !f.leadCode));
          }
          fetchCustomerNotes(res.customer.id);
          fetchCustomerOrders(res.customer.id);
        } else {
          setFollowRecords(res.follows || []);
        }
        if (res.vehicle) {
          setVehicleInfo(res.vehicle);
        }
      }
    } catch (e) {
      console.error(e);
      message.error('获取详情失败');
    }
  };

  const fetchCustomerNotes = async (customerId: string) => {
    try {
      const res = await request.get(`/customer/${customerId}/notes`) as any;
      if (res && Array.isArray(res)) {
        setCustomerNotes(res);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReturnPublic = () => {
    setIsReturnModalVisible(true);
  };

  const handleReturnConfirm = async () => {
    try {
      await request.post('/lead/return-public', { leadIds: [leadId] });
      message.success('退回成功');
      setIsReturnModalVisible(false);
      navigate('/workbench');
    } catch (e) {
      message.error('退回失败');
    }
  };

  const handleAddLead = () => {
    if (customerInfo && customerInfo.leads && customerInfo.leads.length > 0) {
      // Check if there is any lead that is unfinished (0, 1, 2)
      const hasActive = customerInfo.leads.some((l: any) => [0, 1, 2, 6].includes(l.leadStatus));
      if (hasActive) {
        message.warning('当前客户存在未完成的线索，不可新增线索！');
        return;
      }
    }
    setIsAddLeadModalVisible(true);
  };

  const handleAddOrder = () => {
    setIsOrderModalVisible(true);
  };

  const handleAddFollow = () => {
    setIsFollowModalVisible(true);
  };

  const fetchCustomerOrders = async (custId: string) => {
    try {
      const res = await request.get(`/order/customer/${custId}`) as any;
      if (res && Array.isArray(res)) {
        setCustomerOrders(res);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const renderEmpty = (text: string = '暂无数据') => (
    <div className="cd-empty-state">
      <InboxOutlined className="cd-empty-icon" />
      <div className="cd-empty-text">{text}</div>
    </div>
  );

  const renderProducts = (role: number) => {
    const prods = (leadInfo.products || []).filter((p: any) => p.productRole === role).map((p: any) => p.product);
    if (!prods.length) return <span style={{ color: '#8892b0' }}>无</span>;
    const prodNames = prods.map((p: any) => `${p.productName} ${p.model || ''}`.trim());
    const displayStr = prodNames.join('; ');
    if (prodNames.length > 3) {
      return (
        <Tooltip title={displayStr}>
          <span>{prodNames.slice(0, 3).join('; ')}...</span>
        </Tooltip>
      );
    }
    return displayStr;
  };

  const handleEditProducts = (mode: 'product' | 'gift') => {
    const role = mode === 'product' ? 1 : 2;
    const selectedIds = (leadInfo.products || []).filter((p: any) => p.productRole === role).map((p: any) => p.productId);
    setSelectedProductIds(selectedIds);
    setProductsModalMode(mode);
    setProductsModalVisible(true);
  };

  const handleWechatStatusChange = async (value: string) => {
    try {
      const res = await request.put(`/lead/${leadId}/wechat`, { isAddWechat: value }) as any;
      if (!res.error) {
        message.success('更新微信状态成功');
        fetchLeadData();
      }
    } catch (e) {
      console.error(e);
      message.error('更新失败');
    }
  };

  const submitNote = async () => {
    if (!newNote.trim()) return;
    try {
      const userInfoStr = localStorage.getItem('user');
      const userInfo = userInfoStr ? JSON.parse(userInfoStr) : {};
      await request.post(`/customer/${customerInfo.id}/notes`, {
        accountId: userInfo.id,
        noteContent: newNote
      });
      message.success('新增备注成功');
      setNewNote('');
      setIsNoteModalVisible(false);
      fetchCustomerNotes(customerInfo.id);
    } catch (e) {
      message.error('新增备注失败');
    }
  };

  const leadStatusMap = ['待分配', '待跟进', '跟进中', '已完成', '已战败', '已作废', '回收待分配'];
  // 已完成(3)/已战败(4)的线索为终态，页面只读，隐藏所有操作入口
  const isLeadClosed = [3, 4].includes(Number(leadInfo?.leadStatus));

  return (
    <div className="customer360-container">
      {/* 顶部：当前线索 */}
      <div className="c360-lead-summary">
        <div className="c360-lead-header">
          <div className="c360-lead-title">当前线索 - {leadInfo.leadCode}</div>
          <div className="c360-lead-actions">
            <button className="crm-btn crm-btn-outline" onClick={handleAddLead}>新增线索</button>
            {!isLeadClosed && <>
              <button className="crm-btn crm-btn-outline" onClick={handleReturnPublic}>退回公域池</button>
              <button className="crm-btn crm-btn-outline" onClick={handleAddOrder}>新增订单</button>
              <button className="crm-btn crm-btn-primary" onClick={handleAddFollow}>添加跟进记录</button>
            </>}
          </div>
        </div>
        <div className="c360-lead-fields">
          <div className="c360-field">
            <span className="c360-label">线索来源</span>
            <span className="c360-value">{leadInfo.channelSource || '-'}</span>
          </div>
          <div className="c360-field">
            <span className="c360-label">线索来源方式</span>
            <span className="c360-value">{leadInfo.sourceMethod || '-'}</span>
          </div>
          <div className="c360-field">
            <span className="c360-label">
              客户意向商品 {!isLeadClosed && <EditOutlined className="c360-icon-edit" onClick={() => handleEditProducts('product')} />}
            </span>
            <span className="c360-value highlight-warning">{renderProducts(1)}</span>
          </div>
          <div className="c360-field">
            <span className="c360-label">
              意向赠品 {!isLeadClosed && <EditOutlined className="c360-icon-edit" onClick={() => handleEditProducts('gift')} />}
            </span>
            <span className="c360-value highlight-warning">{renderProducts(2)}</span>
          </div>
          <div className="c360-field">
            <span className="c360-label">购买意向</span>
            <span className="c360-value">{leadInfo.purchaseIntention || '-'}</span>
          </div>
          <div className="c360-field">
            <span className="c360-label">客户沟通倾向</span>
            <span className="c360-value">{leadInfo.communicationTendency || '-'}</span>
          </div>
          <div className="c360-field">
            <span className="c360-label">线索状态</span>
            <span className="c360-value highlight-primary">{leadStatusMap[leadInfo.leadStatus] || '-'}</span>
          </div>
          <div className="c360-field">
            <span className="c360-label">上次跟进时间</span>
            <span className="c360-value">{leadInfo.lastFollowAt ? dayjs(leadInfo.lastFollowAt).format('YYYY-MM-DD HH:mm') : '-'}</span>
          </div>
          <div className="c360-field">
            <span className="c360-label">下次计划回访</span>
            <span className="c360-value">{leadInfo.nextFollowAt ? dayjs(leadInfo.nextFollowAt).format('YYYY-MM-DD HH:mm') : '-'}</span>
          </div>
          <div className="c360-field">
            <span className="c360-label">呼叫历史结果</span>
            <span className="c360-value">{leadInfo.callResult || '-'}</span>
          </div>
        </div>
      </div>

      {/* 中间双拼卡片 */}
      <div className="c360-cards-wrapper">
        {/* 左侧：客户信息 */}
        <div className="c360-info-card">
          <div className="c360-card-header">
            <div className="c360-card-title"><i className="c360-icon-user"></i> 客户信息</div>
            <div className="c360-card-header-actions">
              {!isLeadClosed && <button className="crm-btn crm-btn-outline" onClick={() => setCustomerModalVisible(true)}><EditOutlined /> 编辑</button>}
              <button className="crm-btn crm-btn-outline" onClick={() => navigate(`/customer/detail/${customerInfo.id}?from=leads&leadId=${leadId}`)}>查看客户360视图 →</button>
            </div>
          </div>
          <div className="c360-card-body grid-2-col">
            <div className="c360-field">
              <span className="c360-label">客户姓名</span>
              <span className="c360-value">{customerInfo.customerName || '-'}</span>
            </div>
            <div className="c360-field">
              <span className="c360-label">客户电话</span>
              <span className="c360-value font-bold">{maskPhone(customerInfo.phone)}</span>
            </div>
            <div className="c360-field">
              <span className="c360-label">身份证号</span>
              <span className="c360-value">{maskIdCard(customerInfo.idCardNo)}</span>
            </div>
            <div className="c360-field">
              <span className="c360-label">性别</span>
              <span className="c360-value">{customerInfo.gender === 1 ? '男' : customerInfo.gender === 2 ? '女' : '未知'}</span>
            </div>
            <div className="c360-field">
              <span className="c360-label">生日</span>
              <span className="c360-value">{customerInfo.birthday || '-'}</span>
            </div>
            <div className="c360-field">
              <span className="c360-label">添加微信</span>
              <span className="c360-value">
                <Select
                  value={leadInfo.isAddWechat || '未添加'}
                  bordered={false}
                  size="small"
                  style={{ minWidth: '140px' }}
                  popupMatchSelectWidth={false}
                  onChange={handleWechatStatusChange}
                  suffixIcon={<EditOutlined style={{ fontSize: '14px', color: '#94A3B8' }}/>}
                >
                  {getDictOptions('wechat_add_status').map(o => (
                    <Select.Option key={o.value} value={o.value}>
                      <span style={{ color: wechatColor(o.value), display: 'flex', alignItems: 'center', gap: '4px' }}>{wechatIcon(o.value)}{o.label}</span>
                    </Select.Option>
                  ))}
                </Select>
              </span>
            </div>
          </div>
          {customerNotes.length > 0 && (
            <div className="c360-card-footer">
              <div className="c360-remark">
                <FileTextOutlined className="c360-remark-icon" /> 客户备注: {customerNotes[0].noteContent}
              </div>
            </div>
          )}
        </div>

        {/* 右侧：车辆信息 */}
        <div className="c360-info-card">
          <div className="c360-card-header">
            <div className="c360-card-title"><i className="c360-icon-car"></i> 车辆信息</div>
            <div className="c360-card-header-actions">
              {!isLeadClosed && <button className="crm-btn crm-btn-outline" onClick={() => setVehicleModalVisible(true)}><EditOutlined /> 编辑</button>}
            </div>
          </div>
          <div className="c360-card-body grid-2-col">
            <div className="c360-field">
              <span className="c360-label">品牌</span>
              <span className="c360-value">{vehicleInfo.brand || '-'}</span>
            </div>
            <div className="c360-field">
              <span className="c360-label">车型</span>
              <span className="c360-value font-bold">
                {vehicleInfo.model || '-'} {vehicleInfo.style ? ` ${vehicleInfo.style}` : ''}
              </span>
            </div>
            <div className="c360-field">
              <span className="c360-label">车架号(VIN)</span>
              <span className="c360-value">{vehicleInfo.vin || '-'}</span>
            </div>
            <div className="c360-field">
              <span className="c360-label">车牌号</span>
              <span className="c360-value font-bold">{vehicleInfo.plateNo || '-'}</span>
            </div>
            <div className="c360-field">
              <span className="c360-label">发票日期</span>
              <span className="c360-value">{vehicleInfo.purchaseDate || '-'}</span>
            </div>
            <div className="c360-field">
              <span className="c360-label">里程数</span>
              <span className="c360-value">{vehicleInfo.mileage ? `${Number(vehicleInfo.mileage).toLocaleString()} km` : '-'}</span>
            </div>
            <div className="c360-field">
              <span className="c360-label">车龄（月）</span>
              <span className="c360-value">{vehicleInfo.vehicleAge ? `${vehicleInfo.vehicleAge}个月` : '-'}</span>
            </div>
          </div>
          {/* 车辆标签 */}
          {(() => {
            const getFlagState = (val: any) => {
              if (val === '是' || val === '1' || val === 1 || val === true) return true;
              if (val === '否' || val === '0' || val === 0 || val === false) return false;
              return null;
            };

            const tags: { label: string; isTrue: boolean; color: string }[] = [];
            const mileage = vehicleInfo.mileage ? Number(vehicleInfo.mileage) : 0;
            
            let over40k = getFlagState(vehicleInfo.isMileageOver40k);
            if (over40k === null && vehicleInfo.mileage) over40k = mileage >= 40000;
            if (over40k === true) tags.push({ label: '大于4万公里', isTrue: true, color: '#52c41a' });

            let over95k = getFlagState(vehicleInfo.isMileageOver95k);
            if (over95k === null && vehicleInfo.mileage) over95k = mileage >= 95000;
            if (over95k === true) tags.push({ label: '大于9.5万公里', isTrue: true, color: '#52c41a' });

            if (getFlagState(vehicleInfo.hasExtendedWarranty) === true) {
              tags.push({ label: '已购整车延保', isTrue: true, color: '#52c41a' });
            }

            if (getFlagState(vehicleInfo.hasBatteryWarranty) === true) {
              tags.push({ label: '已购电池延保', isTrue: true, color: '#52c41a' });
            }

            if (getFlagState(vehicleInfo.hasPeaceOfMind) === true) {
              tags.push({ label: '已购安心保', isTrue: true, color: '#52c41a' });
            }

            if (getFlagState(vehicleInfo.hasTireProtection) === true) {
              tags.push({ label: '已购轮胎保障', isTrue: true, color: '#52c41a' });
            }

            return tags.length > 0 ? (
              <div className="c360-vehicle-tags">
                {tags.map((tag, i) => (
                  <span key={i} className="c360-vehicle-tag" style={{ borderColor: tag.color, color: tag.color }}>
                    <CheckCircleOutlined style={{ marginRight: 4 }} />{tag.label}
                  </span>
                ))}
              </div>
            ) : null;
          })()}
          {vehicleInfo.remark && (
            <div className="c360-card-footer" style={{ borderTop: '1px solid #1e2235', paddingTop: '16px', marginTop: '16px' }}>
              <div className="c360-remark" style={{ color: '#a0a5b5', fontSize: '13px' }}>
                <FileTextOutlined className="c360-remark-icon" style={{ marginRight: '6px' }} /> 车辆备注: {vehicleInfo.remark}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 底部Tabs */}
      <div style={{ marginTop: '24px' }}>
        <Tabs className="crm-tabs" activeKey={activeTab} onChange={setActiveTab}>
          <Tabs.TabPane tab="跟进记录" key="1">
            <div className="c360-records-list">
              {followRecords.length > 0 ? followRecords.map(record => (
                <div key={record.id} className="c360-record-item">
                  <div className="c360-record-header">
                    {record.accountName ? `${record.accountName} (${record.accountUsername})` : '销售'} <span className="divider">|</span> 线索: {record.leadCode || leadInfo.leadCode} <span className="divider">|</span> {dayjs(record.followTime || record.follow_time).format('YYYY-MM-DD HH:mm')}
                  </div>
                <div className="c360-record-tags">
                  {(record.callResult || record.call_result) && <span className={`c360-status-tag ${(record.callResult || record.call_result) === '成功接通' ? 'tag-solid-green' : (record.callResult || record.call_result) === '客户主动挂断' ? 'tag-solid-orange' : 'tag-solid-red'}`}>呼叫结果: {record.callResult || record.call_result}</span>}
                  {record.communicationTendency && <span className="c360-status-tag tag-solid-green">沟通倾向: {record.communicationTendency}</span>}
                  {record.purchaseIntention && <span className="c360-status-tag tag-solid-yellow">购买意向: {record.purchaseIntention}</span>}
                  {record.nextFollowAt && <span className="c360-status-tag tag-solid-purple">下次跟进: {dayjs(record.nextFollowAt).format('YYYY-MM-DD HH:mm')}</span>}
                  {record.leadStatus !== undefined && record.leadStatus !== null && <span className="c360-status-tag tag-solid-blue">线索状态: {record.leadStatus === 0 ? '待分配' : record.leadStatus === 1 ? '待跟进' : record.leadStatus === 2 ? '跟进中' : record.leadStatus === 3 ? '已完成' : '已战败'}</span>}
                </div>
                <div className="c360-record-content">
                  {record.followContent || record.follow_content}
                </div>
              </div>
            )) : renderEmpty('暂无跟进记录')}
          </div>
        </Tabs.TabPane>
        
        <Tabs.TabPane tab="客户备注" key="2">
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              {!isLeadClosed && <button className="crm-btn crm-btn-primary" onClick={() => setIsNoteModalVisible(true)}>新增备注</button>}
            </div>
            
            <div className="c360-records-list">
              {customerNotes.length > 0 ? customerNotes.map(note => (
                <div key={note.id} className="c360-record-item" style={{ borderLeft: '3px solid #6366f1', borderRadius: '4px', background: '#1e2235' }}>
                  <div className="c360-record-header" style={{ marginBottom: 10, color: '#a0a5b5' }}>
                    {note.createdByName || '未知'} ({note.createdByAccount || note.createdBy}) <span className="divider">|</span> {dayjs(note.createdAt).format('YYYY-MM-DD HH:mm')}
                  </div>
                  <div className="c360-record-content" style={{ color: '#d1d5db', fontSize: '13px', lineHeight: '1.6' }}>
                    {note.noteContent}
                  </div>
                </div>
              )) : renderEmpty('暂无备注')}
            </div>
          </div>
        </Tabs.TabPane>
        
        <Tabs.TabPane tab="历史订单" key="3">
          <div style={{ padding: '20px' }}>
            {customerOrders.length > 0 ? customerOrders.map(order => (
              <div key={order.id} className="c360-record-item" style={{ borderLeft: '3px solid #10b981', borderRadius: '4px', background: '#1e2235', marginBottom: '12px' }}>
                <div className="c360-record-header" style={{ marginBottom: 10, color: '#a0a5b5', display: 'flex', justifyContent: 'space-between' }}>
                  <span>订单号: {order.orderCode}</span>
                  <span style={{ color: order.orderStatus === 2 ? '#10b981' : order.orderStatus === 3 ? '#ef4444' : '#f59e0b' }}>
                    {order.orderStatus === 0 ? '待确认' : order.orderStatus === 1 ? '已确认' : order.orderStatus === 2 ? '已完成' : '已取消'}
                  </span>
                </div>
                <div className="c360-record-content" style={{ color: '#d1d5db', fontSize: '13px', lineHeight: '1.6' }}>
                  <div>金额: <span style={{ color: '#f59e0b', fontWeight: 600 }}>¥{Number(order.totalAmount).toFixed(2)}</span></div>
                  {order.paymentMethod && <div>支付方式: {order.paymentMethod}</div>}
                  {order.orderPlatform && <div>下单平台: {order.orderPlatform}</div>}
                  {order.items && order.items.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      商品: {order.items.map((item: any) => `${item.productName}${item.productModel ? ` (${item.productModel})` : ''} x${item.quantity}`).join(', ')}
                    </div>
                  )}
                  {order.remark && <div style={{ marginTop: '4px', color: '#8c939d' }}>备注: {order.remark}</div>}
                </div>
                <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '8px' }}>{dayjs(order.createdAt).format('YYYY-MM-DD HH:mm')}</div>
              </div>
            )) : renderEmpty('暂无订单信息')}
          </div>
        </Tabs.TabPane>
      </Tabs>
      </div>

      <EditProductsModal
        visible={productsModalVisible}
        onCancel={() => setProductsModalVisible(false)}
        onSuccess={() => {
          setProductsModalVisible(false);
          fetchLeadData();
        }}
        leadId={leadId!}
        initialSelectedIds={selectedProductIds}
        mode={productsModalMode}
      />

      <EditCustomerModal
        visible={customerModalVisible}
        onCancel={() => setCustomerModalVisible(false)}
        customerData={customerInfo}
        onSuccess={() => {
          setCustomerModalVisible(false);
          fetchLeadData();
        }}
      />
      <EditVehicleModal
        open={vehicleModalVisible}
        onCancel={() => setVehicleModalVisible(false)}
        vehicleInfo={vehicleInfo}
        customerId={customerInfo?.id}
        leadId={leadId!}
        onSuccess={() => {
          setVehicleModalVisible(false);
          fetchLeadData();
        }}
      />
      <LeadAddModal 
        open={isAddLeadModalVisible} 
        onCancel={() => setIsAddLeadModalVisible(false)} 
        onSuccess={() => {
          setIsAddLeadModalVisible(false);
          fetchLeadData();
        }}
        defaultAssigneeId={localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).id : undefined}
        lockedCustomer={customerInfo ? { id: customerInfo.id, customerName: customerInfo.customerName, phone: customerInfo.phone } : null}
        showWorkbenchFields
      />
      
      <Modal
        centered
        title="添加客户备注"
        open={isNoteModalVisible}
        onCancel={() => setIsNoteModalVisible(false)}
        onOk={submitNote}
        okText="保存"
        cancelText="取消"
        width={500}
        className="crm-unified-modal"
      >
        <div style={{ marginBottom: '8px' }}>备注内容</div>
        <Input.TextArea
          rows={3}
          value={newNote}
          onChange={e => setNewNote(e.target.value.slice(0, 100))}
          placeholder="请输入备注信息..."
          maxLength={100}
          style={{ resize: 'vertical' }}
        />
        <div style={{ textAlign: 'right', color: '#999', fontSize: '12px', marginTop: '4px' }}>{(newNote || '').length} / 100</div>
      </Modal>

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

      <FollowAddModal
        open={isFollowModalVisible}
        onCancel={() => setIsFollowModalVisible(false)}
        onSuccess={() => {
          setIsFollowModalVisible(false);
          setActiveTab('1');
          fetchLeadData();
        }}
        leadId={leadId!}
        customerId={customerInfo?.id}
        leadCode={leadInfo?.leadCode}
        lastFollowRecord={followRecords.length > 0 ? followRecords[0] : undefined}
      />
      <OrderAddModal
        open={isOrderModalVisible}
        onCancel={() => setIsOrderModalVisible(false)}
        onSuccess={() => {
          setIsOrderModalVisible(false);
          fetchLeadData();
          if (customerInfo?.id) fetchCustomerOrders(customerInfo.id);
        }}
        leadId={leadId!}
        customerId={customerInfo?.id}
        channelSource={leadInfo?.channelSource}
      />
    </div>
  );
};
export default Customer360;
