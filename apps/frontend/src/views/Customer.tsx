import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Select, Row, Col, Modal, message, Table, Tooltip, ConfigProvider } from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import request from '../utils/request';
import { hasPerm } from '../utils/perm';
import './Leads.css';

const CustomerManagement: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromWorkbench = searchParams.get('from') === 'workbench';
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [salesList, setSalesList] = useState<{ id: string; name: string }[]>([]);

  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : {};
  const roleCode = String(user.roleCode || '').toLowerCase();
  const isSales = roleCode === 'sales' || user.roleName === '销售';
  
  // Add customer modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addForm] = Form.useForm();

  // Edit customer modal
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [editingRecord, setEditingRecord] = useState<any>(null);

  // Detail modal
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Vehicle modal
  const [isVehicleOpen, setIsVehicleOpen] = useState(false);
  const [vehicleData, setVehicleData] = useState<any[]>([]);
  const [vehicleLoading, setVehicleLoading] = useState(false);

  const fetchCustomers = async (values: any = {}) => {
    setLoading(true);
    try {
      const formValues = form.getFieldsValue();
      const params: any = { ...formValues, ...values, page: values.page || currentPage, limit: values.limit || pageSize };
      if (fromWorkbench) {
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : {};
        // If it's a sales user, strictly show their own customers.
        // If it's an admin, default to their own customers unless they explicitly filtered by someone else.
        const role = String(user.roleCode || '').toLowerCase();
        const userIsSales = role === 'sales' || user.roleName === '销售';
        if (user.id && (userIsSales || !params.ownerId)) {
          params.ownerId = userIsSales ? user.id : (params.ownerId || user.id);
        }
      }
      const res = await request.get('/customer', { params });
      const items = (res as any).items || (Array.isArray(res) ? res : ((res as any).data || []));
      setData(items);
      setTotal((res as any).total || items.length);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers({ page: 1, limit: 10 });
    request.get('/account/sales-list').then((res: any) => {
      setSalesList(Array.isArray(res) ? res : []);
    }).catch(() => {});
  }, []);

  const onSearch = (values: any) => {
    setCurrentPage(1);
    fetchCustomers({ ...values, page: 1, limit: pageSize });
  };

  const handleExport = async () => {
    try {
      message.loading({ content: '正在导出...', key: 'exporting' });
      const values = await form.validateFields();
      const params: any = { ...values };
      if (fromWorkbench) {
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : {};
        if (user.id) params.ownerId = user.id;
      }
      const res = await request.get('/customer/export', { params });
      const items = Array.isArray(res) ? res : ((res as any).data || []);
      
      if (!items || items.length === 0) {
        message.warning({ content: '暂无数据可导出', key: 'exporting' });
        return;
      }
      
      const exportData = items.map((item: any, index: number) => {
        const c = item;
        const v = item.vehicle || {};
        
        let ageStr = '-';
        if (v.purchaseDate) {
          const months = dayjs().diff(dayjs(v.purchaseDate), 'month', true);
          ageStr = months > 0 ? months.toFixed(2) : '-';
        }
        
        return {
          '客户编码': `CUS-${String(c.id || index + 10001).padStart(5, '0')}`,
          '客户姓名': c.customerName || '-',
          '客户电话': c.phone || '-',
          '身份证号': c.idCardNo || '-',
          '性别': c.gender === 1 ? '男' : (c.gender === 2 ? '女' : '-'),
          '生日': c.birthday || '-',
          '所属销售': c.ownerName || '-',
          '客户备注': c.remark || '-',
          '创建时间': c.createdAt ? dayjs(c.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-',
          '更新时间': c.updatedAt ? dayjs(c.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-',
          '品牌': v.brand || '-',
          '车型': v.model || '-',
          '车架号': v.vin || '-',
          '车牌号': v.plateNo || '-',
          '款式': v.style || '-',
          '里程数': v.mileage != null ? v.mileage : '-',
          '发票日期': v.purchaseDate ? v.purchaseDate.substring(0, 10) : '-',
          '车龄（月）': ageStr,
          '车辆创建时间': v.createdAt ? dayjs(v.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-',
        };
      });
      
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '客户信息');
      XLSX.writeFile(wb, `客户信息_${dayjs().format('YYMMDD HH:mm:ss')}.xlsx`);
      message.success({ content: '导出成功', key: 'exporting' });
    } catch (error) {
      console.error(error);
      message.error({ content: '导出失败', key: 'exporting' });
    }
  };

  // ---- Add Customer ----
  const handleAdd = () => {
    addForm.resetFields();
    setIsModalOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await addForm.validateFields();
      await request.post('/customer', values);
      message.success('新增客户成功');
      setIsModalOpen(false);
      fetchCustomers();
    } catch (error: any) {
      if (error?.errorFields) return;
      // Global interceptor already shows error message
    }
  };

  // ---- Edit Customer ----
  const handleEdit = (record: any) => {
    setEditingRecord(record);
    editForm.setFieldsValue({
      customerName: record.customerName,
      phone: record.phone,
      idCardNo: record.idCardNo,
      gender: record.gender === 1 || record.gender === 2 ? record.gender : undefined,
      birthday: record.birthday ? record.birthday.substring(0, 10) : undefined,
    });
    setIsEditOpen(true);
  };

  const handleEditOk = async () => {
    try {
      const values = await editForm.validateFields();
      await request.put(`/customer/${editingRecord.id}`, values);
      message.success('保存成功');
      setIsEditOpen(false);
      fetchCustomers();
    } catch (error: any) {
      if (error?.errorFields) return;
      // Global interceptor already shows error message
    }
  };

  // ---- Detail ----
  const handleDetail = async (record: any) => {
    setDetailLoading(true);
    setIsDetailOpen(true);
    try {
      const res = await request.get(`/customer/360/${record.id}`);
      setDetailData(res);
    } catch (error) {
      message.error('加载客户详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  // ---- Vehicle Info ----
  const handleVehicle = async (record: any) => {
    setVehicleLoading(true);
    setIsVehicleOpen(true);
    try {
      const res: any = await request.get(`/customer/360/${record.id}`);
      setVehicleData(res?.vehicles || []);
    } catch (error) {
      message.error('加载车辆信息失败');
    } finally {
      setVehicleLoading(false);
    }
  };

  const boolLabel = (val: any) => val === true || val === 1 || val === '1' || val === '是' ? '是' : '否';

  const vehicleColumns = [
    { title: '品牌', dataIndex: 'brand', width: 100, render: (v: string) => v || '-' },
    { title: '车型', dataIndex: 'model', width: 120, render: (v: string) => v || '-' },
    { title: '车架号', dataIndex: 'vin', width: 160, render: (v: string) => v || '-' },
    { title: '车牌号', dataIndex: 'plateNo', width: 120, render: (v: string) => v || '-' },
    { title: '款式', dataIndex: 'style', width: 160, render: (v: string) => v || '-' },
    { title: '里程数', dataIndex: 'mileage', width: 100, render: (v: number) => v != null ? v : '-' },
    { title: '发票日期', dataIndex: 'purchaseDate', width: 120, render: (v: string) => v ? v.substring(0, 10) : '-' },
    { title: '车龄（年）', key: 'age', width: 100, render: (_: any, r: any) => {
      if (!r.purchaseDate) return '-';
      const months = dayjs().diff(dayjs(r.purchaseDate), 'month', true);
      return months > 0 ? (months / 12).toFixed(2) : '-';
    }},
    { title: '创建时间', dataIndex: 'createdAt', width: 200, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-' },
    { title: '更新时间', dataIndex: 'updatedAt', width: 200, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-' },
    { title: '里程≥4万公里', dataIndex: 'isMileageOver40k', width: 130, render: boolLabel },
    { title: '里程≥9.5万公里', dataIndex: 'isMileageOver95k', width: 140, render: boolLabel },
    { title: '是否已购整车延保', dataIndex: 'hasExtendedWarranty', width: 140, render: boolLabel },
    { title: '是否已购电池延保', dataIndex: 'hasBatteryWarranty', width: 140, render: boolLabel },
    { title: '是否已购安心保', dataIndex: 'hasPeaceOfMind', width: 130, render: boolLabel },
    { title: '是否已购轮胎保障', dataIndex: 'hasTireProtection', width: 140, render: boolLabel },
  ];

  const columns = [
    { title: '客户编码', dataIndex: 'id', render: (val: any, _record: any, index: number) => `CUS-${String(val || index + 10001).padStart(5, '0')}` },
    { title: '客户姓名', dataIndex: 'customerName', render: (val: string) => (
      <Tooltip title={val}>
        <div style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {val}
        </div>
      </Tooltip>
    ) },
    { title: '客户电话', dataIndex: 'phone' },
    { title: '身份证号', dataIndex: 'idCardNo', width: 180, render: (val: string) => val || '-' },
    { title: '性别', dataIndex: 'gender', render: (val: number) => val === 1 ? '男' : (val === 2 ? '女' : '-') },
    { title: '生日', dataIndex: 'birthday', render: (val: string) => val || '-' },
    ...(isSales ? [] : [{ title: '所属销售', dataIndex: 'ownerName', render: (val: string) => val || '-' }]),
    { title: '客户备注', dataIndex: 'remark', render: (val: string) => val || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 200, render: (val: string) => val ? val.substring(0, 19).replace('T', ' ') : '-' },
    { title: '更新时间', dataIndex: 'updatedAt', width: 200, render: (val: string) => val ? val.substring(0, 19).replace('T', ' ') : '-' },
    { title: '操作', key: 'action', fixed: 'right' as const, width: 220, render: (_val: any, record: any) => {
      return (
        <div style={{ display: 'flex', gap: '8px' }}>
          {hasPerm('customer:edit', 'workbench') && <a onClick={() => handleEdit(record)} style={{ color: '#3b82f6', fontSize: '14px' }}>编辑</a>}
          {isSales ? (
            <a onClick={() => navigate(`/customer/detail/${record.id}?from=${fromWorkbench ? 'workbench_customer' : 'customer'}`)} style={{ color: '#3b82f6', fontSize: '14px' }}>客户360</a>
          ) : (
            <>
              <a onClick={() => handleDetail(record)} style={{ color: '#3b82f6', fontSize: '14px' }}>详情</a>
              <a onClick={() => handleVehicle(record)} style={{ color: '#3b82f6', fontSize: '14px' }}>查看车辆信息</a>
            </>
          )}
        </div>
      );
    }}
  ];

  // ---- Label style for detail modal ----
  const labelStyle: React.CSSProperties = { color: '#64748b', fontWeight: 500, fontSize: '12px', marginBottom: '4px' };
  const valueStyle: React.CSSProperties = { background: '#f1f5f9', borderRadius: '6px', padding: '6px 14px', fontSize: '14px', color: '#1f2937', lineHeight: '24px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <div className="table-card">
        <div className="filter-section" style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e5e7eb' }}>
          <Form form={form} layout="inline" onFinish={onSearch} style={{ display: 'flex', width: '100%', alignItems: 'center', flexWrap: 'wrap', rowGap: '12px' }}>
            <Form.Item name="customerName" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>客户姓名</span>} style={{ marginRight: '24px' }}>
              <Input placeholder="请输入客户姓名" allowClear style={{ width: '200px', height: '36px', borderRadius: '6px' }} />
            </Form.Item>
            <Form.Item name="phone" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>客户电话</span>} style={{ marginRight: '24px' }}>
              <Input placeholder="请输入客户电话" allowClear style={{ width: '200px', height: '36px', borderRadius: '6px' }} />
            </Form.Item>
            <Form.Item name="idCardNo" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>身份证号</span>} style={{ marginRight: '24px' }}>
              <Input placeholder="请输入身份证号" allowClear style={{ width: '200px', height: '36px', borderRadius: '6px' }} />
            </Form.Item>
            {!isSales && (
              <Form.Item name="ownerId" label={<span style={{ fontWeight: 500, color: '#1f2937' }}>所属销售</span>}>
                <Select placeholder="全部" allowClear style={{ width: '150px', height: '36px' }}
                  options={salesList.map(s => ({ label: s.name, value: s.id }))}
                />
              </Form.Item>
            )}
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <Button onClick={() => { form.resetFields(); setCurrentPage(1); fetchCustomers({ page: 1, limit: pageSize }); }} className="crm-btn crm-btn-outline" style={{ height: '36px' }}>重置</Button>
              <Button htmlType="submit" style={{ height: '36px', padding: '0 20px', borderRadius: '6px', backgroundColor: '#3b82f6', color: '#fff', border: 'none' }}>查询</Button>
            </div>
          </Form>
        </div>

        <div className="table-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>客户列表</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {hasPerm('customer:export', 'workbench') && <Button onClick={handleExport} style={{ height: '36px', padding: '0 20px', borderRadius: '6px', borderColor: '#d1d5db', color: '#4b5563' }}>导出</Button>}
            {hasPerm('customer:create') && <Button onClick={handleAdd} className="action-btn" style={{ height: '36px' }}>+ 新增客户</Button>}
          </div>
        </div>

        <ConfigProvider getPopupContainer={(trigger) => trigger?.parentElement || document.body}>
        <Table 
          className="custom-table"
          columns={columns} 
          dataSource={data} 
          rowKey="id" 
          loading={loading}
          locale={loading ? { emptyText: ' ' } : undefined}
          scroll={{ x: 1800 }}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100', '200'],
            showTotal: (t) => `共 ${t} 条记录`,
            onChange: (p, s) => { 
              setCurrentPage(p); 
              setPageSize(s); 
              fetchCustomers({ ...form.getFieldsValue(), page: p, limit: s });
            },
          }}
        />
        </ConfigProvider>
      </div>

      {/* ===== 新增客户 Modal ===== */}
      <Modal
        centered
        title="新增客户"
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        okText="确认"
        cancelText="取消"
        width={640}
        className="crm-unified-modal"
      >
        <Form form={addForm} layout="vertical" requiredMark={(label, { required }) => (
          <>{required && <span style={{ color: '#ef4444', marginRight: '4px' }}>*</span>}{label}</>
        )}>
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item name="customerName" label={<span style={{ color: '#1f2937', fontWeight: 500 }}>客户姓名</span>} rules={[
                { required: true, message: '客户姓名必填' },
                { max: 30, message: '姓名最多30个字符' }
              ]}>
                <Input placeholder="请输入客户姓名" maxLength={30} showCount style={{ height: '40px', borderRadius: '6px', borderColor: '#d1d5db' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label={<span style={{ color: '#1f2937', fontWeight: 500 }}>客户电话</span>} rules={[
                { required: true, message: '客户电话必填' },
                { pattern: /^\d{11}$/, message: '电话号码必须是11位数字' }
              ]}>
                <Input placeholder="请输入客户电话" maxLength={11} showCount style={{ height: '40px', borderRadius: '6px', borderColor: '#d1d5db' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item name="idCardNo" label={<span style={{ color: '#1f2937', fontWeight: 500 }}>身份证号</span>} rules={[
                { pattern: /^[0-9A-Za-z]+$/, message: '身份证仅支持数字和英文字符' },
                { max: 18, message: '身份证最多18个字符' }
              ]}>
                <Input placeholder="请输入身份证号" maxLength={18} showCount style={{ height: '40px', borderRadius: '6px', borderColor: '#d1d5db' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="gender" label={<span style={{ color: '#1f2937', fontWeight: 500 }}>性别</span>}>
                <Select placeholder="请选择性别" allowClear style={{ height: '40px' }}>
                  <Select.Option value={1}>男</Select.Option>
                  <Select.Option value={2}>女</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item name="birthday" label={<span style={{ color: '#1f2937', fontWeight: 500 }}>生日</span>}>
                <Input type="date" style={{ width: '100%', height: '40px', borderRadius: '6px', borderColor: '#d1d5db', color: '#1f2937' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ===== 编辑客户 Modal ===== */}
      <Modal
        centered
        title="编辑客户"
        open={isEditOpen}
        onOk={handleEditOk}
        onCancel={() => setIsEditOpen(false)}
        okText="保存"
        cancelText="取消"
        width={640}
        className="crm-unified-modal"
      >
        <Form form={editForm} layout="vertical" requiredMark={(label, { required }) => (
          <>{required && <span style={{ color: '#ef4444', marginRight: '4px' }}>*</span>}{label}</>
        )}>
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item label={<span style={{ color: '#1f2937', fontWeight: 500 }}>客户编码</span>}>
                <Input disabled value={editingRecord ? `CUS-${String(editingRecord.id).padStart(5, '0')}` : ''} style={{ height: '40px', borderRadius: '6px', background: '#f1f5f9' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customerName" label={<span style={{ color: '#1f2937', fontWeight: 500 }}>客户姓名</span>} rules={[
                { required: true, message: '客户姓名必填' },
                { max: 30, message: '姓名最多30个字符' }
              ]}>
                <Input placeholder="请输入客户姓名" maxLength={30} showCount style={{ height: '40px', borderRadius: '6px', borderColor: '#d1d5db' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item name="phone" label={<span style={{ color: '#1f2937', fontWeight: 500 }}>客户电话</span>} rules={[
                { required: true, message: '客户电话必填' },
                { pattern: /^\d{11}$/, message: '电话号码必须是11位数字' }
              ]}>
                <Input placeholder="请输入客户电话" maxLength={11} showCount style={{ height: '40px', borderRadius: '6px', borderColor: '#d1d5db' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="idCardNo" label={<span style={{ color: '#1f2937', fontWeight: 500 }}>身份证号</span>} rules={[
                { pattern: /^[0-9A-Za-z]*$/, message: '身份证仅支持数字和英文字符' },
                { max: 18, message: '身份证最多18个字符' }
              ]}>
                <Input placeholder="请输入身份证号" maxLength={18} showCount style={{ height: '40px', borderRadius: '6px', borderColor: '#d1d5db' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item name="gender" label={<span style={{ color: '#1f2937', fontWeight: 500 }}>性别</span>}>
                <Select placeholder="请选择性别" style={{ height: '40px' }}>
                  <Select.Option value={1}>男</Select.Option>
                  <Select.Option value={2}>女</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="birthday" label={<span style={{ color: '#1f2937', fontWeight: 500 }}>生日</span>}>
                <Input type="date" style={{ width: '100%', height: '40px', borderRadius: '6px', borderColor: '#d1d5db', color: '#1f2937' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ===== 客户详情 Modal ===== */}
      <Modal
        centered
        title="客户详情"
        open={isDetailOpen}
        onCancel={() => { setIsDetailOpen(false); setDetailData(null); }}
        footer={<Button onClick={() => { setIsDetailOpen(false); setDetailData(null); }}>关闭</Button>}
        width={720}
        className="crm-unified-modal"
        loading={detailLoading}
      >
        {detailData && (
          <div>
            <Row gutter={24} style={{ marginBottom: '16px' }}>
              <Col span={12}>
                <div style={labelStyle}>客户编码</div>
                <div style={valueStyle}>{`CUS-${String(detailData.id).padStart(5, '0')}`}</div>
              </Col>
              <Col span={12}>
                <div style={labelStyle}>客户姓名</div>
                <div style={valueStyle}>{detailData.customerName || '-'}</div>
              </Col>
            </Row>
            <Row gutter={24} style={{ marginBottom: '16px' }}>
              <Col span={12}>
                <div style={labelStyle}>客户电话</div>
                <div style={valueStyle}>{detailData.phone || '-'}</div>
              </Col>
              <Col span={12}>
                <div style={labelStyle}>身份证号</div>
                <div style={valueStyle}>{detailData.idCardNo || '-'}</div>
              </Col>
            </Row>
            <Row gutter={24} style={{ marginBottom: '16px' }}>
              <Col span={12}>
                <div style={labelStyle}>性别</div>
                <div style={valueStyle}>{detailData.gender === 1 ? '男' : (detailData.gender === 2 ? '女' : '-')}</div>
              </Col>
              <Col span={12}>
                <div style={labelStyle}>生日</div>
                <div style={valueStyle}>{detailData.birthday || '-'}</div>
              </Col>
            </Row>
            <Row gutter={24} style={{ marginBottom: '16px' }}>
              <Col span={12}>
                <div style={labelStyle}>所属销售</div>
                <div style={valueStyle}>{detailData.relations?.length > 0 ? (detailData.relations[0].accountName || '-') : '-'}</div>
              </Col>
              <Col span={12}>
                <div style={labelStyle}>创建时间</div>
                <div style={valueStyle}>{detailData.createdAt ? dayjs(detailData.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-'}</div>
              </Col>
            </Row>
            <Row gutter={24} style={{ marginBottom: '24px' }}>
              <Col span={12}>
                <div style={labelStyle}>更新时间</div>
                <div style={valueStyle}>{detailData.updatedAt ? dayjs(detailData.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}</div>
              </Col>
            </Row>

            {/* 客户备注 */}
            <div style={{ fontWeight: 600, fontSize: '16px', color: '#1f2937', marginBottom: '12px' }}>客户备注</div>
            {detailData.notes && detailData.notes.length > 0 ? detailData.notes.map((note: any, idx: number) => (
              <div key={idx} style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px 16px', marginBottom: '10px', borderLeft: '3px solid #3b82f6' }}>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                  {note.createdAt ? dayjs(note.createdAt).format('YYYY-MM-DD HH:mm:ss') : '-'} - {note.createdByName || note.createdByAccount || '-'}
                </div>
                <div style={{ fontSize: '14px', color: '#1f2937' }}>{note.noteContent}</div>
              </div>
            )) : (
              <div style={{ color: '#94a3b8', fontSize: '14px' }}>暂无备注</div>
            )}
          </div>
        )}
      </Modal>

      {/* ===== 车辆信息详情 Modal ===== */}
      <Modal
        centered
        title="车辆信息详情"
        open={isVehicleOpen}
        onCancel={() => { setIsVehicleOpen(false); setVehicleData([]); }}
        footer={<Button onClick={() => { setIsVehicleOpen(false); setVehicleData([]); }}>关闭</Button>}
        width={1000}
        className="crm-unified-modal"
      >
        <Table
          columns={vehicleColumns}
          dataSource={vehicleData}
          rowKey="id"
          loading={vehicleLoading}
          scroll={{ x: 'max-content' }}
          pagination={{
            pageSize: 5,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100', '200'],
            showTotal: (t) => `共 ${t} 条数据`,
          }}
        />
      </Modal>
    </div>
  );
};

export default CustomerManagement;
