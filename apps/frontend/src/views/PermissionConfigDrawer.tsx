import React, { useState, useEffect } from 'react';
import { Drawer, Card, Switch, Checkbox, Button, message, Spin, Row, Col, Typography } from 'antd';
import request from '../utils/request';
import './PermissionConfigDrawer.css';

const { Title } = Typography;

interface PermissionConfigDrawerProps {
  visible: boolean;
  onClose: () => void;
  roleId: string | null;
  roleCode: string | null;
  roleName: string;
}

interface PermissionItem {
  id: string;
  parentId: string | null;
  permName: string;
  permCode: string;
  permType: number;
  children?: PermissionItem[];
}

const SYSTEM_ROLES = ['super_admin', 'super__admin', 'admin', 'sales'];

// 尚未上线的模块（菜单中标注"敬请期待"），暂不开放权限配置
const HIDDEN_MODULES = ['order', 'message', 'log', 'outbound'];

export const PermissionConfigDrawer: React.FC<PermissionConfigDrawerProps> = ({
  visible,
  onClose,
  roleId,
  roleCode,
  roleName,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [treeData, setTreeData] = useState<PermissionItem[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);

  const isSystemRole = roleCode ? SYSTEM_ROLES.includes(roleCode) : false;

  useEffect(() => {
    if (visible && roleId) {
      fetchData();
    }
  }, [visible, roleId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [treeRes, keysRes] = await Promise.all([
        request('/permissions/tree'),
        request(`/roles/${roleId}/permissions`)
      ]) as any;
      if (treeRes.code === 200) {
        setTreeData(treeRes.data || []);
      }
      if (keysRes.code === 200) {
        setCheckedKeys(keysRes.data || []);
      }
    } catch (error) {
      message.error('获取权限数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!roleId) return;
    setSaving(true);
    try {
      const res = await request(`/roles/${roleId}/permissions`, {
        method: 'POST',
        data: { permissionIds: checkedKeys }
      }) as any;
      if (res.code === 200) {
        message.success('保存权限成功');
        onClose();
      } else {
        message.error(res.message || '保存权限失败');
      }
    } catch (error: any) {
      // Error is handled by global request interceptor
    } finally {
      setSaving(false);
    }
  };

  // 模块开关：开 = 仅授予页面/菜单访问（子功能按需单独勾选）；关 = 连同全部子功能一起取消
  const handleCheckAllModule = (moduleData: PermissionItem, checked: boolean) => {
    if (checked) {
      setCheckedKeys(prev => Array.from(new Set([...prev, moduleData.id])));
    } else {
      const removeIds = [moduleData.id, ...(moduleData.children?.map(c => c.id) || [])];
      setCheckedKeys(prev => prev.filter(k => !removeIds.includes(k)));
    }
  };

  // 子功能勾选：勾任意一项自动打开模块开关；仅当所有子项都取消时才关闭模块开关
  const handleCheckItem = (id: string, checked: boolean, module: PermissionItem) => {
    setCheckedKeys(prev => {
      const nextKeys = new Set(prev);
      if (checked) {
        nextKeys.add(id);
        nextKeys.add(module.id);
      } else {
        nextKeys.delete(id);
        const siblingIds = module.children?.map(c => c.id) || [];
        if (!siblingIds.some(sid => nextKeys.has(sid))) {
          nextKeys.delete(module.id);
        }
      }
      return Array.from(nextKeys);
    });
  };

  return (
    <Drawer
      title={`权限配置 - ${roleName} ${isSystemRole ? '(系统内置角色不支持修改)' : ''}`}
      placement="right"
      width={720}
      onClose={onClose}
      open={visible}
      className="permission-drawer"
      extra={
        !isSystemRole && (
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存
          </Button>
        )
      }
    >
      <Spin spinning={loading}>
        <div className="permission-card-container">
          {treeData.filter(module => !HIDDEN_MODULES.includes(module.permCode)).map(module => {
            const isModuleChecked = checkedKeys.includes(module.id);

            return (
              <Card 
                key={module.id} 
                className="permission-card"
                title={<Title level={5} style={{ margin: 0 }}>{module.permName}</Title>}
                extra={
                  <Switch 
                    checked={isModuleChecked} 
                    disabled={isSystemRole}
                    onChange={(checked) => handleCheckAllModule(module, checked)}
                  />
                }
              >
                {module.children && module.children.length > 0 ? (
                  <Row gutter={[16, 16]}>
                    {module.children.map(child => (
                      <Col span={8} key={child.id}>
                        <Checkbox
                          checked={checkedKeys.includes(child.id)}
                          disabled={isSystemRole}
                          onChange={(e) => handleCheckItem(child.id, e.target.checked, module)}
                        >
                          {child.permName}
                        </Checkbox>
                      </Col>
                    ))}
                  </Row>
                ) : (
                  <span style={{ color: '#999' }}>该模块暂无子权限项</span>
                )}
              </Card>
            );
          })}
        </div>
      </Spin>
    </Drawer>
  );
};
