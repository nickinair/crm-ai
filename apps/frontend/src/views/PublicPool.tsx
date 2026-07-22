import React, { useEffect, useState } from 'react';
import { Table, Form, Input, Select, Button, message, Modal, Tooltip, ConfigProvider } from 'antd';
import request from '../utils/request';
import { hasPerm } from '../utils/perm';
import { useDict } from '../hooks/useDict';
import dayjs from 'dayjs';
import './Leads.css';

const PublicPool: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const { getDictOptions } = useDict();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchLeads = async (values: any = {}, page = 1, limit = 10) => {
    setLoading(true);
    try {
      const params: any = {
        ...values,
        page,
        limit,
        leadStatus: values.leadStatus || '0,4,6', // 默认 待分配、已战败、回收待分配
        publicPool: '1',     // 标记为公域池查询
      };
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
  }, []);

  const onSearch = (values: any) => {
    fetchLeads(values, 1, pagination.pageSize);
  };

  const onReset = () => {
    form.resetFields();
    fetchLeads({}, 1, pagination.pageSize);
  };

  const handleTableChange = (pag: any) => {
    const currentValues = form.getFieldsValue();
    fetchLeads(currentValues, pag.current, pag.pageSize);
  };

  const handleClaim = async (record: any) => {
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

  const columns: any[] = [
    { title: '序号', key: 'index', width: 60, fixed: 'left', render: (_: any, __: any, index: number) => (pagination.current - 1) * pagination.pageSize + index + 1 },
    { title: '线索编码', dataIndex: 'leadCode', width: 140, fixed: 'left' },
    { title: '客户姓名', dataIndex: 'customerName', render: (_: any, record: any) => record.customer?.customerName || '-', width: 100 },
    { title: '客户电话', dataIndex: 'customerPhone', render: (_: any, record: any) => record.customer?.phone || '-', width: 120 },
    { title: '渠道来源', dataIndex: 'channelSource', width: 100 },
    { title: '线索来源方式', dataIndex: 'sourceMethod', width: 120 },
    { title: '来源日期', dataIndex: 'sourceDate', width: 120 },
    { title: '车架号', dataIndex: 'vin', width: 180, render: (_: any, record: any) => record.vehicle?.vin || '-' },
    { title: '购买意向', dataIndex: 'purchaseIntention', width: 100, render: (val: string) => getPillTag(val) },
    { title: '线索状态', dataIndex: 'leadStatus', width: 100, render: (val: number) => getStatusTag(val) },
    { title: '客户沟通意向', dataIndex: 'communicationTendency', width: 120, render: (val: string) => getPillTag(val) },
    { title: '呼叫结果', dataIndex: 'callResult', width: 100, render: (val: string) => getPillTag(val) },
    { title: '意向商品', key: 'intentProduct', width: 150, render: (_: any, record: any) => renderProducts(record.products, 1) },
    { title: '意向赠品', key: 'intentGift', width: 150, render: (_: any, record: any) => renderProducts(record.products, 2) },
    { title: '跟进人', dataIndex: 'assignee', width: 100, render: (_: any, record: any) => record.assignee?.realName || record.assignee?.username || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (val: string) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-' },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_: any, record: any) => (
        <div className="action-links">
          {hasPerm('workbench:grab', 'lead') && <a onClick={() => handleClaim(record)}>领取</a>}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ color: '#e2e8f0', fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>全部可抢线索</div>

        <div style={{ marginBottom: '24px' }}>
          <Form form={form} layout="inline" onFinish={onSearch} className="search-form" style={{ rowGap: '16px' }}>
            <Form.Item name="channelSource" label={<span style={{ color: '#c9cdd4' }}>渠道来源</span>}>
              <Select placeholder="全部" allowClear style={{ width: 130 }} options={getDictOptions('channel_source')} />
            </Form.Item>
            <Form.Item name="customerName" label={<span style={{ color: '#c9cdd4' }}>客户姓名</span>}>
              <Input placeholder="请输入姓名" allowClear />
            </Form.Item>
            <Form.Item name="customerPhone" label={<span style={{ color: '#c9cdd4' }}>客户电话</span>}>
              <Input placeholder="请输入电话" allowClear />
            </Form.Item>
            <Form.Item name="sourceMethod" label={<span style={{ color: '#c9cdd4' }}>线索来源方式</span>}>
              <Select placeholder="全部" allowClear style={{ width: 130 }} options={getDictOptions('lead_source_method')} />
            </Form.Item>
            <Form.Item name="leadStatus" label={<span style={{ color: '#c9cdd4' }}>线索状态</span>}>
              <Select placeholder="全部" allowClear style={{ width: 130 }}>
                <Select.Option value="0">待分配</Select.Option>
                <Select.Option value="4">已战败</Select.Option>
                <Select.Option value="6">回收待分配</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button onClick={onReset} className="crm-btn crm-btn-outline">重置</Button>
                <Button type="primary" htmlType="submit" className="crm-btn crm-btn-primary">筛选</Button>
              </div>
            </Form.Item>
          </Form>
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
