import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, message, Row, Col, AutoComplete } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import request from '../utils/request';
import { useDict } from '../hooks/useDict';
import './Customer360.css';

interface EditVehicleModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  vehicleInfo: any;
  customerId?: string;
  leadId?: string;
}

const EditVehicleModal: React.FC<EditVehicleModalProps> = ({ open, onCancel, onSuccess, vehicleInfo, customerId, leadId }) => {
  const [form] = Form.useForm();
  const { getDictOptions } = useDict();
  // 品牌/车型/款式选项改为数据字典驱动（PRD 4.7）
  const brandOptions = getDictOptions('vehicle_brand');
  const modelOptions = getDictOptions('vehicle_model');
  const styleOptions = getDictOptions('vehicle_style');

  useEffect(() => {
    if (open && vehicleInfo) {
      form.setFieldsValue({
        brand: vehicleInfo.brand,
        model: vehicleInfo.model,
        style: vehicleInfo.style,
        vin: vehicleInfo.vin,
        plateNo: vehicleInfo.plateNo,
        purchaseDate: vehicleInfo.purchaseDate ? dayjs(vehicleInfo.purchaseDate).format('YYYY-MM-DD') : undefined,
        mileage: vehicleInfo.mileage,
        isMileageOver40k: vehicleInfo.isMileageOver40k,
        isMileageOver95k: vehicleInfo.isMileageOver95k,
        hasExtendedWarranty: vehicleInfo.hasExtendedWarranty,
        hasBatteryWarranty: vehicleInfo.hasBatteryWarranty,
        hasPeaceOfMind: vehicleInfo.hasPeaceOfMind,
        hasTireProtection: vehicleInfo.hasTireProtection,
      });
    } else {
      form.resetFields();
    }
  }, [open, vehicleInfo, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      
      const payload = {
        ...values,
        purchaseDate: values.purchaseDate ? values.purchaseDate : null,
      };

      if (vehicleInfo && vehicleInfo.id) {
        await request.put(`/customer/vehicle/${vehicleInfo.id}`, payload);
        message.success('车辆信息更新成功');
      } else {
        if (!customerId) {
          message.error('缺少客户ID');
          return;
        }
        await request.post('/customer/vehicle', { ...payload, customerId, leadId });
        message.success('车辆信息保存成功');
      }
      onSuccess();
    } catch (error) {
      console.error('Update vehicle failed:', error);
    }
  };

  const handle95kChange = (val: string) => {
    if (val === '1' || val === '是') {
      form.setFieldsValue({ isMileageOver40k: '1' });
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
      title="编辑车辆信息"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="确定修改"
      cancelText="取消"
      width={700}
      className="crm-unified-modal"
    >
      <Form
        form={form}
        layout="vertical"
      >
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item label="品牌" name="brand">
              <AutoComplete
                options={brandOptions}
                filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                placeholder="请输入或选择品牌"
                allowClear
              >
                <Input />
              </AutoComplete>
            </Form.Item>
          </Col>
          <Col span={12}>
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
          </Col>
          <Col span={12}>
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
          </Col>
          <Col span={12}>
            <Form.Item label="车架号(VIN)" name="vin" rules={[{ max: 25, message: '车架号(VIN)最多25位' }]}>
              <Input placeholder="请输入车架号" maxLength={25} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="车牌号" name="plateNo">
              <Input placeholder="请输入车牌号" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="发票日期" name="purchaseDate">
              <Input type="date" onClick={(e: any) => e.target?.showPicker?.()} style={{ width: '100%', height: '40px', borderRadius: '6px', borderColor: '#d1d5db', color: '#1f2937' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="里程数" name="mileage">
              <Input 
                placeholder="请输入里程数" 
                suffix="公里" 
                onKeyDown={(e) => { 
                  if (!/[0-9.]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault(); 
                  }
                }} 
                onChange={(e) => { 
                  const val = e.target.value.replace(/[^0-9.]/g, ''); 
                  form.setFieldsValue({ mileage: val }); 
                }} 
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="里程≥4万公里" name="isMileageOver40k">
              <Select placeholder="请选择" options={yesNoOptions} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="里程≥9.5万公里" name="isMileageOver95k">
              <Select placeholder="请选择" options={yesNoOptions} onChange={handle95kChange} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="是否已购整车延保" name="hasExtendedWarranty">
              <Select placeholder="请选择" options={yesNoOptions} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="是否已购电池延保" name="hasBatteryWarranty">
              <Select placeholder="请选择" options={yesNoOptions} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="是否已购安心保" name="hasPeaceOfMind">
              <Select placeholder="请选择" options={yesNoOptions} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="是否已购轮胎保障" name="hasTireProtection">
              <Select placeholder="请选择" options={yesNoOptions} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default EditVehicleModal;
