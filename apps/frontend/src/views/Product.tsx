import React, { useEffect, useState } from 'react';
import { Button, Tag, Form, Input, Modal, Select, message, Row, Col, Table, ConfigProvider } from 'antd';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import request from '../utils/request';
import { hasPerm } from '../utils/perm';
import { useDict } from '../hooks/useDict';
import './Leads.css';



const ProductManagement: React.FC = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const { getDictOptions } = useDict();

  // Detail modal
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<any>(null);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await request.get('/product');
      const items = Array.isArray(res) ? res : ((res as any).data || []);
      setData(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleEdit = (record: any) => {
    setEditingProduct(record);
    const formValues = {
      ...record,
      status: record.status === 1 ? '已生效' : '已归档',
      applicableModel: record.specParams?.applicableModel,
      installationAttr: record.specParams?.installAttr
    };
    form.setFieldsValue(formValues);
    setIsModalOpen(true);
  };

  const columns = [
    { title: '商品ID', dataIndex: 'id' },
    { title: '商品编码', dataIndex: 'productCode' },
    { title: '商品名称', dataIndex: 'productName' },
    { title: '商品类型', dataIndex: 'productType' },
    { title: '适用车型', dataIndex: ['specParams', 'applicableModel'], render: (text: any) => text || '-' },
    { title: '安装属性', dataIndex: ['specParams', 'installAttr'], render: (text: any) => text || '-' },
    { title: '单位', dataIndex: 'unit' },
    { title: '成本价', dataIndex: 'costPrice', render: (val: any) => `¥${Number(val).toFixed(2)}` },
    { title: '售价', dataIndex: 'salePrice', render: (val: any) => `¥${Number(val).toFixed(2)}` },
    { title: '状态', dataIndex: 'status', render: (status: number) => <Tag color={status === 1 ? "#e6f7eb" : "#f5f5f5"} style={{ color: status === 1 ? '#52c41a' : '#595959', border: 'none', borderRadius: '4px' }}>{status === 1 ? '已生效' : '已归档'}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', render: (text: any) => text ? new Date(text).toLocaleString() : '-' },
    { title: '更新时间', dataIndex: 'updatedAt', render: (text: any) => text ? new Date(text).toLocaleString() : '-' },
    { 
      title: '操作', 
      render: (_: any, record: any) => (
        <div className="action-links" style={{ display: 'flex', gap: '8px' }}>
          <a onClick={() => { setDetailRecord(record); setIsDetailOpen(true); }}>查看</a>
          {hasPerm('product:edit') && <a onClick={() => handleEdit(record)}>编辑</a>}
          <a>归档</a>
        </div>
      ) 
    }
  ];

  const handleExport = () => {
    if (!data || (data as any[]).length === 0) {
      message.warning('暂无数据可导出');
      return;
    }
    const exportData = (data as any[]).map(item => ({
      '商品ID': item.id,
      '商品编码': item.productCode || '-',
      '商品名称': item.productName || '-',
      '商品类型': item.productType || '-',
      '适用车型': item.specParams?.applicableModel || '-',
      '安装属性': item.specParams?.installAttr || '-',
      '单位': item.unit || '-',
      '成本价': Number(item.costPrice || 0).toFixed(2),
      '售价': Number(item.salePrice || 0).toFixed(2),
      '状态': item.status === 1 ? '已生效' : '已归档',
      '创建时间': item.createdAt ? dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-',
      '更新时间': item.updatedAt ? dayjs(item.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '商品列表');
    XLSX.writeFile(wb, `商品列表_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
    message.success('导出成功');
  };

  const handleAdd = async () => {
    try {
      const values = await form.validateFields();
      const { applicableModel, installationAttr, id: _id, ...rest } = values;
      // Remove non-entity fields from rest
      delete rest.specParams;
      const payload = {
        ...rest,
        specParams: { applicableModel, installAttr: installationAttr },
        status: values.status === '已生效' ? 1 : 0,
      };

      if (editingProduct) {
        await request.put(`/product/${editingProduct.id}`, payload);
        message.success('更新商品成功');
      } else {
        await request.post('/product', payload);
        message.success('新增商品成功');
      }
      setIsModalOpen(false);
      form.resetFields();
      setEditingProduct(null);
      fetchProducts();
    } catch (error: any) {
      if (error?.errorFields) return;
      // HTTP errors are toasted by the global interceptor; only toast non-HTTP failures
      if (!error?.response) {
        message.error(error?.message || '操作失败');
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, background: '#ffffff', borderRadius: '16px', overflow: 'hidden' }}>
      <div className="table-card" style={{ borderRadius: '16px', border: 'none', boxShadow: 'none' }}>
        <div className="table-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>商品列表</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Button onClick={handleExport} style={{ height: '36px', padding: '0 20px', borderRadius: '6px', borderColor: '#d1d5db', color: '#4b5563' }}>导出</Button>
            {hasPerm('product:create') && <Button onClick={() => setIsModalOpen(true)} className="action-btn" style={{ height: '36px' }}>+ 新增商品</Button>}
          </div>
        </div>
        
        <ConfigProvider getPopupContainer={(trigger) => trigger?.parentElement || document.body}>
        <Table 
          className="custom-table"
          columns={columns} 
          dataSource={data} 
          rowKey="id" 
          loading={loading}
          pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100', '200'], showTotal: (total) => `共 ${total} 条记录` }}
          scroll={{ x: 'max-content' }}
        />
        </ConfigProvider>
      </div>

      <Modal title={editingProduct ? "编辑商品" : "新增商品"} open={isModalOpen} onOk={handleAdd} onCancel={() => { setIsModalOpen(false); form.resetFields(); setEditingProduct(null); }} centered className="crm-unified-modal" width={720} okText="保存" cancelText="关闭">
        <Form form={form} layout="vertical">
          <Row gutter={24}>
            {editingProduct && (
              <Col span={12}>
                <Form.Item name="id" label="商品ID">
                  <Input disabled style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }} />
                </Form.Item>
              </Col>
            )}
            <Col span={12}>
              <Form.Item name="productCode" label="商品编码" rules={[
                { required: true, message: '请输入商品编码' },
                { max: 32, message: '商品编码最多32个字符' },
                { pattern: /^[^\u4e00-\u9fa5]+$/, message: '商品编码不能包含中文' }
              ]}>
                <Input placeholder="请输入商品编码" maxLength={32} showCount />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="productName" label="商品名称" rules={[
                { required: true, message: '请输入商品名称' },
                { max: 30, message: '商品名称最多30个字符' }
              ]}>
                <Input placeholder="请输入商品名称" maxLength={30} showCount />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="productType" label="商品类型" rules={[{ required: true, message: '请选择商品类型' }]}>
                <Select placeholder="请选择商品类型" options={getDictOptions('product_type')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="applicableModel" label="适用车型" rules={[{ required: true, message: '请选择适用车型' }]}>
                <Select placeholder="请选择适用车型">
                  <Select.Option value="通用">通用</Select.Option>
                  <Select.Option value="专车专用">专车专用</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="installationAttr" label="安装属性" rules={[{ required: true, message: '请选择安装属性' }]}>
                <Select placeholder="请选择安装属性">
                  <Select.Option value="无需安装">无需安装</Select.Option>
                  <Select.Option value="需安装">需安装</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unit" label="单位" rules={[{ required: true, message: '请选择单位' }]}>
                <Select placeholder="请选择单位" options={getDictOptions('product_unit')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="costPrice" label="成本价" rules={[
                { required: true, message: '请输入成本价' },
                { validator: (_: any, value: any) => {
                  const num = Number(value);
                  if (value !== undefined && value !== '' && (num < 0 || Object.is(num, -0))) return Promise.reject('成本价不能为负数');
                  return Promise.resolve();
                }}
              ]}>
                <Input type="number" min={0} placeholder="请输入成本价" onBlur={(e) => { if (Object.is(Number(e.target.value), -0)) { form.setFieldValue('costPrice', '0'); } }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="salePrice" label="售价" rules={[
                { required: true, message: '请输入售价' },
                { validator: (_: any, value: any) => {
                  const num = Number(value);
                  if (value !== undefined && value !== '' && (num < 0 || Object.is(num, -0))) return Promise.reject('售价不能为负数');
                  return Promise.resolve();
                }}
              ]}>
                <Input type="number" min={0} placeholder="请输入售价" onBlur={(e) => { if (Object.is(Number(e.target.value), -0)) { form.setFieldValue('salePrice', '0'); } }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]} initialValue="已生效">
                <Select placeholder="请选择状态">
                  <Select.Option value="已生效">已生效</Select.Option>
                  <Select.Option value="已归档">已归档</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ===== 商品详情 Modal ===== */}
      <Modal
        centered
        title="商品详情"
        open={isDetailOpen}
        onCancel={() => { setIsDetailOpen(false); setDetailRecord(null); }}
        footer={<Button onClick={() => { setIsDetailOpen(false); setDetailRecord(null); }}>关闭</Button>}
        width={640}
        className="crm-unified-modal"
      >
        {detailRecord && (() => {
          const labelStyle: React.CSSProperties = { color: '#64748b', fontWeight: 500, fontSize: '13px', marginBottom: '4px' };
          const valueStyle: React.CSSProperties = { background: '#f1f5f9', borderRadius: '6px', padding: '6px 12px', fontSize: '14px', color: '#1f2937', minHeight: '32px', display: 'flex', alignItems: 'center' };
          return (
            <div>
              <Row gutter={24} style={{ marginBottom: '16px' }}>
                <Col span={12}>
                  <div style={labelStyle}>商品ID</div>
                  <div style={valueStyle}>{detailRecord.id}</div>
                </Col>
                <Col span={12}>
                  <div style={labelStyle}>商品编码</div>
                  <div style={valueStyle}>{detailRecord.productCode || '-'}</div>
                </Col>
              </Row>
              <Row gutter={24} style={{ marginBottom: '16px' }}>
                <Col span={12}>
                  <div style={labelStyle}>商品名称</div>
                  <div style={valueStyle}>{detailRecord.productName || '-'}</div>
                </Col>
                <Col span={12}>
                  <div style={labelStyle}>商品类型</div>
                  <div style={valueStyle}>{detailRecord.productType || '-'}</div>
                </Col>
              </Row>
              <Row gutter={24} style={{ marginBottom: '16px' }}>
                <Col span={12}>
                  <div style={labelStyle}>适用车型</div>
                  <div style={valueStyle}>{detailRecord.specParams?.applicableModel || '-'}</div>
                </Col>
                <Col span={12}>
                  <div style={labelStyle}>安装属性</div>
                  <div style={valueStyle}>{detailRecord.specParams?.installAttr || '-'}</div>
                </Col>
              </Row>
              <Row gutter={24} style={{ marginBottom: '16px' }}>
                <Col span={12}>
                  <div style={labelStyle}>单位</div>
                  <div style={valueStyle}>{detailRecord.unit || '-'}</div>
                </Col>
                <Col span={12}>
                  <div style={labelStyle}>状态</div>
                  <div style={valueStyle}>{detailRecord.status === 1 ? '已生效' : '已归档'}</div>
                </Col>
              </Row>
              <Row gutter={24} style={{ marginBottom: '16px' }}>
                <Col span={12}>
                  <div style={labelStyle}>成本价</div>
                  <div style={valueStyle}>¥{Number(detailRecord.costPrice || 0).toFixed(2)}</div>
                </Col>
                <Col span={12}>
                  <div style={labelStyle}>售价</div>
                  <div style={valueStyle}>¥{Number(detailRecord.salePrice || 0).toFixed(2)}</div>
                </Col>
              </Row>
              <Row gutter={24} style={{ marginBottom: '16px' }}>
                <Col span={12}>
                  <div style={labelStyle}>创建时间</div>
                  <div style={valueStyle}>{detailRecord.createdAt ? dayjs(detailRecord.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-'}</div>
                </Col>
                <Col span={12}>
                  <div style={labelStyle}>更新时间</div>
                  <div style={valueStyle}>{detailRecord.updatedAt ? dayjs(detailRecord.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}</div>
                </Col>
              </Row>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default ProductManagement;
