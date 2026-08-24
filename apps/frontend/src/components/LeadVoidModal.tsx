import React, { useState } from 'react';
import { Modal, Form, Select, Input, message } from 'antd';
import request from '../utils/request';
import { useDict } from '../hooks/useDict';

/**
 * 作废线索弹框（PRD 4.3.3 / 4.5）
 * - 作废原因下拉，选项取数据字典 lead_void_reason
 * - 选择「其他」时，必须填写具体原因
 * - 线索池管理 / 我的线索私池 / 线索详情 共用
 */
interface Props {
  open: boolean;
  leadId: string | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const LeadVoidModal: React.FC<Props> = ({ open, leadId, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const { getDictOptions } = useDict();
  const [loading, setLoading] = useState(false);
  const reason = Form.useWatch('voidReason', form);

  const handleOk = async () => {
    if (!leadId) return;
    try {
      const values = await form.validateFields();
      setLoading(true);
      const res: any = await request.post(`/lead/${leadId}/void`, {
        voidReason: values.voidReason,
        voidDetail: values.voidDetail?.trim() || undefined,
      });
      if (res?.error) {
        message.error(res.message || '作废失败');
        return;
      }
      message.success('已作废');
      form.resetFields();
      onSuccess();
    } catch (err: any) {
      if (err?.errorFields) return; // 表单校验未通过
      message.error(err.message || err.response?.data?.message || '作废失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="作废线索"
      open={open}
      onCancel={() => { form.resetFields(); onCancel(); }}
      onOk={handleOk}
      confirmLoading={loading}
      okText="确定"
      cancelText="取消"
      width={400}
      centered
      destroyOnClose
      className="crm-unified-modal"
    >
      <Form form={form} layout="vertical" style={{ marginTop: '16px' }}>
        <Form.Item name="voidReason" label="请选择作废原因" rules={[{ required: true, message: '请选择作废原因' }]}>
          <Select className="crm-full-width" placeholder="请选择" options={getDictOptions('lead_void_reason')} />
        </Form.Item>
        {reason === '其他' && (
          <Form.Item name="voidDetail" rules={[{ required: true, message: '请填写具体原因' }]}>
            <Input.TextArea placeholder="请填写具体原因" rows={3} maxLength={200} showCount />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
};

export default LeadVoidModal;
