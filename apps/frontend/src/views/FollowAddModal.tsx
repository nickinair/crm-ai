import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, Input, message } from 'antd';
import request from '../utils/request';
import { useDict } from '../hooks/useDict';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

interface FollowAddModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  leadId: string;
  customerId?: string;
  leadCode?: string;
  lastFollowRecord?: {
    callResult?: string;
    communicationTendency?: string;
    purchaseIntention?: string;
    leadStatus?: number;
  };
}

const FollowAddModal: React.FC<FollowAddModalProps> = ({ open, onCancel, onSuccess, leadId, customerId, lastFollowRecord }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { getDictOptions } = useDict();

  // Pre-fill form with last follow record values when modal opens
  useEffect(() => {
    if (open && lastFollowRecord) {
      const statusNames: Record<number, string> = { 0: '待分配', 1: '待跟进', 2: '跟进中', 3: '已成交', 4: '已战败' };
      form.setFieldsValue({
        callResult: lastFollowRecord.callResult || undefined,
        communicationTendency: lastFollowRecord.communicationTendency || undefined,
        purchaseIntention: lastFollowRecord.purchaseIntention || undefined,
        leadStatus: lastFollowRecord.leadStatus !== undefined && lastFollowRecord.leadStatus !== null
          ? (statusNames[lastFollowRecord.leadStatus] || '跟进中')
          : '跟进中',
      });
    }
  }, [open, lastFollowRecord, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const userInfoStr = localStorage.getItem('user');
      const userInfo = userInfoStr ? JSON.parse(userInfoStr) : {};

      await request.post('/follow', {
        leadId,
        customerId,
        accountId: userInfo.id,
        followType: 2, // 跟进线索
        followContent: values.followContent,
        callResult: values.callResult,
        communicationTendency: values.communicationTendency,
        purchaseIntention: values.purchaseIntention,
        nextPlanTime: values.nextPlanTime ? dayjs(values.nextPlanTime).format('YYYY-MM-DD HH:mm:ss') : undefined,
        leadStatus: values.leadStatus === '已成交' || values.leadStatus === '已完成' ? 3 : values.leadStatus === '已战败' ? 4 : 2,
      });

      message.success('添加跟进记录成功');
      form.resetFields();
      onSuccess();
    } catch (e: any) {
      if (e?.errorFields) return; // form validation error
      console.error(e);
      message.error('添加跟进记录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="新增跟进记录"
      open={open}
      onCancel={() => { form.resetFields(); onCancel(); }}
      onOk={handleSubmit}
      confirmLoading={loading}
      okText="确认提交"
      cancelText="取消"
      width={740}
      centered
      destroyOnClose
      className="crm-unified-modal"
    >
      <Form form={form} layout="vertical" style={{ marginTop: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="nextPlanTime" label="下次回访时间">
            <Input type="date" onClick={(e: any) => e.target?.showPicker?.()} style={{ width: '100%', height: '40px', borderRadius: '6px', borderColor: '#d1d5db', color: '#1f2937' }} />
          </Form.Item>

          <Form.Item name="callResult" label="呼叫结果" rules={[{ required: true, message: '请选择呼叫结果' }]}>
            <Select placeholder="请选择" allowClear options={getDictOptions('call_result')} />
          </Form.Item>

          <Form.Item name="communicationTendency" label="客户沟通倾向" rules={[{ required: true, message: '请选择客户沟通倾向' }]}>
            <Select placeholder="请选择" allowClear options={getDictOptions('communication_tendency')} />
          </Form.Item>

          <Form.Item name="purchaseIntention" label="购买意向" rules={[{ required: true, message: '请选择购买意向' }]}>
            <Select placeholder="请选择" allowClear options={getDictOptions('purchase_intention')} />
          </Form.Item>

          <Form.Item name="leadStatus" label="线索状态" initialValue="跟进中">
            <Select placeholder="请选择">
              {/* 「已成交」已移除：线索完结由订单完结联动触发（PRD 4.3.3） */}
              <Select.Option value="跟进中">跟进中</Select.Option>
              <Select.Option value="已战败">已战败</Select.Option>
            </Select>
          </Form.Item>
        </div>

        <Form.Item name="followContent" label="跟进内容" style={{ marginTop: '8px', marginBottom: '8px' }} className="follow-content-item">
          <Input.TextArea rows={6} placeholder="输入跟进内容..." maxLength={200} className="follow-content-textarea" style={{ resize: 'vertical' }} />
        </Form.Item>
        <div style={{ textAlign: 'right', color: '#999', fontSize: '12px', marginBottom: '16px' }}>
          {(Form.useWatch('followContent', form) || '').length} / 200
        </div>
      </Form>
    </Modal>
  );
};

export default FollowAddModal;
