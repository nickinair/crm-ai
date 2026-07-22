import React, { useEffect, useState } from 'react';
import { Table, Form, Input, Button, DatePicker, ConfigProvider } from 'antd';
import request from '../utils/request';

import './Leads.css';

const OrderManagement: React.FC = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchOrders = async (values: any = {}) => {
    setLoading(true);
    try {
      const res = await request.get('/order', { params: values });
      setData(Array.isArray(res) ? res : ((res as any).items || []));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const columns = [
    { title: '订单编号', dataIndex: 'orderCode' },
    { title: '关联客户', dataIndex: ['customer', 'customerName'], render: (text: string) => text || '未知客户' },
    { title: '订单金额', dataIndex: 'totalAmount', render: (val: any) => `¥${val || '0.00'}` },
    { title: '订单状态', dataIndex: 'orderStatus', render: (val: number) => {
        const statusMap = ['待确认', '已确认', '已完成', '已取消'];
        return statusMap[val] || '未知状态';
    } },
    { title: '创建时间', dataIndex: 'createdAt', render: (val: string) => val ? new Date(val).toLocaleString() : '-' },
    { title: '操作', render: () => <div className="action-links"><a>详情</a></div> }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <div className="table-card">
        <div className="filter-section">
          <Form form={form} layout="inline" onFinish={fetchOrders}>
            <Form.Item name="orderId" label="订单编号">
              <Input placeholder="请输入" />
            </Form.Item>
            <Form.Item name="dateRange" label="创建时间">
              <DatePicker.RangePicker popupClassName="crm-date-picker-popup" />
            </Form.Item>
            <Form.Item>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Button htmlType="submit" className="action-btn" style={{ height: '36px' }}>查询</Button>
                <Button onClick={() => { form.resetFields(); fetchOrders({}); }} className="action-btn secondary-btn" style={{ height: '36px' }}>重置</Button>
              </div>
            </Form.Item>
          </Form>
        </div>
        <div className="table-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>订单列表</h3>
        </div>
        <ConfigProvider getPopupContainer={(trigger) => trigger?.parentElement || document.body}>
        <Table className="custom-table" columns={columns} dataSource={data} rowKey="id" loading={loading} />
        </ConfigProvider>
      </div>
    </div>
  );
};

export default OrderManagement;
