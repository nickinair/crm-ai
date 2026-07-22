import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, message, AutoComplete } from 'antd';
import request from '../utils/request';
import { useVehicleOptions } from '../hooks/useVehicleOptions';
import './Customer360.css';

interface LinkVehicleModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  customerId: string;
}

const LinkVehicleModal: React.FC<LinkVehicleModalProps> = ({ open, onCancel, onSuccess, customerId }) => {
  const [form] = Form.useForm();
  const { modelOptions, styleOptions } = useVehicleOptions();

  useEffect(() => {
    if (open) {
      form.resetFields();
    }
  }, [open, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      
      const payload = {
        ...values,
        customerId,
        purchaseDate: values.purchaseDate ? values.purchaseDate : null,
      };

      await request.post(`/customer/vehicle`, payload);
      message.success('车辆关联成功');
      onSuccess();
    } catch (error) {
      console.error('Link vehicle failed:', error);
    }
  };

  const yesNoOptions = [
    { label: '是', value: '1' },
    { label: '否', value: '0' },
    { label: '未知', value: '2' },
  ];

  return (
    <Modal
      centered
      title="关联车辆"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="确定关联"
      cancelText="取消"
      width={700}
      className="crm-unified-modal"
    >
      <Form
        form={form}
        layout="vertical"
        className="grid-2-col compact-form"
        style={{ rowGap: 0 }}
      >
        <Form.Item label="车型" name="model">
          <AutoComplete
            options={modelOptions}
            filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
            placeholder="请输入或选择车型"
            allowClear
          >
            <Input />
          </AutoComplete>
        </Form.Item>
        <Form.Item label="车架号" name="vin" rules={[{ max: 25, message: '车架号(VIN)最多25位' }]}>
          <Input placeholder="请输入车架号" maxLength={25} />
        </Form.Item>
        <Form.Item label="车牌号" name="plateNo">
          <Input placeholder="请输入车牌号" />
        </Form.Item>
        <Form.Item label="款式" name="style">
          <AutoComplete
            options={styleOptions}
            filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
            placeholder="请输入或选择款式"
            allowClear
          >
            <Input />
          </AutoComplete>
        </Form.Item>
        <Form.Item label="发票日期" name="purchaseDate">
          <Input type="date" style={{ width: '100%', height: '40px', borderRadius: '6px', borderColor: '#d1d5db', color: '#1f2937' }} />
        </Form.Item>
        <Form.Item label="里程≥4万公里" name="isMileageOver40k">
          <Select placeholder="请选择" options={yesNoOptions} />
        </Form.Item>
        <Form.Item label="里程≥9.5万公里" name="isMileageOver95k">
          <Select placeholder="请选择" options={yesNoOptions} onChange={(val) => {
            if (val === '1' || val === '是') form.setFieldsValue({ isMileageOver40k: '1' });
          }} />
        </Form.Item>
        <Form.Item label="是否已购整车延保" name="hasExtendedWarranty">
          <Select placeholder="请选择" options={yesNoOptions} />
        </Form.Item>
        <Form.Item label="是否已购电池延保" name="hasBatteryWarranty">
          <Select placeholder="请选择" options={yesNoOptions} />
        </Form.Item>
        <Form.Item label="是否已购安心保" name="hasPeaceOfMind">
          <Select placeholder="请选择" options={yesNoOptions} />
        </Form.Item>
        <Form.Item label="是否已购轮胎保障" name="hasTireProtection">
          <Select placeholder="请选择" options={yesNoOptions} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default LinkVehicleModal;
