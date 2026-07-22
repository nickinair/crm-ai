import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Input, InputNumber, Button, message, Table } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import request from '../utils/request';
import { useDict } from '../hooks/useDict';

interface OrderAddModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  leadId?: string;
  customerId?: string;
  channelSource?: string;
}

const OrderAddModal: React.FC<OrderAddModalProps> = ({ open, onCancel, onSuccess, leadId, customerId, channelSource }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([{ key: Date.now(), productId: undefined, productRole: 1, unitPrice: 0, quantity: 1 }]);
  const { getDictOptions } = useDict();

  useEffect(() => {
    if (open) {
      fetchProducts();
      form.setFieldsValue({
        channelSource: channelSource || undefined,
        paymentMethod: undefined,
        orderPlatform: undefined,
        remark: '',
      });
      setOrderItems([{ key: Date.now(), productId: undefined, productRole: 1, unitPrice: 0, quantity: 1 }]);
    }
  }, [open]);

  const fetchProducts = async () => {
    try {
      const res: any = await request.get('/product', { params: { limit: 200 } });
      setProducts(res.items || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddItem = () => {
    setOrderItems([...orderItems, { key: Date.now(), productId: undefined, productRole: 1, unitPrice: 0, quantity: 1 }]);
  };

  const handleRemoveItem = (key: number) => {
    if (orderItems.length <= 1) {
      message.warning('至少需要一个商品');
      return;
    }
    setOrderItems(orderItems.filter(item => item.key !== key));
  };

  const handleItemChange = (key: number, field: string, value: any) => {
    setOrderItems(orderItems.map(item => {
      if (item.key === key) {
        const updated = { ...item, [field]: value };
        if (field === 'productId') {
          const product = products.find(p => p.id === value);
          if (product) {
            updated.productName = product.productName;
            updated.productModel = product.model || '';
            updated.unitPrice = Number(product.price) || 0;
          }
        }
        return updated;
      }
      return item;
    }));
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      // Validate items
      const validItems = orderItems.filter(item => item.productId);
      if (validItems.length === 0) {
        message.warning('请至少添加一个商品');
        return;
      }

      setLoading(true);
      const userInfoStr = localStorage.getItem('user');
      const userInfo = userInfoStr ? JSON.parse(userInfoStr) : {};

      const items = validItems.map(item => ({
        productId: item.productId,
        productRole: item.productRole,
        productName: item.productName,
        productModel: item.productModel,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      }));

      await request.post('/order', {
        customerId,
        leadId,
        channelSource: values.channelSource,
        paymentMethod: values.paymentMethod,
        orderPlatform: values.orderPlatform,
        remark: values.remark,
        salespersonId: userInfo.id,
        items,
      });

      message.success('新增订单成功');
      form.resetFields();
      onSuccess();
    } catch (e: any) {
      if (e?.errorFields) return;
      console.error(e);
      message.error('新增订单失败');
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = orderItems.reduce((sum, item) => sum + (Number(item.unitPrice || 0) * Number(item.quantity || 1)), 0);

  const itemColumns = [
    {
      title: '商品', dataIndex: 'productId', width: 200,
      render: (_: any, record: any) => (
        <Select
          placeholder="请选择商品"
          value={record.productId}
          onChange={(val) => handleItemChange(record.key, 'productId', val)}
          showSearch
          optionFilterProp="children"
          style={{ width: '100%' }}
        >
          {products.map(p => (
            <Select.Option key={p.id} value={p.id}>{p.productName} {p.model || ''}</Select.Option>
          ))}
        </Select>
      )
    },
    {
      title: '类型', dataIndex: 'productRole', width: 100,
      render: (_: any, record: any) => (
        <Select value={record.productRole} onChange={(val) => handleItemChange(record.key, 'productRole', val)}>
          <Select.Option value={1}>商品</Select.Option>
          <Select.Option value={2}>赠品</Select.Option>
        </Select>
      )
    },
    {
      title: '单价', dataIndex: 'unitPrice', width: 120,
      render: (_: any, record: any) => (
        <InputNumber
          min={0}
          precision={2}
          value={record.unitPrice}
          onChange={(val) => handleItemChange(record.key, 'unitPrice', val || 0)}
          style={{ width: '100%' }}
          prefix="¥"
        />
      )
    },
    {
      title: '数量', dataIndex: 'quantity', width: 80,
      render: (_: any, record: any) => (
        <InputNumber
          min={1}
          value={record.quantity}
          onChange={(val) => handleItemChange(record.key, 'quantity', val || 1)}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: '小计', key: 'subtotal', width: 100,
      render: (_: any, record: any) => (
        <span style={{ fontWeight: 600, color: '#f59e0b' }}>¥{(Number(record.unitPrice || 0) * Number(record.quantity || 1)).toFixed(2)}</span>
      )
    },
    {
      title: '', key: 'action', width: 50,
      render: (_: any, record: any) => (
        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemoveItem(record.key)} />
      )
    },
  ];

  return (
    <Modal
      title="新增订单"
      open={open}
      onCancel={() => { form.resetFields(); onCancel(); }}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText="提交"
      cancelText="取消"
      width={720}
      centered
      destroyOnClose
      className="crm-unified-modal"
    >
      <Form form={form} layout="vertical" style={{ marginTop: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="channelSource" label="渠道来源">
            <Select placeholder="请选择" allowClear options={getDictOptions('channel_source')} />
          </Form.Item>
          <Form.Item name="paymentMethod" label="支付方式">
            <Select placeholder="请选择" allowClear>
              <Select.Option value="全款">全款</Select.Option>
              <Select.Option value="分期">分期</Select.Option>
              <Select.Option value="贷款">贷款</Select.Option>
              <Select.Option value="微信支付">微信支付</Select.Option>
              <Select.Option value="支付宝">支付宝</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="orderPlatform" label="下单平台">
            <Select placeholder="请选择" allowClear>
              <Select.Option value="抖音">抖音</Select.Option>
              <Select.Option value="天猫">天猫</Select.Option>
              <Select.Option value="京东">京东</Select.Option>
              <Select.Option value="线下">线下</Select.Option>
            </Select>
          </Form.Item>
        </div>
        <Form.Item name="remark" label="订单备注">
          <Input.TextArea rows={2} placeholder="请输入备注信息..." />
        </Form.Item>
      </Form>

      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: '14px' }}>商品明细</span>
        <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddItem}>添加商品</Button>
      </div>
      <Table
        dataSource={orderItems}
        columns={itemColumns}
        rowKey="key"
        pagination={false}
        size="small"
        bordered
      />
      <div style={{ textAlign: 'right', marginTop: '12px', fontSize: '15px', fontWeight: 600 }}>
        合计: <span style={{ color: '#f59e0b', fontSize: '18px' }}>¥{totalAmount.toFixed(2)}</span>
      </div>
    </Modal>
  );
};

export default OrderAddModal;
