import React, { useEffect, useState, useMemo } from 'react';
import { Table, Button, Form, Input, Select, Row, Col, Tag, Modal, message, TreeSelect, Tooltip, ConfigProvider } from 'antd';
import { PlusOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import request from '../utils/request';
import './Leads.css';

const AccountManagement: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  
  // Org Tree Data
  const [orgData, setOrgData] = useState<any[]>([]);

  // Role Data
  const [roleData, setRoleData] = useState<any[]>([]);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'add' | 'edit'>('add');
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [addForm] = Form.useForm();

  const [isResetPwdOpen, setIsResetPwdOpen] = useState(false);
  const [resetPwdForm] = Form.useForm();

  const fetchOrgs = async () => {
    try {
      const res = await request.get('/org');
      setOrgData(Array.isArray(res) ? res : (res as any).data || []);
    } catch (error) {
      console.error(error);
    }
  };

  const treeData = useMemo(() => {
    const buildTree = (parentId: string | null): any[] => {
      return orgData
        .filter(org => org.parentId === parentId && org.status === 1)
        .map(org => ({
          title: org.orgName,
          value: org.id.toString(),
          children: buildTree(org.id),
        }));
    };
    return buildTree(null);
  }, [orgData]);

  const fetchRoles = async () => {
    try {
      const res = await request.get('/roles?pageSize=1000');
      setRoleData((res as any).data?.list || (res as any).list || []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchAccounts = async (page = pagination.current, pageSize = pagination.pageSize, values: any = {}) => {
    setLoading(true);
    try {
      const params = { page, pageSize, ...values };
      const res: any = await request.get('/account', { params });
      if (res && res.data) {
        setData(res.data);
        setTotal(res.total);
      } else {
        setData(Array.isArray(res) ? res : []);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
    fetchRoles();
    fetchAccounts();
  }, []);

  const onSearch = (values: any) => {
    setPagination({ ...pagination, current: 1 });
    fetchAccounts(1, pagination.pageSize, values);
  };

  const handleTableChange = (pag: any) => {
    setPagination({ current: pag.current, pageSize: pag.pageSize });
    fetchAccounts(pag.current, pag.pageSize, form.getFieldsValue());
  };

  const handleAdd = () => {
    setModalType('add');
    addForm.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (record: any) => {
    setModalType('edit');
    setSelectedAccount(record);
    addForm.setFieldsValue({
      ...record,
      orgIds: record.orgIds ? record.orgIds.map((id: any) => id.toString()) : [],
      roleIds: record.roleIds ? record.roleIds : [],
    });
    setIsModalOpen(true);
  };

  const handleResetPwd = (record: any) => {
    setSelectedAccount(record);
    resetPwdForm.resetFields();
    resetPwdForm.setFieldsValue({ username: record.username });
    setIsResetPwdOpen(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await addForm.validateFields();
      if (modalType === 'add') {
        await request.post('/account', values);
        message.success('新增员工账号成功');
      } else {
        await request.patch(`/account/${selectedAccount.id}`, values);
        message.success('编辑员工账号成功');
      }
      setIsModalOpen(false);
      fetchAccounts();
    } catch (error: any) {
      // Error is handled by global request interceptor
    }
  };

  const handleResetPwdOk = async () => {
    if (!selectedAccount?.id) {
      message.error('未选中账号，请关闭后重新点击"重置密码"');
      return;
    }
    try {
      const values = await resetPwdForm.validateFields();
      await request.post(`/account/${selectedAccount.id}/reset-password`, { password: values.password });
      message.success(`账号「${selectedAccount.username}」密码重置成功`);
      setIsResetPwdOpen(false);
      resetPwdForm.resetFields();
    } catch (error: any) {
      // 表单校验错误静默返回；HTTP 错误由全局拦截器提示
    }
  };

  const handleDelete = (record: any) => {
    Modal.confirm({
      title: '确认删除账号',
      icon: <ExclamationCircleFilled style={{ color: '#ef4444' }} />,
      content: (
        <div style={{ lineHeight: 1.8 }}>
          <p style={{ marginBottom: 8 }}>
            您即将删除账号 <strong style={{ color: '#ef4444' }}>{record.realName || record.username}</strong>（{record.accountCode}），请确认以下风险：
          </p>
          <ul style={{ paddingLeft: 20, margin: 0, color: '#64748b', fontSize: 13 }}>
            <li>该操作<strong style={{ color: '#ef4444' }}>不可逆</strong>，删除后<strong>无法恢复</strong></li>
            <li>该账号关联的<strong>客户分配关系</strong>将被清除</li>
            <li>该账号的<strong>跟进记录、操作日志</strong>等历史数据可能受影响</li>
            <li>如仅需禁止登录，建议使用<strong>「禁用」</strong>功能替代删除</li>
          </ul>
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      width: 480,
      onOk: async () => {
        try {
          await request.delete(`/account/${record.id}`);
          message.success('账号已成功删除');
          fetchAccounts();
        } catch (error: any) {
          // Error is handled by global request interceptor
        }
      },
    });
  };

  const columns = [
    { title: '账号编码', dataIndex: 'accountCode', key: 'accountCode' },
    { title: '账号(工号)', dataIndex: 'username', key: 'username' },
    { title: '登录密码', key: 'password', render: () => '********' },
    { title: '员工真实姓名', dataIndex: 'realName', key: 'realName' },
    { title: '联系手机号', dataIndex: 'phone', key: 'phone' },
    { 
      title: '所属组织', 
      dataIndex: 'orgPaths', 
      key: 'orgPaths', 
      render: (text: string) => (
        <Tooltip title={text}>
          <div style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {text}
          </div>
        </Tooltip>
      )
    },
    {
      title: '所属角色',
      dataIndex: 'roleIds',
      key: 'roleIds',
      render: (roleIds: number[]) => {
        if (!roleIds || roleIds.length === 0) return '-';
        return roleIds.map(id => {
          const role = roleData.find(r => r.id === id);
          return role ? <Tag key={id} color="blue">{role.roleName}</Tag> : null;
        });
      }
    },
    { title: '状态', dataIndex: 'status', key: 'status', render: (status: number) => (
      <Tag color={status === 1 ? 'green' : (status === 0 ? 'red' : 'default')}>
        {status === 1 ? '正常' : (status === 0 ? '禁用' : '已离职')}
      </Tag>
    )},
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (text: string) => text ? new Date(text).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-') : '-' },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', render: (text: string) => text ? new Date(text).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-') : '-' },
    { title: '操作', key: 'action', width: 200, fixed: 'right' as const, render: (_: any, record: any) => (
      <div className="action-links">
        <a onClick={() => handleEdit(record)}>编辑</a>
        <a onClick={() => handleResetPwd(record)}>重置密码</a>
        <a onClick={() => handleDelete(record)} style={{ color: '#ef4444' }}>删除</a>
      </div>
    )}
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <div className="table-card">
        <div className="filter-section">
          <Form form={form} layout="inline" onFinish={onSearch} style={{ rowGap: 16 }}>
            <Form.Item name="username" label="关键字">
              <Input placeholder="账号/姓名/手机号" allowClear style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="orgId" label="所属组织">
              <TreeSelect
                style={{ width: 200 }}
                treeData={[{ title: '全部组织', value: 'all' }, ...treeData]}
                placeholder="请选择组织"
                allowClear
                treeDefaultExpandAll
              />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select placeholder="请选择" style={{ width: 140 }} allowClear>
                <Select.Option value="all">全部状态</Select.Option>
                <Select.Option value={1}>正常</Select.Option>
                <Select.Option value={0}>禁用</Select.Option>
                <Select.Option value={2}>已离职</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <Button onClick={() => {
                  form.resetFields();
                  setPagination({ ...pagination, current: 1 });
                  fetchAccounts(1, pagination.pageSize, {});
                }} className="crm-btn crm-btn-outline" style={{ height: '36px' }}>重置</Button>
                <Button htmlType="submit" type="primary" style={{ height: '36px' }}>查询</Button>
              </div>
            </Form.Item>
          </Form>
        </div>

        <div className="table-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>员工账号列表</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Button className="action-btn" icon={<PlusOutlined />} onClick={handleAdd} style={{ height: '36px' }}>新增员工账号</Button>
          </div>
        </div>

        <ConfigProvider getPopupContainer={(trigger) => trigger?.parentElement || document.body}>
        <Table 
          className="custom-table"
          columns={columns} 
          dataSource={data} 
          rowKey="id" 
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100', '200'],
            showTotal: (total) => `共 ${total} 条数据`,
          }}
          onChange={handleTableChange}
        />
        </ConfigProvider>
      </div>

      <Modal
        centered
        title={modalType === 'add' ? '新增员工账号' : '编辑员工账号'}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => setIsModalOpen(false)}
        okText={modalType === 'add' ? "确认新增" : "确定修改"}
        cancelText="取消"
        width={600}
        className="crm-unified-modal"
      >
        <Form form={addForm} layout="vertical">
          <Row gutter={16}>
            {modalType === 'edit' && (
              <Col span={12}>
                <Form.Item name="accountCode" label="账号编码">
                  <Input disabled />
                </Form.Item>
              </Col>
            )}
            <Col span={12}>
              <Form.Item name="username" label="账号 (工号)" rules={[
                { required: true, message: '请输入账号' },
                { pattern: /^[a-zA-Z0-9]{1,10}$/, message: '支持英文字母+数字 (最多10字符)' }
              ]}>
                <Input placeholder="支持英文字母+数字 (最多10字符)" />
              </Form.Item>
            </Col>
            {modalType === 'add' && (
              <Col span={12}>
                <Form.Item name="passwordHash" label="登录密码" rules={[
                  { required: true, message: '请输入密码' },
                  { pattern: /^[a-zA-Z0-9]{6,10}$/, message: '密码支持英文和数字，最长10个字符，最短6位' }
                ]}>
                  <Input.Password placeholder="不少于6位新密码" />
                </Form.Item>
              </Col>
            )}
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="realName" label="员工真实姓名" rules={[{ required: true, max: 30, message: '请输入员工姓名(最大30字符)' }]}>
                <Input placeholder="请输入员工姓名 (最大30字符)" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="联系手机号" rules={[{ required: true, pattern: /^1[3-9]\d{9}$/, message: '请输入11位手机号' }]}>
                <Input placeholder="11位手机号" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="orgIds" label="所属组织" rules={[{ required: true, message: '请选择所属组织' }]}>
                <TreeSelect
                  treeData={treeData}
                  placeholder="请输入搜索或选择所属组织"
                  allowClear
                  treeDefaultExpandAll
                  multiple
                  showSearch
                  treeNodeFilterProp="title"
                  maxTagCount="responsive"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="roleIds" label="所属角色" rules={[{ required: true, message: '请选择所属角色' }]}>
                <Select mode="multiple" placeholder="请选择所属角色" allowClear showSearch optionFilterProp="children" maxTagCount="responsive">
                  {roleData.map(role => (
                    <Select.Option key={role.id} value={role.id}>{role.roleName}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              {modalType === 'edit' ? (
                <Form.Item name="status" label="状态" rules={[{ required: true }]}>
                  <Select>
                    <Select.Option value={1}>正常</Select.Option>
                    <Select.Option value={0}>禁用</Select.Option>
                    <Select.Option value={2}>已离职</Select.Option>
                  </Select>
                </Form.Item>
              ) : null}
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        centered
        title="重置密码"
        open={isResetPwdOpen}
        onOk={handleResetPwdOk}
        onCancel={() => setIsResetPwdOpen(false)}
        okText="确认重置"
        cancelText="取消"
        className="crm-unified-modal"
      >
        <Form form={resetPwdForm} layout="vertical">
          <Form.Item name="username" label="账号 (工号)">
            <Input disabled />
          </Form.Item>
          <Form.Item name="password" label="新登录密码" rules={[
            { required: true, message: '请输入新密码' },
            { pattern: /^[a-zA-Z0-9]{6,10}$/, message: '密码支持英文和数字，最长10个字符，最短6位' }
          ]}>
            <Input.Password placeholder="不少于6位新密码" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" dependencies={['password']} rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('两次密码输入不一致'));
              },
            }),
          ]}>
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AccountManagement;
