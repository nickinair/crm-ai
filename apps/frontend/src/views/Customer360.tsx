import React, { useState, useEffect } from 'react';
import { Tabs, message, Tooltip, Select, Input, Modal, Table, Empty } from 'antd';
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
import { useLeadLock } from '../hooks/useLeadLock';
import { maskIdCard } from '../utils/mask';
import EditProductsModal from './Customer360EditProductsModal';
import EditCustomerModal from './Customer360EditCustomerModal';
import EditVehicleModal from './EditVehicleModal';
import LeadAddModal from './LeadAddModal';
import FollowAddModal from './FollowAddModal';
import OrderCreateModal from '../components/OrderCreateModal';
import { getOrderStatusTag } from './Order';
import './Workbench.css';
import LeadVoidModal from '../components/LeadVoidModal';
import './Customer360.css';
import dayjs from 'dayjs';

const Customer360: React.FC = () => {
  const [voidLeadOpen, setVoidLeadOpen] = useState(false); // 作废弹框（PRD 4.3.5）
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
  // 进入线索详情加锁，离开释放（PRD 4.3.1 线索锁定）
  useLeadLock(leadId);
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
  // 操作日志：倒序分页，每页10条，滚动加载（PRD 4.3.3）
  const [leadLogs, setLeadLogs] = useState<any[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [logLoading, setLogLoading] = useState(false);

  const fetchLeadLogs = async (page: number, reset = false) => {
    if (!leadId) return;
    setLogLoading(true);
    try {
      const res: any = await request.get(`/lead/${leadId}/logs`, { params: { page, limit: 10 } });
      setLeadLogs(prev => reset ? (res.items || []) : [...prev, ...(res.items || [])]);
      setLogTotal(res.total || 0);
      setLogPage(page);
    } catch { /* 全局拦截器提示 */ } finally {
      setLogLoading(false);
    }
  };

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
          } else {
            setCustomerInfo(res.customer);
          }
          fetchCustomerNotes(res.customer.id);
          fetchCustomerOrders(res.customer.id);
        }
        // 跟进记录：战败复活线索合并所有父级线索记录，按时间倒序（PRD 4.3.3）
        try {
          const follows: any = await request.get(`/lead/${leadId}/follows`);
          setFollowRecords(Array.isArray(follows) ? follows : []);
        } catch { setFollowRecords([]); }
        fetchLeadLogs(1, true);
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
      // 线索跟进页：历史订单为线索维度（当前线索+父链关联订单，PRD 4.3.5）；
      // 无线索上下文时回退客户维度（客户360视图为客户维度，走 CustomerDetail 页）
      const res = leadId
        ? await request.get(`/order/lead-chain/${leadId}`) as any
        : await request.get(`/order/customer/${custId}`) as any;
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

  const leadStatusMap = ['待分配', '待跟进', '跟进中', '已成交', '已战败', '已作废', '回收待分配'];
  // 已成交(3)/已战败(4)/已作废(5)的线索为终态，页面只读，隐藏所有操作入口
  const isLeadClosed = [3, 4, 5].includes(Number(leadInfo?.leadStatus));

  return (
    <div className="customer360-container">
      {/* 顶部：当前线索 */}
      <div className="c360-lead-summary">
        <div className="c360-lead-header">
          <div className="c360-lead-title">当前线索 - {leadInfo.leadCode}</div>
          <div className="c360-lead-actions">
            <button className="crm-btn crm-btn-outline" onClick={handleAddLead}>新增线索</button>
            {!isLeadClosed && <>
              {/* 待跟进/跟进中：作废按钮在退回公域池前（PRD 4.3.5） */}
              {[1, 2].includes(leadInfo.leadStatus) && <button className="crm-btn crm-btn-outline" onClick={() => setVoidLeadOpen(true)}>作废</button>}
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
            <span className="c360-label">线索创建类型</span>
            <span className="c360-value">{leadInfo.createType === 2 ? '战败线索复活' : '普通新建'}</span>
          </div>
          <div className="c360-field">
            <span className="c360-label">线索状态</span>
            <span className="c360-value highlight-primary">{leadStatusMap[leadInfo.leadStatus] || '-'}</span>
          </div>
          <div className="c360-field">
            <span className="c360-label">订单情况</span>
            <span className="c360-value">{['未下单', '存在未完结订单', '全部订单已作废', '全部订单已完结'][leadInfo.orderSituation] || '未下单'}</span>
          </div>
          <div className="c360-field">
            <span className="c360-label">分配管控标识</span>
            <span className="c360-value" style={{ color: leadInfo.assignControl === 1 ? '#F59E0B' : leadInfo.assignControl === 2 ? '#60A5FA' : undefined }}>
              {leadInfo.assignControl === 1 ? '战败冷却期' : leadInfo.assignControl === 2 ? '战败已复活' : '无管控'}
            </span>
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
              <span className="c360-value">{customerInfo.phone || '-'}</span>
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
              <span className="c360-value">
                {vehicleInfo.model || '-'} {vehicleInfo.style ? ` ${vehicleInfo.style}` : ''}
              </span>
            </div>
            <div className="c360-field">
              <span className="c360-label">车架号(VIN)</span>
              <span className="c360-value">{vehicleInfo.vin || '-'}</span>
            </div>
            <div className="c360-field">
              <span className="c360-label">车牌号</span>
              <span className="c360-value">{vehicleInfo.plateNo || '-'}</span>
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
                    {record.accountName ? `${record.accountName} (${record.accountUsername})` : (String(record.accountId) === '0' ? '系统' : '销售')} <span className="divider">|</span> {record.isHistory ? '父线索' : '线索'}: {record.leadCode || leadInfo.leadCode}
                    {record.isHistory && <span className="c360-status-tag" style={{ background: 'rgba(249,115,22,0.15)', color: '#FB923C', marginLeft: 8 }}>历史记录</span>}
                    <span className="divider">|</span> {dayjs(record.followTime || record.follow_time).format('YYYY-MM-DD HH:mm')}
                  </div>
                <div className="c360-record-tags">
                  {(record.callResult || record.call_result) && <span className={`c360-status-tag ${(record.callResult || record.call_result) === '成功接通' ? 'tag-solid-green' : (record.callResult || record.call_result) === '客户主动挂断' ? 'tag-solid-orange' : 'tag-solid-red'}`}>呼叫结果: {record.callResult || record.call_result}</span>}
                  {record.communicationTendency && <span className="c360-status-tag tag-solid-green">沟通倾向: {record.communicationTendency}</span>}
                  {record.purchaseIntention && <span className="c360-status-tag tag-solid-yellow">购买意向: {record.purchaseIntention}</span>}
                  {record.nextFollowAt && <span className="c360-status-tag tag-solid-purple">下次跟进: {dayjs(record.nextFollowAt).format('YYYY-MM-DD HH:mm')}</span>}
                  {record.leadStatus !== undefined && record.leadStatus !== null && <span className="c360-status-tag tag-solid-blue">线索状态: {record.leadStatus === 0 ? '待分配' : record.leadStatus === 1 ? '待跟进' : record.leadStatus === 2 ? '跟进中' : record.leadStatus === 3 ? '已成交' : '已战败'}</span>}
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
            <Table
              className="workbench-table"
              dataSource={customerOrders}
              rowKey="id"
              size="small"
              scroll={{ x: 'max-content' }}
              pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], showTotal: (t: number) => `共 ${t} 条数据` }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无订单信息" style={{ margin: '40px auto' }} /> }}
              columns={[
                { title: '订单编号', dataIndex: 'orderCode', width: 150 },
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
                // 关联线索可跳转线索详情（PRD 配图 image38）
                { title: '关联线索', key: 'lead', width: 130, render: (_: any, r: any) => r.lead && r.snapLeadCode
                    ? <a style={{ color: '#818CF8' }} onClick={() => navigate(`/customer/360/${r.customerId}?leadId=${r.lead.id}&from=leads`)}>{r.snapLeadCode}</a>
                    : (r.snapLeadCode || '-') },
                { title: '创建时间', dataIndex: 'createdAt', width: 150, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
                { title: '操作', key: 'op', width: 70, fixed: 'right', render: (_: any, r: any) => (
                    <a onClick={() => navigate(`/order/detail/${r.id}`)}>详情</a>
                ) },
              ] as any}
            />
          </div>
        </Tabs.TabPane>

        <Tabs.TabPane tab="操作日志" key="4">
          {/* 操作日志：倒序，每页10条，滚动下滑加载更多（PRD 4.3.3） */}
          <div
            style={{ padding: '20px', maxHeight: '480px', overflowY: 'auto' }}
            onScroll={(e: any) => {
              const t = e.target;
              if (t.scrollTop + t.clientHeight >= t.scrollHeight - 30 && !logLoading && leadLogs.length < logTotal) {
                fetchLeadLogs(logPage + 1);
              }
            }}
          >
            {leadLogs.length === 0 && !logLoading && renderEmpty('暂无操作日志')}
            {leadLogs.map((log: any) => (
              <div key={log.id} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366F1', marginTop: '6px', flexShrink: 0 }} />
                <div>
                  <div style={{ color: '#E8ECF3', fontSize: '13px' }}>{log.action}</div>
                  <div style={{ color: '#94A3B8', fontSize: '12px', marginTop: '2px' }}>操作人：{log.operator}</div>
                  {log.content && <div style={{ color: '#94A3B8', fontSize: '12px' }}>操作内容：{log.content}</div>}
                  <div style={{ color: '#64748B', fontSize: '12px', marginTop: '2px' }}>{dayjs(log.createdAt).format('YYYY-MM-DD HH:mm')}</div>
                </div>
              </div>
            ))}
            {logLoading && <div style={{ color: '#64748B', fontSize: '12px', textAlign: 'center', padding: '8px' }}>加载中…</div>}
            {!logLoading && leadLogs.length >= logTotal && leadLogs.length > 0 && (
              <div style={{ color: '#475569', fontSize: '12px', textAlign: 'center', padding: '8px' }}>已加载全部</div>
            )}
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

      <LeadVoidModal
        open={voidLeadOpen}
        leadId={leadId!}
        onCancel={() => setVoidLeadOpen(false)}
        onSuccess={() => { setVoidLeadOpen(false); fetchLeadData(); }}
      />

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
      {/* 三步式创建订单（线索详情入口，PRD 4.2.4.2）：第一步展示当前线索编码不可修改 */}
      <OrderCreateModal
        open={isOrderModalVisible}
        onClose={() => setIsOrderModalVisible(false)}
        onSuccess={() => {
          fetchLeadData();
          if (customerInfo?.id) fetchCustomerOrders(customerInfo.id);
        }}
        fixedLead={leadId && leadInfo?.leadCode && customerInfo?.id ? {
          id: leadId,
          leadCode: leadInfo.leadCode,
          customerId: customerInfo.id,
          customerName: customerInfo.customerName,
          phone: customerInfo.phone,
        } : null}
      />
    </div>
  );
};
export default Customer360;
