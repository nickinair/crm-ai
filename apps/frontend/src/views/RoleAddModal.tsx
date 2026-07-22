import React, { useState } from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import request from '../utils/request';

interface RoleAddModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const RoleAddModal: React.FC<RoleAddModalProps> = ({ visible, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const res: any = await request.post('/roles', values);

      if (res.code === 200) {
        message.success('新增角色成功！');
        form.resetFields();
        onSuccess();
      } else {
        message.error(res.message || '新增角色失败！');
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

  return (
    <Modal
      centered
      title="新增角色"
      open={visible}
      onCancel={handleCancel}
      onOk={handleOk}
      confirmLoading={loading}
      width={600}
      className="crm-unified-modal"
      okText="确认新增"
      cancelText="取消"
    >
      <Form form={form} layout="vertical" initialValues={{ status: 1 }}>
        <Form.Item
          label="角色名称"
          name="roleName"
          rules={[{ required: true, message: '请输入角色名称' }, { max: 60, message: '最多60个字符' }]}
        >
          <Input placeholder="请输入角色名称" />
        </Form.Item>

        <Form.Item
          label="角色状态"
          name="status"
          rules={[{ required: true, message: '请选择角色状态' }]}
        >
          <Select>
            <Select.Option value={1}>启用</Select.Option>
            <Select.Option value={0}>停用</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          label="角色备注说明"
          name="remark"
          rules={[{ max: 100, message: '最多100个字符' }]}
        >
          <Input.TextArea placeholder="最多100个字符" rows={4} maxLength={100} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RoleAddModal;
