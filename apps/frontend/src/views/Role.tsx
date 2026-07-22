import React, { useState, useEffect } from 'react';
import { Table, Button, Tag, message, ConfigProvider } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import RoleAddModal from './RoleAddModal';
import RoleEditModal from './RoleEditModal';
import { PermissionConfigDrawer } from './PermissionConfigDrawer';
import request from '../utils/request';

const SYSTEM_ROLES = ['super_admin', 'super__admin', 'admin', 'sales'];

const RoleManagement: React.FC = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isPermissionDrawerVisible, setIsPermissionDrawerVisible] = useState(false);
  const [currentRole, setCurrentRole] = useState<any>(null);

  const handleOpenPermission = (record: any) => {
    setCurrentRole(record);
    setIsPermissionDrawerVisible(true);
  };

  const handleEdit = (record: any) => {
    setCurrentRole(record);
    setIsEditModalVisible(true);
  };

  const columns = [
    { title: '角色ID', dataIndex: 'id', render: (_: any, record: any) => 'ROLE-' + String(record.id).padStart(3, '0') },
    { title: '角色名称', dataIndex: 'roleName' },
    { title: '角色编码', dataIndex: 'roleCode' },
    { title: '角色备注说明', dataIndex: 'remark' },
    { title: '状态', dataIndex: 'status', render: (val: number) => <Tag color={val === 1 ? 'green' : 'red'}>{val === 1 ? '启用' : '停用'}</Tag> },
    { title: '操作', render: (_: any, record: any) => (
      <div className="action-links">
        <a 
          onClick={() => handleEdit(record)}
          style={{ color: SYSTEM_ROLES.includes(record.roleCode) ? '#999' : undefined }}
          title={SYSTEM_ROLES.includes(record.roleCode) ? '系统内置角色不支持修改，点击可只读查看' : ''}
        >
          编辑
        </a>
        <a 
          onClick={() => handleOpenPermission(record)}
          style={{ color: SYSTEM_ROLES.includes(record.roleCode) ? '#999' : undefined }}
          title={SYSTEM_ROLES.includes(record.roleCode) ? '系统内置角色不支持修改，点击可只读查看' : ''}
        >
          权限配置
        </a>
      </div>
    )}
  ];

  const fetchRoles = async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const res: any = await request.get(`/roles`, { params: { page, pageSize } });
      if (res.code === 200) {
        setData(res.data.list);
        setPagination({
          current: res.data.page,
          pageSize: res.data.pageSize,
          total: res.data.total,
        });
      } else {
        message.error(res.message || '获取角色列表失败');
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error);
      message.error('获取角色列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleTableChange = (pag: any) => {
    fetchRoles(pag.current, pag.pageSize);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <div className="table-card">
        <div className="table-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>角色管理</h3>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Button className="action-btn" icon={<PlusOutlined />} style={{ height: '36px' }} onClick={() => setIsAddModalVisible(true)}>
              新增角色
            </Button>
          </div>
        </div>
        <ConfigProvider getPopupContainer={(trigger) => trigger?.parentElement || document.body}>
        <Table 
          className="custom-table" 
          columns={columns} 
          dataSource={data} 
          rowKey="id" 
          loading={loading}
          pagination={{ ...pagination, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100', '200'] }}
          onChange={handleTableChange}
        />
        </ConfigProvider>
      </div>

      <RoleAddModal 
        visible={isAddModalVisible}
        onCancel={() => setIsAddModalVisible(false)}
        onSuccess={() => {
          setIsAddModalVisible(false);
          fetchRoles(1, pagination.pageSize);
        }}
      />

      <RoleEditModal
        visible={isEditModalVisible}
        onCancel={() => {
          setIsEditModalVisible(false);
          setCurrentRole(null);
        }}
        onSuccess={() => {
          setIsEditModalVisible(false);
          setCurrentRole(null);
          fetchRoles(pagination.current, pagination.pageSize);
        }}
        initialData={currentRole}
      />

      <PermissionConfigDrawer
        visible={isPermissionDrawerVisible}
        onClose={() => {
          setIsPermissionDrawerVisible(false);
          setCurrentRole(null);
        }}
        roleId={currentRole?.id || null}
        roleCode={currentRole?.roleCode || null}
        roleName={currentRole?.roleName || ''}
      />
    </div>
  );
};

export default RoleManagement;
