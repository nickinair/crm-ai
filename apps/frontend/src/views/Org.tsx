import React, { useEffect, useState } from 'react';
import { Card, Tree, Button, Modal, Form, Input, Select, message } from 'antd';
import { PlusOutlined, BankOutlined, HomeOutlined, TeamOutlined, InboxOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import request from '../utils/request';
import './Org.css';

interface Org {
  id: string;
  orgName: string;
  orgCode: string;
  parentId: string | null;
  orgLevel: number;
  status: number;
  createdAt: string;
  updatedAt: string;
  children?: Org[];
}

const buildTree = (data: Org[], parentId: string | null = null): any[] => {
  const parentStr = parentId == null ? '' : String(parentId);
  return data
    .filter(item => {
      const itemParent = item.parentId == null ? '' : String(item.parentId);
      return itemParent === parentStr;
    })
    .map(item => {
      let icon = null;
      if (item.orgLevel === 1) icon = <BankOutlined />;
      else if (item.orgLevel === 2) icon = <HomeOutlined />;
      else icon = <TeamOutlined />;

      return {
        title: item.orgName,
        key: String(item.id),
        icon,
        ...item,
        children: buildTree(data, String(item.id))
      };
    });
};

const OrgManagement: React.FC = () => {
  const [orgData, setOrgData] = useState<Org[]>([]);
  const [treeData, setTreeData] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'add' | 'edit'>('add');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchOrgs = async () => {
    try {
      const res = await request.get('/org', { params: { _t: Date.now() } });
      // Assume res is an array based on our NestJS default behavior
      const data = Array.isArray(res) ? res : (res as any).data || [];
      setOrgData(data);
      setTreeData(buildTree(data));
      setSelectedOrg(prev => {
        if (!prev) return prev;
        const updated = data.find((o: any) => String(o.id) === String(prev.id));
        return updated || prev;
      });
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const handleSelect = (selectedKeys: React.Key[], _info: any) => {
    if (selectedKeys.length > 0) {
      const org = orgData.find(o => String(o.id) === String(selectedKeys[0]));
      if (org) setSelectedOrg(org);
    }
  };

  const handleAdd = () => {
    setModalType('add');
    form.resetFields();
    if (selectedOrg) {
      form.setFieldsValue({ parentId: selectedOrg.id, orgLevel: (selectedOrg.orgLevel || 0) + 1 });
    } else {
      form.setFieldsValue({ orgLevel: 1 });
    }
    setIsModalOpen(true);
  };

  const handleEdit = () => {
    setModalType('edit');
    form.resetFields();
    if (selectedOrg) {
      form.setFieldsValue({ 
        parentId: selectedOrg.parentId,
        orgName: selectedOrg.orgName,
        orgCode: selectedOrg.orgCode,
        orgLevel: selectedOrg.orgLevel,
        status: selectedOrg.status
      });
      setIsModalOpen(true);
    }
  };

  const handleDelete = async () => {
    if (!selectedOrg) return;
    
    try {
      // Pre-check: does the org have accounts or child orgs?
      const checkResult: any = await request.get(`/org/check-delete/${selectedOrg.id}`);
      
      if (!checkResult.canDelete) {
        // Cannot delete - show warning modal
        Modal.warning({
          centered: true,
          title: '无法删除',
          icon: <ExclamationCircleOutlined />,
          content: (
            <div>
              <p style={{ marginBottom: 8 }}>{checkResult.message}</p>
              {checkResult.reason === 'hasAccounts' && (
                <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  请前往「账号管理」将相关账号迁移至其他组织或删除后，再回来删除该组织。
                </p>
              )}
              {checkResult.reason === 'hasChildren' && (
                <p style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  请先逐一删除下级子组织后，再删除当前组织。
                </p>
              )}
            </div>
          ),
          okText: '我知道了',
        });
        return;
      }

      // Safe to delete - show confirm dialog
      Modal.confirm({
        centered: true,
        title: '确认删除',
        icon: <ExclamationCircleOutlined />,
        content: `确定要删除组织「${selectedOrg.orgName}」吗？此操作不可撤销。`,
        okText: '确认删除',
        okType: 'danger',
        cancelText: '取消',
        async onOk() {
          try {
            await request.delete(`/org/${selectedOrg.id}`);
            message.success('删除组织成功');
            setSelectedOrg(null);
            fetchOrgs();
          } catch (error: any) {
            // Error message already shown by axios response interceptor in request.ts
            console.error('删除组织失败:', error);
          }
        },
      });
    } catch (error) {
      console.error('检查删除条件失败:', error);
    }
  };

  const handleModalOk = async () => {
    if (submitLoading) return;
    try {
      setSubmitLoading(true);
      const values = await form.validateFields();
      
      // Validation: orgName uniqueness under same parent
      const parentId = values.parentId || null;
      const isDuplicate = orgData.some(
        org => String(org.parentId || '') === String(parentId || '') && 
               org.orgName === values.orgName && 
               (modalType === 'add' || String(org.id) !== String(selectedOrg?.id))
      );
      
      if (isDuplicate) {
        message.error(`${values.orgName}在当前父组织下已存在！`);
        return;
      }

      // Validation: max 5 levels
      let newLevel = 1;
      if (parentId) {
        const parent = orgData.find(o => String(o.id) === String(parentId));
        newLevel = parent ? parent.orgLevel + 1 : 1;
      }

      if (modalType === 'add') {
        if (newLevel > 5) {
          message.error('当前组织及下级组织已超最大组织层级(最多5级)，请调整后重新保存！');
          return;
        }
      } else {
        const getSubtreeMaxDepth = (orgId: string): number => {
          const children = orgData.filter(o => String(o.parentId) === String(orgId));
          if (children.length === 0) return 0;
          return 1 + Math.max(...children.map(c => getSubtreeMaxDepth(c.id)));
        };
        
        const subtreeDepth = getSubtreeMaxDepth(selectedOrg!.id);
        if (newLevel + subtreeDepth > 5) {
          message.error('当前组织及下级组织已超最大组织层级(最多5级)，请调整后重新保存！');
          return;
        }
      }

      // Also ensure form submits correct level if not updated via UI
      values.orgLevel = newLevel;

      if (modalType === 'add') {
        await request.post('/org', values);
        message.success('新增组织成功');
      } else {
        await request.patch(`/org/${selectedOrg?.id}`, values);
        message.success('编辑组织成功');
        // Immediately update local state so tree + detail panel reflect new values
        const updatedOrg = { ...selectedOrg!, ...values };
        setSelectedOrg(updatedOrg);
        const newOrgData = orgData.map(o => String(o.id) === String(selectedOrg?.id) ? { ...o, ...values } : o);
        setOrgData(newOrgData);
        setTreeData(buildTree(newOrgData));
      }
      
      setIsModalOpen(false);
      // Also fetch from server to get authoritative data (e.g. updatedAt)
      fetchOrgs();
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '20px' }}>
      <Card title="组织架构树" className="org-card" style={{ width: 300, minHeight: 'calc(100vh - 160px)' }} extra={<Button className="action-btn" icon={<PlusOutlined />} style={{ height: '36px' }} onClick={handleAdd}>新增组织</Button>}>
        {treeData.length > 0 ? (
          <Tree
            className="org-tree"
            showLine={true}
            treeData={treeData}
            onSelect={handleSelect}
            defaultExpandAll
            selectedKeys={selectedOrg ? [selectedOrg.id] : []}
          />
        ) : (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: 50 }}>暂无组织，请新建</p>
        )}
      </Card>

      <Card className="org-card" style={{ flex: 1 }} bordered={false}>
        {selectedOrg ? (
          <div className="org-detail-container">
            <div className="org-detail-header">
              <div className="org-detail-title-section">
                <h2>{selectedOrg.orgName}</h2>
                <span className="org-detail-code">组织编码: {selectedOrg.orgCode}</span>
              </div>
              <div className="org-detail-actions">
                <Button className="ghost-btn" style={{ height: '36px' }} onClick={handleEdit}>编辑</Button>
                <Button className="ghost-btn" danger style={{ height: '36px', marginLeft: 8 }} onClick={handleDelete}>删除</Button>
              </div>
            </div>
            <div className="org-detail-divider" />
            
            <div className="org-detail-grid">
              <div className="org-detail-item">
                <div className="org-detail-label">组织ID</div>
                <div className="org-detail-value">{selectedOrg.id}</div>
              </div>
              <div className="org-detail-item">
                <div className="org-detail-label">组织编码</div>
                <div className="org-detail-value">{selectedOrg.orgCode}</div>
              </div>
              <div className="org-detail-item">
                <div className="org-detail-label">所属父级组织</div>
                <div className="org-detail-value">
                  {orgData.find(o => o.id === selectedOrg.parentId)?.orgName || '总部'}
                </div>
              </div>
              <div className="org-detail-item">
                <div className="org-detail-label">组织名称</div>
                <div className="org-detail-value">{selectedOrg.orgName}</div>
              </div>
              <div className="org-detail-item">
                <div className="org-detail-label">组织层级</div>
                <div className="org-detail-value">{selectedOrg.orgLevel}级{selectedOrg.orgLevel === 3 ? ' - 销售组' : ''}</div>
              </div>
              <div className="org-detail-item">
                <div className="org-detail-label">状态</div>
                <div className="org-detail-value">
                  <span className={`status-pill ${selectedOrg.status === 1 ? 'status-active' : 'status-inactive'}`}>
                    {selectedOrg.status === 1 ? '启用' : '禁用'}
                  </span>
                </div>
              </div>
              <div className="org-detail-item">
                <div className="org-detail-label">创建时间</div>
                <div className="org-detail-value">{new Date(selectedOrg.createdAt).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')}</div>
              </div>
              <div className="org-detail-item">
                <div className="org-detail-label">更新时间</div>
                <div className="org-detail-value">{selectedOrg.updatedAt ? new Date(selectedOrg.updatedAt).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-') : '-'}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="org-empty-state">
            <InboxOutlined className="empty-icon" />
            <h3>未选择组织</h3>
            <p>请在左侧点击选择一个组织以查看详情</p>
          </div>
        )}
      </Card>

      <Modal
        centered
        title={modalType === 'add' ? '新增组织' : '编辑组织'}
        open={isModalOpen}
        onOk={handleModalOk}
        confirmLoading={submitLoading}
        onCancel={() => setIsModalOpen(false)}
        okText="保存"
        cancelText="取消"
        className="crm-unified-modal"
      >
        <Form 
          form={form} 
          layout="vertical"
          onValuesChange={(changedValues) => {
            if ('parentId' in changedValues) {
              const parentId = changedValues.parentId;
              if (parentId) {
                const parent = orgData.find(o => o.id === parentId);
                form.setFieldsValue({ orgLevel: parent ? parent.orgLevel + 1 : 1 });
              } else {
                form.setFieldsValue({ orgLevel: 1 });
              }
            }
          }}
        >
          <Form.Item name="parentId" label="所属父级组织">
            <Select allowClear placeholder="无 (根组织)">
              {orgData.filter(org => org.status === 1).map(org => (
                <Select.Option key={org.id} value={org.id}>{org.orgName}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="orgName" label="组织名称" rules={[{ required: true, max: 30, message: '请输入组织名称(最多30字符)' }]}>
            <Input placeholder="请输入组织名称" />
          </Form.Item>
          {modalType === 'edit' && (
            <Form.Item name="orgCode" label="组织编码">
              <Input disabled />
            </Form.Item>
          )}
          <Form.Item name="orgLevel" label="组织层级" rules={[{ required: true, message: '请选择组织层级' }]}>
            <Select disabled>
              <Select.Option value={1}>1级 - 集团</Select.Option>
              <Select.Option value={2}>2级 - 门店</Select.Option>
              <Select.Option value={3}>3级 - 团队</Select.Option>
              <Select.Option value={4}>4级 - 部门</Select.Option>
              <Select.Option value={5}>5级 - 小组</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue={1}>
            <Select>
              <Select.Option value={1}>启用</Select.Option>
              <Select.Option value={0}>禁用</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default OrgManagement;
