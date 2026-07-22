import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import request from '../utils/request';

interface RoleEditModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  initialData: any;
}

const RoleEditModal: React.FC<RoleEditModalProps> = ({ visible, onCancel, onSuccess, initialData }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && initialData) {
      form.setFieldsValue({
        roleName: initialData.roleName,
        status: initialData.status,
        remark: initialData.remark,
      });
    }
  }, [visible, initialData, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const res = await request(`/roles/${initialData.id}`, {
        method: 'PUT',
        data: values,
      }) as any;

      if (res.code === 200) {
        message.success('编辑角色成功！');
        form.resetFields();
        onSuccess();
      } else {
        message.error(res.message || '编辑角色失败！');
      }
    } catch (error) {
      console.error('Validation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  const isSystemRole = initialData && ['super_admin', 'admin', 'sales'].includes(initialData.roleCode);

  return (
    <Modal
      centered
      title="编辑角色"
      open={visible}
      onCancel={handleCancel}
      onOk={handleOk}
      confirmLoading={loading}
      width={600}
      className="crm-unified-modal"
      okText="确认保存"
      cancelText="取消"
      okButtonProps={{ disabled: isSystemRole }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="角色名称"
          name="roleName"
          rules={[{ required: true, message: '请输入角色名称' }, { max: 60, message: '最多60个字符' }]}
        >
          <Input placeholder="请输入角色名称" disabled={isSystemRole} />
        </Form.Item>

        <Form.Item
          label="角色状态"
          name="status"
          rules={[{ required: true, message: '请选择角色状态' }]}
        >
          <Select disabled={isSystemRole}>
            <Select.Option value={1}>启用</Select.Option>
            <Select.Option value={0}>停用</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="角色备注说明"
          name="remark"
          rules={[{ max: 100, message: '最多100个字符' }]}
        >
          <Input.TextArea placeholder="最多100个字符" rows={4} maxLength={100} showCount disabled={isSystemRole} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RoleEditModal;
