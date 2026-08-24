import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import request from '../utils/request';

const { Option } = Select;

interface EditCustomerModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  customerData: any;
}

const EditCustomerModal: React.FC<EditCustomerModalProps> = ({ visible, onCancel, onSuccess, customerData }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && customerData) {
      form.setFieldsValue({
        customerName: customerData.customerName,
        phone: customerData.phone,
        idCardNo: customerData.idCardNo,
        gender: customerData.gender === 1 ? '1' : customerData.gender === 2 ? '2' : '0',
        birthday: customerData.birthday ? dayjs(customerData.birthday).format('YYYY-MM-DD') : undefined,
      });
    }
  }, [visible, customerData, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      const payload = {
        ...values,
        gender: parseInt(values.gender, 10),
        birthday: values.birthday ? values.birthday : null,
      };

      const res = await request.put(`/customer/${customerData.id}`, payload) as any;
      if (!res.error) {
        message.success('客户信息更新成功');
        onSuccess();
      } else {
        message.error(res.message || '更新失败');
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      centered
      title="编辑客户"
      open={visible}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      okText="保存"
      cancelText="取消"
      width={740}
      className="crm-unified-modal"
    >
      <Form form={form} layout="vertical" className="dark-form">
        <div style={{ display: 'flex', gap: '16px' }}>
          <Form.Item label="客户编码" style={{ flex: 1 }}>
            <Input value={`CUS-${customerData?.id?.toString().padStart(5, '0')}`} disabled />
          </Form.Item>
          <Form.Item 
            label="客户姓名" 
            name="customerName" 
            style={{ flex: 1 }}
            rules={[{ required: true, message: '请输入客户姓名' }]}
          >
            <Input placeholder="请输入" />
          </Form.Item>
        </div>
        
        <div style={{ display: 'flex', gap: '16px' }}>
          <Form.Item 
            label="客户电话" 
            name="phone" 
            style={{ flex: 1 }}
            rules={[{ required: true, message: '请输入客户电话' }]}
          >
            <Input placeholder="请输入" />
          </Form.Item>
          <Form.Item label="身份证号" name="idCardNo" style={{ flex: 1 }}>
            <Input placeholder="请输入" />
          </Form.Item>
        </div>
        
        <div style={{ display: 'flex', gap: '16px' }}>
          <Form.Item label="性别" name="gender" style={{ flex: 1 }}>
            <Select placeholder="请选择">
              <Option value="1">男</Option>
              <Option value="2">女</Option>
              <Option value="0">未知</Option>
            </Select>
          </Form.Item>
          <Form.Item label="生日" name="birthday" style={{ flex: 1 }}>
            <Input type="date" onClick={(e: any) => e.target?.showPicker?.()} style={{ width: '100%', height: '40px', borderRadius: '6px', borderColor: '#d1d5db', color: '#1f2937' }} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
};

export default EditCustomerModal;
