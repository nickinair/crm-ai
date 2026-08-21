import React, { useEffect, useState } from 'react';
import { Button, Tag, Form, Input, Modal, Select, message, Row, Col, Table, ConfigProvider, Tooltip, Upload, DatePicker } from 'antd';
import { InboxOutlined, CheckCircleFilled } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
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
  const { getDictOptions, getDictOptionsByParent } = useDict();

  // 搜索表单（PRD 4.5.1）
  const [searchForm] = Form.useForm();
  // 新增/编辑弹框中当前选中的商品类型，用于联动「商品属性」选项
  const [formProductType, setFormProductType] = useState<string | undefined>(undefined);
  // 搜索区选中的商品类型，用于联动筛选项里的「商品属性」
  const [searchProductType, setSearchProductType] = useState<string | undefined>(undefined);

  // Detail modal
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<any>(null);

  // ===== 批量导入（PRD 4.5.2）=====
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; success: number; failed: number; errorRows: any[] } | null>(null);

  /** 模板表头定义，与后端 PRODUCT_IMPORT_HEADERS 保持一致（PRD 配图 image42） */
  const IMPORT_HEADERS: { label: string; required: boolean }[] = [
    { label: '商品编码', required: true },
    { label: '商品名称', required: true },
    { label: '商品类型', required: true },
    { label: '商品属性', required: false },
    { label: '适用车型', required: false },
    { label: '安装属性', required: false },
    { label: '单位', required: true },
    { label: '成本价', required: false },
    { label: '售价', required: true },
  ];
  const headerTitle = (h: { label: string; required: boolean }) => h.required ? `${h.label}(必填)` : h.label;

  const fetchProducts = async (params: any = {}) => {
    setLoading(true);
    try {
      const res = await request.get('/product', { params });
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

  const onSearch = () => {
    const v = searchForm.getFieldsValue();
    // 空值不下发，避免后端把空串当成筛选条件
    const params: any = {};
    Object.keys(v).forEach(k => {
      if (v[k] !== undefined && v[k] !== null && v[k] !== '') params[k] = v[k];
    });
    fetchProducts(params);
  };

  const onReset = () => {
    searchForm.resetFields();
    setSearchProductType(undefined);
    fetchProducts();
  };

  // 兼容历史数据：V1.0.0 存在 specParams JSON 里，V1.1.0 起用独立字段
  const readApplicableModel = (r: any) => r.applicableModel || r.specParams?.applicableModel || '';
  const readInstallAttr = (r: any) => r.installAttribute || r.specParams?.installAttr || '';

  const handleEdit = (record: any) => {
    setEditingProduct(record);
    const formValues = {
      ...record,
      status: record.status === 1 ? '已生效' : '已归档',
      applicableModel: readApplicableModel(record) || undefined,
      installationAttr: readInstallAttr(record) || undefined,
    };
    setFormProductType(record.productType);
    form.setFieldsValue(formValues);
    setIsModalOpen(true);
  };

  const columns = [
    { title: '商品ID', dataIndex: 'id' },
    { title: '商品编码', dataIndex: 'productCode' },
    { title: '商品名称', dataIndex: 'productName' },
    { title: '商品属性', dataIndex: 'productAttribute', render: (text: any) => text || '-' },
    { title: '商品类型', dataIndex: 'productType' },
    { title: '适用车型', key: 'applicableModel', render: (_: any, r: any) => readApplicableModel(r) || '-' },
    { title: '安装属性', key: 'installAttribute', render: (_: any, r: any) => readInstallAttr(r) || '-' },
    { title: '单位', dataIndex: 'unit' },
    {
      title: '商品备注', dataIndex: 'productRemark', width: 160,
      render: (text: any) => text
        ? <Tooltip title={text}><div className="leads-product-cell">{text}</div></Tooltip>
        : '-'
    },
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
      '商品属性': item.productAttribute || '-',
      '商品类型': item.productType || '-',
      '适用车型': readApplicableModel(item) || '-',
      '安装属性': readInstallAttr(item) || '-',
      '单位': item.unit || '-',
      '商品备注': item.productRemark || '-',
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

  // ===== 批量导入：下载模板（必填字段标红，PRD 4.5.2）=====
  const handleDownloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('商品批量导入模板');
    const headerRow = ws.addRow(IMPORT_HEADERS.map(h => headerTitle(h)));
    headerRow.eachCell((cell, colNumber) => {
      const info = IMPORT_HEADERS[colNumber - 1];
      cell.value = headerTitle(info);
      // 必填字段标红展示
      cell.font = { bold: true, color: { argb: info.required ? 'FFFF0000' : 'FF000000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
    });
    ws.columns.forEach(col => { col.width = 20; });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '商品批量导入模板.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** 选择文件时的格式/大小校验（PRD 4.5.2「上传时」校验表） */
  const validateImportFile = (file: File): boolean => {
    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      message.error('仅支持上传.xlsx  .xls 的文件');
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('仅支持上传5M内的文件');
      return false;
    }
    if (file.size === 0) {
      message.error('文件内容不能为空');
      return false;
    }
    return true;
  };

  const handleImport = async () => {
    if (!importFile) {
      message.warning('请先上传文件');
      return;
    }
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res: any = await request.post('/product/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      setImportResult(res);
      setIsImportOpen(false);
      setImportFile(null);
      onSearch(); // 刷新商品列表
    } catch (e: any) {
      // 文件级校验失败（空表格/表头有误等）由后端返回，全局拦截器已弹出提示
      if (!e?.response) message.error(e?.message || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  /** 下载错误文件：表头同模板 + 错误信息列（红色），PRD 配图 image46 */
  const handleDownloadErrorFile = async () => {
    if (!importResult?.errorRows?.length) return;
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('错误数据');
    const cols = [...IMPORT_HEADERS.map(h => headerTitle(h)), '错误信息'];
    const headerRow = ws.addRow(cols);
    headerRow.eachCell((cell, colNumber) => {
      const isErrCol = colNumber === cols.length;
      const info = IMPORT_HEADERS[colNumber - 1];
      cell.font = { bold: true, color: { argb: (isErrCol || info?.required) ? 'FFFF0000' : 'FF000000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      };
    });
    importResult.errorRows.forEach(r => {
      const row = ws.addRow([...IMPORT_HEADERS.map(h => r[h.label] ?? ''), r['错误信息'] ?? '']);
      row.eachCell((cell, colNumber) => {
        if (colNumber === cols.length) cell.font = { color: { argb: 'FFFF0000' } }; // 错误信息列标红
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' }
        };
      });
    });
    ws.columns.forEach((col, i) => { col.width = i === cols.length - 1 ? 40 : 20; });
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `商品批量导入错误文件_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAdd = async () => {
    try {
      const values = await form.validateFields();
      const { applicableModel, installationAttr, id: _id, ...rest } = values;
      // Remove non-entity fields from rest
      delete rest.specParams;
      const payload = {
        ...rest,
        // V1.1.0 起写入独立字段；specParams 同步保留一份，兼容尚未升级的读取方
        applicableModel: applicableModel ?? null,
        installAttribute: installationAttr ?? null,
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
      setFormProductType(undefined);
      onSearch(); // 保留当前筛选条件刷新列表
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
        {/* ===== 筛选区（PRD 4.5.1）===== */}
        <div className="filter-section" style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
          <Form form={searchForm} layout="inline" onFinish={onSearch} style={{ display: 'flex', width: '100%', alignItems: 'center', flexWrap: 'wrap', rowGap: '12px' }}>
            <Form.Item name="productName" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>商品名称</span>} style={{ marginRight: '24px' }}>
              <Input placeholder="模糊查询" allowClear style={{ width: '180px', height: '36px', borderRadius: '6px' }} />
            </Form.Item>
            <Form.Item name="productCode" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>商品编码</span>} style={{ marginRight: '24px' }}>
              <Input placeholder="精确查询" allowClear style={{ width: '180px', height: '36px', borderRadius: '6px' }} />
            </Form.Item>
            <Form.Item name="productType" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>商品类型</span>} style={{ marginRight: '24px' }}>
              <Select
                placeholder="全部" allowClear style={{ width: '150px', height: '36px' }}
                options={getDictOptions('product_type')}
                onChange={(v) => { setSearchProductType(v); searchForm.setFieldValue('productAttribute', undefined); }}
              />
            </Form.Item>
            <Form.Item name="productAttribute" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>商品属性</span>} style={{ marginRight: '24px' }}>
              <Select
                placeholder="全部" allowClear style={{ width: '180px', height: '36px' }}
                options={getDictOptionsByParent('product_attribute', searchProductType)}
                notFoundContent={searchProductType ? '该商品类型下暂无可选属性' : '请先选择商品类型'}
              />
            </Form.Item>
            <Form.Item name="status" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>状态</span>} style={{ marginRight: '24px' }}>
              <Select placeholder="全部" allowClear style={{ width: '120px', height: '36px' }}
                options={[{ label: '已生效', value: 1 }, { label: '已归档', value: 0 }]} />
            </Form.Item>
            <Form.Item label={<span style={{ fontWeight: 500, color: '#1f2937' }}>创建时间</span>} style={{ marginRight: '24px', marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Form.Item name="createdAtStart" noStyle
                  getValueProps={(v: any) => ({ value: v ? dayjs(v) : undefined })}
              normalize={(v: any) => (v ? dayjs(v).format('YYYY-MM-DD') : undefined)}
                >
                  <DatePicker style={{ width: '150px', height: '36px' }} placeholder="开始日期" />
                </Form.Item>
                <span style={{ color: '#6b7280' }}>至</span>
                <Form.Item name="createdAtEnd" noStyle
                  getValueProps={(v: any) => ({ value: v ? dayjs(v) : undefined })}
              normalize={(v: any) => (v ? dayjs(v).format('YYYY-MM-DD') : undefined)}
                >
                  <DatePicker style={{ width: '150px', height: '36px' }} placeholder="结束日期" />
                </Form.Item>
              </div>
            </Form.Item>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <Button onClick={onReset} className="crm-btn crm-btn-outline" style={{ height: '36px' }}>重置</Button>
              <Button htmlType="submit" style={{ height: '36px', padding: '0 20px', borderRadius: '6px', backgroundColor: '#3b82f6', color: '#fff', border: 'none' }}>查询</Button>
            </div>
          </Form>
        </div>

        <div className="table-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>商品列表</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Button onClick={handleExport} style={{ height: '36px', padding: '0 20px', borderRadius: '6px', borderColor: '#d1d5db', color: '#4b5563' }}>导出</Button>
            {hasPerm('product:create') && <Button onClick={() => { setImportFile(null); setIsImportOpen(true); }} style={{ height: '36px', padding: '0 20px', borderRadius: '6px', borderColor: '#d1d5db', color: '#4b5563' }}>批量导入</Button>}
            {hasPerm('product:create') && <Button onClick={() => { form.resetFields(); setEditingProduct(null); setFormProductType(undefined); setIsModalOpen(true); }} className="action-btn" style={{ height: '36px' }}>+ 新增商品</Button>}
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

      <Modal title={editingProduct ? "编辑商品" : "新增商品"} open={isModalOpen} onOk={handleAdd} onCancel={() => { setIsModalOpen(false); form.resetFields(); setEditingProduct(null); setFormProductType(undefined); }} centered className="crm-unified-modal" width={720} okText="保存" cancelText="关闭">
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
                <Select
                  placeholder="请选择商品类型"
                  options={getDictOptions('product_type')}
                  onChange={(v) => {
                    // 商品类型变更后，原商品属性可能不再属于该类型，需清空重选
                    setFormProductType(v);
                    form.setFieldValue('productAttribute', undefined);
                  }}
                />
              </Form.Item>
            </Col>
            {/* 商品属性：选项随商品类型联动，取数据字典配置（PRD 4.5.3 / 4.7）；非必填 */}
            <Col span={12}>
              <Form.Item name="productAttribute" label="商品属性">
                <Select
                  placeholder="请选择商品属性"
                  allowClear
                  options={getDictOptionsByParent('product_attribute', formProductType)}
                  notFoundContent={formProductType ? '该商品类型下暂无可选属性' : '请先选择商品类型'}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="applicableModel" label="适用车型">
                <Select placeholder="请选择适用车型" allowClear options={getDictOptions('product_applicable_model')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="installationAttr" label="安装属性">
                <Select placeholder="请选择安装属性" allowClear options={getDictOptions('product_install_attribute')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unit" label="单位" rules={[{ required: true, message: '请选择单位' }]}>
                <Select placeholder="请选择单位" options={getDictOptions('product_unit')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="costPrice" label="成本价" rules={[
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
            {/* 商品备注：整行展示（PRD 4.5.3） */}
            <Col span={24}>
              <Form.Item name="productRemark" label="商品备注" rules={[{ max: 500, message: '商品备注最多500个字符' }]}>
                <Input.TextArea placeholder="请输入商品备注" maxLength={500} showCount rows={3} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ===== 批量导入 Modal（PRD 4.5.2 / 配图 image41、image43）===== */}
      <Modal
        centered
        title="批量导入商品"
        open={isImportOpen}
        onCancel={() => { setIsImportOpen(false); setImportFile(null); }}
        width={600}
        className="crm-unified-modal"
        footer={[
          <Button key="cancel" onClick={() => { setIsImportOpen(false); setImportFile(null); }}>取消</Button>,
          <Button key="import" type="primary" loading={importing} onClick={handleImport}>开始导入</Button>,
        ]}
      >
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#475569', fontSize: '14px' }}>第一步：下载导入模板，按格式填写数据</span>
          <Button type="primary" style={{ borderRadius: '6px' }} onClick={handleDownloadTemplate}>下载模板</Button>
        </div>

        <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '16px 20px', marginBottom: '24px', border: '1px solid #E2E8F0' }}>
          <div style={{ color: '#475569', marginBottom: '10px', fontWeight: 500, fontSize: '12px' }}>
            模板包含字段（带 <span style={{ color: '#EF4444' }}>*</span> 为必填项）：
          </div>
          <div style={{ lineHeight: '26px', fontSize: '12px' }}>
            {IMPORT_HEADERS.map(h => (
              <span key={h.label} style={{ color: h.required ? '#EF4444' : '#64748B', marginRight: '10px' }}>
                {h.required ? `* ${h.label}` : h.label}
              </span>
            ))}
          </div>
        </div>

        <div style={{ color: '#475569', marginBottom: '16px', fontSize: '14px' }}>
          第二步：上传填写好的数据文件 <span style={{ color: '#94A3B8', fontSize: '12px' }}>(仅支持 .xls, .xlsx, 最大5M)</span>
        </div>

        <Upload.Dragger
          accept=".xlsx,.xls"
          style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '8px' }}
          beforeUpload={(file) => {
            if (!validateImportFile(file as File)) return Upload.LIST_IGNORE;
            setImportFile(file as any);
            return false;
          }}
          fileList={importFile ? [importFile as any] : []}
          onRemove={() => setImportFile(null)}
          showUploadList={true}
          maxCount={1}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined style={{ color: '#94A3B8', fontSize: '32px' }} />
          </p>
          <p className="ant-upload-text" style={{ color: '#64748B', fontSize: '12px' }}>点击或将文件拖拽到此处上传</p>
        </Upload.Dragger>
      </Modal>

      {/* ===== 导入结果 Modal（PRD 配图 image44、image45）===== */}
      <Modal
        centered
        open={!!importResult}
        onCancel={() => setImportResult(null)}
        footer={null}
        width={400}
        className="crm-unified-modal"
        title={null}
        closable
      >
        {importResult && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <CheckCircleFilled style={{ fontSize: '52px', color: '#10b981', marginBottom: '16px' }} />
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937', marginBottom: '20px' }}>导入处理完成</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', marginBottom: importResult.failed > 0 ? '20px' : 0 }}>
              {[
                { label: '总共操作', value: importResult.total, color: '#1f2937' },
                { label: '导入成功', value: importResult.success, color: '#10b981' },
                { label: '导入失败', value: importResult.failed, color: '#ef4444' },
              ].map((row, i) => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid #e5e7eb'
                }}>
                  <span style={{ color: '#4b5563', fontSize: '14px' }}>{row.label}</span>
                  <span style={{ color: row.color, fontSize: '16px', fontWeight: 700 }}>{row.value} 条</span>
                </div>
              ))}
            </div>
            {importResult.failed > 0 && (
              <Button
                block
                style={{ height: '40px', borderRadius: '6px', background: '#ef4444', borderColor: '#ef4444', color: '#fff', fontWeight: 500 }}
                onClick={handleDownloadErrorFile}
              >
                下载错误文件
              </Button>
            )}
          </div>
        )}
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
          const labelStyle: React.CSSProperties = { color: '#64748b', fontWeight: 500, fontSize: '12px', marginBottom: '4px' };
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
                  <div style={labelStyle}>商品属性</div>
                  <div style={valueStyle}>{detailRecord.productAttribute || '-'}</div>
                </Col>
                <Col span={12}>
                  <div style={labelStyle}>适用车型</div>
                  <div style={valueStyle}>{readApplicableModel(detailRecord) || '-'}</div>
                </Col>
              </Row>
              <Row gutter={24} style={{ marginBottom: '16px' }}>
                <Col span={12}>
                  <div style={labelStyle}>安装属性</div>
                  <div style={valueStyle}>{readInstallAttr(detailRecord) || '-'}</div>
                </Col>
                <Col span={12}>
                  <div style={labelStyle}>商品备注</div>
                  <div style={{ ...valueStyle, whiteSpace: 'pre-wrap', minHeight: '32px' }}>{detailRecord.productRemark || '-'}</div>
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
