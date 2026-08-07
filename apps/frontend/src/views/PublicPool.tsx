import React, { useEffect, useState } from 'react';
import { Table, Form, message, Modal, Tooltip, ConfigProvider } from 'antd';
import request from '../utils/request';
import { hasPerm } from '../utils/perm';
import LeadSearchForm from '../components/LeadSearchForm';
import dayjs from 'dayjs';
import './Leads.css';

const PublicPool: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [salesList, setSalesList] = useState<any[]>([]);

  const fetchSales = async () => {
    try {
      const rolesRes: any = await request.get('/roles', { params: { pageSize: 100 } });
      const rolesList = rolesRes.data?.list || rolesRes.list || (Array.isArray(rolesRes) ? rolesRes : []);
      const roleId = rolesList.find((r: any) => r.roleCode === 'sales' || r.roleName === '销售')?.id;
      const res: any = await request.get('/account', { params: { limit: 100, roleId } });
      setSalesList(res.items || (Array.isArray(res) ? res : (res.data || [])));
    } catch (err) { console.error(err); }
  };

  const fetchLeads = async (values: any = {}, page = 1, limit = 10) => {
    setLoading(true);
    try {
      const params: any = { ...values, page, limit, publicPool: '1' };
      // 线索状态：未选时默认公域池三态（待分配/已战败/回收待分配），选了则用所选
      if (Array.isArray(params.leadStatus) && params.leadStatus.length) {
        params.leadStatus = params.leadStatus.join(',');
      } else if (!params.leadStatus) {
        params.leadStatus = '0,4,6';
      }
      const res: any = await request.get('/lead', { params });
      setData(res.items || []);
      setTotal(res.total || 0);
      setPagination({ current: page, pageSize: limit });
    } catch (error) {
      console.error(error);
      message.error('获取公域池线索失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchSales();
  }, []);

  const onSearch = (values: any) => {
    fetchLeads(values, 1, pagination.pageSize);
  };

  const handleTableChange = (pag: any) => {
    const currentValues = form.getFieldsValue();
    fetchLeads(currentValues, pag.current, pag.pageSize);
  };

  // 领取防抖：同一时间只允许一个领取请求在途，杜绝连点重复克隆
  const claimingRef = React.useRef(false);
  const [claimingId, setClaimingId] = useState<any>(null);

  const handleClaim = async (record: any) => {
    if (claimingRef.current) return;
    const userInfoStr = localStorage.getItem('user');
    if (!userInfoStr) {
      message.error('请先登录');
      return;
    }
    const userInfo = JSON.parse(userInfoStr);

    // 已战败的线索判断：跟进人是否为当前销售
    if (record.leadStatus === 4 && record.assignedAccountId === userInfo.id) {
      message.warning('该线索不可被你领取，请领取其他线索！');
      return;
    }

    Modal.confirm({
      title: '确认领取',
      content: `确定要领取线索 ${record.leadCode} 吗？`,
      okText: '确定领取',
      cancelText: '取消',
      centered: true,
      className: 'crm-unified-modal',
      async onOk() {
        if (claimingRef.current) return;
        claimingRef.current = true;
        setClaimingId(record.id);
        try {
          const res: any = await request.post('/lead/batch-assign', {
            leadIds: [record.id],
            accountId: userInfo.id,
          });
          if (res?.error) {
            message.error(res.message || '领取失败');
          } else {
            message.success('领取成功！线索已进入您的私池');
            const currentValues = form.getFieldsValue();
            fetchLeads(currentValues, pagination.current, pagination.pageSize);
          }
        } catch (e: any) {
          message.error(e?.response?.data?.message || '领取失败');
        } finally {
          claimingRef.current = false;
          setClaimingId(null);
        }
      },
    });
  };

  const getStatusTag = (status: number) => {
    const map: Record<number, { text: string; className: string }> = {
      0: { text: '待分配', className: 'crm-tag-warning' },
      1: { text: '待跟进', className: 'crm-tag-warning' },
      2: { text: '跟进中', className: 'crm-tag-info' },
      3: { text: '已完成', className: 'crm-tag-success' },
      4: { text: '已战败', className: 'crm-tag-danger' },
      5: { text: '已作废', className: 'crm-tag-default' },
      6: { text: '回收待分配', className: 'crm-tag-warning' },
    };
    const s = map[status] || { text: '未知', className: 'crm-tag-default' };
    return <span className={`crm-tag ${s.className}`}>{s.text}</span>;
  };

  const getPillTag = (val: string | null) => {
    if (!val) return '-';
    let className = 'crm-tag-default';
    if (['已添加', '明确', '成功接通'].includes(val)) className = 'crm-tag-success';
    if (['未添加', '无意向/需剔除', '客户主动挂断', '已战败'].includes(val)) className = 'crm-tag-danger';
    if (['意向外', '跟进中'].includes(val)) className = 'crm-tag-info';
    if (['意向内', '待分配', '回收待分配', '空号'].includes(val)) className = 'crm-tag-warning';
    return <span className={`crm-tag ${className}`}>{val}</span>;
  };

  const renderProducts = (products: any[], role: number) => {
    if (!products || !products.length) return '-';
    const filtered = products.filter((p: any) => p.productRole === role);
    if (!filtered.length) return '-';
    const text = filtered.map((p: any) => `${p.product?.productName || ''} ${p.product?.productCode || ''}`.trim()).join('；');
    return (
      <Tooltip title={text}>
        <div className="leads-product-cell">{text}</div>
      </Tooltip>
    );
  };

  // 车辆布尔字段展示：1/'1'/true → 是，其余 → 否（与线索池管理一致）
  const boolText = (val: any) => (val === true || val === 1 || val === '1' || val === '是') ? '是' : '否';

  // 列与线索池管理页保持一致（仅操作列为公域池的"领取"）
  const columns: any[] = [
    { title: '序号', key: 'index', width: 60, fixed: 'left', render: (_: any, __: any, index: number) => (pagination.current - 1) * pagination.pageSize + index + 1 },
    { title: '线索编码', dataIndex: 'leadCode', width: 90, fixed: 'left' },
    { title: '客户姓名', dataIndex: 'customerName', render: (_: any, record: any) => record.customer?.customerName || '-', width: 100, fixed: 'left' },
    { title: '客户电话', dataIndex: 'customerPhone', render: (_: any, record: any) => record.customer?.phone || '-', width: 120, fixed: 'left' },
    { title: '渠道来源', dataIndex: 'channelSource', width: 100 },
    { title: '线索来源方式', dataIndex: 'sourceMethod', width: 120 },
    { title: '来源日期', dataIndex: 'sourceDate', width: 120 },
    { title: '车型', key: 'carModel', width: 140, render: (_: any, record: any) => record.vehicle?.model || '-' },
    { title: '款式', key: 'carStyle', width: 120, render: (_: any, record: any) => record.vehicle?.style || '-' },
    { title: '车架号', dataIndex: 'vin', width: 180, render: (_: any, record: any) => record.vehicle?.vin || '-' },
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
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (val: string) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-' },
    { title: '跟进天数', key: 'followUpDays', width: 100, render: (_: any, record: any) => record.firstFollowAt ? (Math.floor((new Date().setHours(0,0,0,0) - new Date(record.firstFollowAt).setHours(0,0,0,0)) / (1000 * 60 * 60 * 24)) + 1) : '-' },
    { title: '关联订单号', dataIndex: 'orderId', width: 120, render: (val: any) => val || '-' },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_: any, record: any) => (
        <div className="action-links">
          {hasPerm('workbench:grab', 'lead') && (
            claimingId === record.id
              ? <a style={{ color: '#94A3B8', cursor: 'not-allowed' }}>领取中…</a>
              : <a onClick={() => handleClaim(record)}>领取</a>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ color: '#e2e8f0', fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>全部可抢线索</div>

        <div style={{ marginBottom: '24px' }} className="search-form pool-dark-search">
          <LeadSearchForm form={form} onSearch={onSearch} salesList={salesList} darkLabels storageScope="public-pool" />
        </div>

        <ConfigProvider 
          getPopupContainer={(trigger: any) => trigger?.parentElement || document.body}
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
            className="workbench-table"
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              pageSizeOptions: ['10', '20', '50', '100', '200'],
            }}
            scroll={{ x: 2000 }}
            onChange={handleTableChange}
          />
        </ConfigProvider>
      </div>
    </div>
  );
};

export default PublicPool;
