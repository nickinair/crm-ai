import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Steps, Form, Input, Select, Button, message, Table, Spin } from 'antd';
import request from '../utils/request';
import { useDict } from '../hooks/useDict';

/**
 * 三步式创建订单弹框（PRD 4.2.3.2 / 配图 image16~image22）
 * 第一步 客户信息 → 第二步 订单及商品（下一步存草稿） → 第三步 车辆信息（提交订单）
 *
 * 三个入口复用（PRD 4.2.4.2 / 4.2.5.1）：
 * - 工作台快捷工具栏：无 props，自由选择/新增客户
 * - 线索详情：传 fixedLead，第一步展示线索编码不可修改
 * - 客户360：传 fixedCustomer，客户信息带入且不可编辑、不可新增
 */
interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** 客户360入口：锁定客户 */
  fixedCustomer?: { id: string; customerName: string; phone: string } | null;
  /** 线索详情入口：锁定线索（第一步显示线索编码，客户随线索确定） */
  fixedLead?: { id: string; leadCode: string; customerId: string; customerName?: string; phone?: string } | null;
}

/** 延保商品类型：含这两类时车辆必选（PRD 4.2.3.2） */
const WARRANTY_TYPES = ['整车延保', '电池延保'];

/** 车辆展示文本：车型（车架号）_车牌，只拼有值字段；全空展示占位（PRD 4.2.3.2） */
export const vehicleDisplay = (v: { model?: string | null; vin?: string | null; plateNo?: string | null }) => {
  const parts: string[] = [];
  if (v.model) parts.push(v.vin ? `${v.model}（${v.vin}）` : v.model);
  else if (v.vin) parts.push(`（${v.vin}）`);
  const head = parts.join('');
  const tail = v.plateNo || '';
  const text = [head, tail].filter(Boolean).join('_');
  return text || '未获取到车辆展示信息';
};

const OrderCreateModal: React.FC<Props> = ({ open, onClose, onSuccess, fixedCustomer, fixedLead }) => {
  const { getDictOptions } = useDict();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // ---- 第一步：客户 ----
  const [customerMode, setCustomerMode] = useState<'select' | 'create'>('select');
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null); // {id, customerName, phone}
  const [newCustomerForm] = Form.useForm();

  // ---- 第二步：订单及商品 ----
  const [orderForm] = Form.useForm();
  const [products, setProducts] = useState<any[]>([]);   // 已选商品（productRole=1）
  const [gifts, setGifts] = useState<any[]>([]);         // 已选赠品（productRole=2）
  const [allProducts, setAllProducts] = useState<any[]>([]); // 可选商品（正常状态）
  const [pickerOpen, setPickerOpen] = useState<null | 'product' | 'gift'>(null);
  const [pickerSelected, setPickerSelected] = useState<string[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);

  // ---- 第三步：车辆 ----
  const [vehicleMode, setVehicleMode] = useState<'select' | 'create'>('select');
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(undefined);
  const [newVehicleForm] = Form.useForm();

  const effectiveCustomer = fixedCustomer
    ? { id: fixedCustomer.id, customerName: fixedCustomer.customerName, phone: fixedCustomer.phone }
    : (fixedLead ? { id: fixedLead.customerId, customerName: fixedLead.customerName || '', phone: fixedLead.phone || '' } : selectedCustomer);

  /** 已选商品含延保时，车辆必选并红字提醒（PRD 配图 image19） */
  const hasWarranty = useMemo(
    () => products.some(p => WARRANTY_TYPES.includes(p.productType)),
    [products],
  );

  // 打开时重置全部状态
  useEffect(() => {
    if (open) {
      setStep(0);
      setCustomerMode('select');
      setSelectedCustomer(null);
      setCustomerOptions([]);
      setProducts([]);
      setGifts([]);
      setDraftId(null);
      setVehicleMode('select');
      setVehicles([]);
      setSelectedVehicleId(undefined);
      newCustomerForm.resetFields();
      orderForm.resetFields();
      newVehicleForm.resetFields();
      // 可选商品：仅正常状态（PRD 4.2.3.2）
      request.get('/product', { params: { status: 1 } }).then((res: any) => {
        setAllProducts(Array.isArray(res) ? res : (res?.data || []));
      }).catch(() => {});
    }
  }, [open]);

  // ---- 客户搜索（手机号/姓名，PRD 4.2.3.2 第一步）----
  let searchTimer: any;
  const searchCustomers = (kw: string) => {
    clearTimeout(searchTimer);
    if (!kw || !kw.trim()) { setCustomerOptions([]); return; }
    searchTimer = setTimeout(async () => {
      setCustomerSearching(true);
      try {
        const res: any = await request.get('/customer', { params: { search: kw.trim(), page: 1, limit: 20 } });
        setCustomerOptions(res.items || []);
      } catch { /* 全局拦截器已提示 */ } finally {
        setCustomerSearching(false);
      }
    }, 300);
  };

  /** 取消：删除订单草稿（车辆草稿在前端暂存，关闭即弃）——PRD 4.2.3.2 */
  const handleCancel = async () => {
    if (draftId) {
      try { await request.delete(`/order/draft/${draftId}`); } catch { /* 忽略 */ }
    }
    onClose();
  };

  // ---- 第一步 下一步 ----
  const nextFromStep1 = async () => {
    if (fixedCustomer || fixedLead) { setStep(1); return; }
    if (customerMode === 'select') {
      if (!selectedCustomer) { message.warning('请选择客户'); return; }
      setStep(1);
      return;
    }
    // 新增客户：下一步时做手机号唯一性校验，验证通过直接保存客户（PRD 4.2.3.2）
    try {
      const values = await newCustomerForm.validateFields();
      setSubmitting(true);
      const res: any = await request.post('/customer', { customerName: values.customerName, phone: values.phone });
      if (res?.error) {
        message.error(res.message || '保存客户失败');
        return;
      }
      setSelectedCustomer({ id: res.id, customerName: values.customerName, phone: values.phone, isNew: true });
      setStep(1);
    } catch (e: any) {
      if (e?.errorFields) return;
      // 手机号重复等后端校验错误由全局拦截器提示
    } finally {
      setSubmitting(false);
    }
  };

  // ---- 第二步 下一步：订单和商品信息存草稿（PRD 4.2.3.2）----
  const nextFromStep2 = async () => {
    try {
      const values = await orderForm.validateFields();
      if (!products.length) { message.warning('请添加商品信息'); return; }
      setSubmitting(true);
      // 回退修改后再次下一步：删除旧草稿重建，保证草稿与所填一致
      if (draftId) {
        try { await request.delete(`/order/draft/${draftId}`); } catch { /* 忽略 */ }
        setDraftId(null);
      }
      const items = [
        ...products.map(p => ({ productId: p.id, productRole: 1, quantity: 1 })),
        ...gifts.map(g => ({ productId: g.id, productRole: 2, quantity: 1 })),
      ];
      const res: any = await request.post('/order', {
        customerId: effectiveCustomer.id,
        leadId: fixedLead?.id || undefined,
        orderPlatform: values.orderPlatform,
        platformOrderNo: values.platformOrderNo,
        marketingActivity: values.marketingActivity || null,
        totalAmount: values.totalAmount,
        items,
        isDraft: 1,
      });
      setDraftId(res.id);
      // 加载客户未失效车辆（第三步下拉）
      try {
        const vs: any = await request.get(`/customer/${effectiveCustomer.id}/vehicles`);
        setVehicles(Array.isArray(vs) ? vs : []);
      } catch { setVehicles([]); }
      setStep(2);
    } catch (e: any) {
      if (e?.errorFields) return;
    } finally {
      setSubmitting(false);
    }
  };

  // ---- 第三步 提交订单：pre-check 校验流程（PRD 配图 image21）----
  const submitOrder = async () => {
    // 延保商品必须选择/填写含车架号的车辆（PRD 4.2.3.2）
    let vehicleId: string | undefined = undefined;
    let newVehicleData: any = null;
    if (vehicleMode === 'select') {
      if (hasWarranty && !selectedVehicleId) {
        message.warning('该订单包含延保商品，必须填写或选择含有车架号的车辆信息');
        return;
      }
      vehicleId = selectedVehicleId;
    } else {
      const raw = newVehicleForm.getFieldsValue();
      const allEmpty = Object.values(raw).every(v => v === undefined || v === null || v === '');
      if (allEmpty && !hasWarranty) {
        // 不含延保商品时车辆信息整体非必填，全空则视为不关联车辆
        newVehicleData = null;
      } else {
        try {
          newVehicleData = await newVehicleForm.validateFields();
        } catch { return; }
      }
    }

    setSubmitting(true);
    try {
      // ① 前置校验
      const check: any = await request.post('/order/pre-check', {
        customerId: effectiveCustomer.id,
        vehicleId,
        vin: newVehicleData?.vin,
        productIds: [...products, ...gifts].map(p => p.id),
        leadId: fixedLead?.id || undefined,
      });

      // ② 车辆冲突：确认后仍可下单（取消则中止）
      if (check?.vehicleConflict) {
        const ok = await new Promise<boolean>(resolve => {
          Modal.confirm({
            title: '提示',
            content: `客户车辆${check.vehicleConflict.vin}存在未完结订单，且商品${check.vehicleConflict.dupProducts.join('；')}在该订单中，确定要继续下单吗？`,
            okText: '确定', cancelText: '取消', centered: true, className: 'crm-unified-modal',
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (!ok) { setSubmitting(false); return; }
      }

      // ③ 未绑定线索且客户存在未完结线索：询问是否绑定（绑定/不绑定都继续创建）
      let bindLeadId: string | undefined = fixedLead?.id || undefined;
      if (!bindLeadId && check?.unfinishedLead) {
        const bind = await new Promise<boolean>(resolve => {
          Modal.confirm({
            title: '提示',
            content: `客户${effectiveCustomer.customerName || ''}存在未完结线索，线索信息如下：${check.unfinishedLead.leadCode}；是否要绑定该线索创建订单？`,
            okText: '绑定', cancelText: '不绑定', centered: true, className: 'crm-unified-modal',
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (bind) bindLeadId = check.unfinishedLead.leadId;
      }

      // ④ 新增车辆：此时才真正落库并关联客户（车辆草稿转正式，PRD 4.2.3.2）
      if (newVehicleData) {
        const vRes: any = await request.post('/customer/vehicle', {
          customerId: effectiveCustomer.id,
          brand: newVehicleData.brand || null,
          plateNo: newVehicleData.plateNo || null,
          model: newVehicleData.model || null,
          style: newVehicleData.style || null,
          vin: newVehicleData.vin,
          purchaseDate: newVehicleData.purchaseDate || null,
        });
        if (vRes?.error) { message.error(vRes.message || '车辆保存失败'); setSubmitting(false); return; }
        vehicleId = vRes.id;
      }

      // ⑤ 草稿转正式订单
      await request.post(`/order/${draftId}/submit`, { vehicleId: vehicleId || null, leadId: bindLeadId || null });
      message.success('订单创建成功！');
      onClose();
      onSuccess?.();
    } catch (e: any) {
      if (!e?.response) message.error(e?.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- 商品/赠品选择弹框 ----
  const openPicker = (mode: 'product' | 'gift') => {
    setPickerSelected([]);
    setPickerOpen(mode);
  };
  const confirmPicker = () => {
    const chosen = allProducts.filter(p => pickerSelected.includes(String(p.id)));
    if (pickerOpen === 'product') {
      const exist = new Set(products.map(p => String(p.id)));
      setProducts([...products, ...chosen.filter(p => !exist.has(String(p.id)))]);
    } else {
      const exist = new Set(gifts.map(p => String(p.id)));
      setGifts([...gifts, ...chosen.filter(p => !exist.has(String(p.id)))]);
    }
    setPickerOpen(null);
  };

  const itemTable = (list: any[], isGift: boolean, onRemove: (id: string) => void) => (
    <Table
      size="small"
      rowKey="id"
      dataSource={list}
      pagination={false}
      locale={{ emptyText: isGift ? '暂无赠品，请点击右上角添加' : '暂无商品，请点击右上角添加' }}
      columns={[
        { title: isGift ? '赠品名称' : '商品名称', dataIndex: 'productName' },
        { title: '编码', dataIndex: 'productCode' },
        { title: isGift ? '单价/价值' : '单价', dataIndex: 'salePrice', width: 110, render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
        { title: '操作', key: 'op', width: 70, render: (_: any, r: any) => <a style={{ color: '#DC2626' }} onClick={() => onRemove(String(r.id))}>删除</a> },
      ]}
    />
  );

  const stepButtons = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
      <Button onClick={handleCancel}>取消</Button>
      {step > 0 && <Button onClick={() => setStep(step - 1)}>上一步</Button>}
      {step < 2 && <Button type="primary" loading={submitting} onClick={step === 0 ? nextFromStep1 : nextFromStep2}>下一步</Button>}
      {step === 2 && <Button type="primary" loading={submitting} onClick={submitOrder}>提交订单</Button>}
    </div>
  );

  return (
    <>
      <Modal
        centered
        title="创建订单"
        open={open}
        onCancel={handleCancel}
        footer={stepButtons}
        width={640}
        className="crm-unified-modal"
        maskClosable={false}
      >
        <Steps
          current={step}
          items={[{ title: fixedLead ? '线索信息' : '客户信息' }, { title: '订单及商品' }, { title: '车辆信息' }]}
          style={{ marginBottom: '24px' }}
        />

        {/* ================= 第一步 ================= */}
        {step === 0 && (
          <div>
            {fixedLead ? (
              // 线索详情入口：默认展示当前线索的线索编码，不可修改（PRD 4.2.4.2）
              <div>
                <div style={{ fontWeight: 600, color: '#1f2937', marginBottom: '12px' }}>线索信息</div>
                <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '4px' }}>线索编码</div>
                <Input value={fixedLead.leadCode} disabled style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }} />
              </div>
            ) : fixedCustomer ? (
              // 客户360入口：客户信息带入且不可编辑、不可新增（PRD 4.2.5.1）
              <div>
                <div style={{ fontWeight: 600, color: '#1f2937', marginBottom: '12px' }}>客户信息</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '4px' }}>客户名称</div>
                    <Input value={fixedCustomer.customerName} disabled style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }} />
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '4px' }}>客户电话</div>
                    <Input value={fixedCustomer.phone} disabled style={{ backgroundColor: '#f3f4f6', color: '#6b7280' }} />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 600, color: '#1f2937' }}>客户信息</span>
                  {customerMode === 'select'
                    ? <a onClick={() => { setCustomerMode('create'); setSelectedCustomer(null); }}>+ 新增客户</a>
                    : <a onClick={() => setCustomerMode('select')}>← 选择已有客户</a>}
                </div>
                {customerMode === 'select' ? (
                  <div>
                    <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '4px' }}>
                      <span style={{ color: '#ef4444' }}>*</span> 客户选择
                    </div>
                    <Select
                      showSearch
                      style={{ width: '100%' }}
                      placeholder="输入客户姓名或电话搜索..."
                      filterOption={false}
                      onSearch={searchCustomers}
                      notFoundContent={customerSearching ? <Spin size="small" /> : '未搜索到客户'}
                      value={selectedCustomer?.id}
                      onChange={(id) => {
                        const c = customerOptions.find(o => String(o.id) === String(id));
                        if (c) setSelectedCustomer({ id: c.id, customerName: c.customerName, phone: c.phone });
                      }}
                      options={customerOptions.map(c => ({
                        label: `${c.customerName || '未知'}（${c.phone || '-'}）`,
                        value: c.id,
                      }))}
                    />
                  </div>
                ) : (
                  // 新增客户（PRD 配图 image17）
                  <Form form={newCustomerForm} layout="vertical">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <Form.Item name="customerName" label="客户名称" rules={[{ required: true, message: '请输入客户名称' }]} style={{ marginBottom: 0 }}>
                        <Input placeholder="请输入客户名称" maxLength={64} />
                      </Form.Item>
                      <Form.Item name="phone" label="客户电话" rules={[
                        { required: true, message: '请输入客户电话' },
                        { pattern: /^1\d{10}$/, message: '请输入正确的手机号' },
                      ]} style={{ marginBottom: 0 }}>
                        <Input placeholder="请输入客户电话" maxLength={11} />
                      </Form.Item>
                    </div>
                  </Form>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= 第二步：订单及商品（PRD 配图 image18）================= */}
        {step === 1 && (
          <div>
            <div style={{ fontWeight: 600, color: '#1f2937', marginBottom: '12px' }}>订单信息</div>
            <Form form={orderForm} layout="vertical">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Form.Item name="orderPlatform" label="下单平台" rules={[{ required: true, message: '请选择下单平台' }]}>
                  <Select placeholder="请选择" options={getDictOptions('order_platform')} />
                </Form.Item>
                <Form.Item name="platformOrderNo" label="平台订单编号" rules={[
                  { required: true, message: '请输入平台订单编号' },
                  { max: 30, message: '平台订单编号最多30个字符' },
                ]}>
                  <Input placeholder="请输入订单编号" maxLength={30} />
                </Form.Item>
                <Form.Item name="totalAmount" label="实付金额" rules={[
                  { required: true, message: '请输入实付金额' },
                  { validator: (_: any, v: any) => {
                      if (v === undefined || v === '') return Promise.resolve();
                      if (String(v).length > 10) return Promise.reject('实付金额最多10个字符');
                      const n = Number(v);
                      if (Number.isNaN(n) || n < 0) return Promise.reject('实付金额仅支持非负数字');
                      return Promise.resolve();
                  }},
                ]}>
                  <Input placeholder="请输入金额" maxLength={10} />
                </Form.Item>
                <Form.Item name="marketingActivity" label="营销活动">
                  <Select placeholder="请选择" allowClear options={getDictOptions('marketing_activity')} />
                </Form.Item>
              </div>
            </Form>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 8px' }}>
              <span style={{ fontWeight: 600, color: '#1f2937' }}><span style={{ color: '#ef4444' }}>*</span> 商品信息</span>
              <Button type="primary" size="small" onClick={() => openPicker('product')}>+ 添加商品</Button>
            </div>
            {itemTable(products, false, (id) => setProducts(products.filter(p => String(p.id) !== id)))}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
              <span style={{ fontWeight: 600, color: '#1f2937' }}>赠品信息</span>
              <Button type="primary" size="small" onClick={() => openPicker('gift')}>+ 添加赠品</Button>
            </div>
            {itemTable(gifts, true, (id) => setGifts(gifts.filter(p => String(p.id) !== id)))}
          </div>
        )}

        {/* ================= 第三步：车辆信息（PRD 配图 image19/image20）================= */}
        {step === 2 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontWeight: 600, color: '#1f2937' }}>车辆信息</span>
              {vehicleMode === 'select'
                ? <a onClick={() => setVehicleMode('create')}>+ 新增车辆</a>
                : <a onClick={() => setVehicleMode('select')}>← 选择已有车辆</a>}
            </div>

            {vehicleMode === 'select' ? (
              <div>
                <Select
                  style={{ width: '100%' }}
                  placeholder="请选择车辆"
                  allowClear
                  value={selectedVehicleId}
                  onChange={setSelectedVehicleId}
                  options={vehicles.map(v => ({ label: vehicleDisplay(v), value: String(v.id) }))}
                />
                {hasWarranty && (
                  <div style={{ color: '#EF4444', fontSize: '13px', marginTop: '8px' }}>
                    该订单包含延保商品，必须填写或选择含有车架号的车辆信息
                  </div>
                )}
              </div>
            ) : (
              // 新增车辆表单（PRD 配图 image20：品牌/车牌号/车型/款式/车架号必填/发票日期）
              <Form form={newVehicleForm} layout="vertical">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <Form.Item name="brand" label="品牌">
                    <Input placeholder="请输入品牌" maxLength={64} />
                  </Form.Item>
                  <Form.Item name="plateNo" label="车牌号">
                    <Input placeholder="请输入车牌号" maxLength={16} />
                  </Form.Item>
                  <Form.Item name="model" label="车型">
                    <Input placeholder="请输入车型" maxLength={64} />
                  </Form.Item>
                  <Form.Item name="style" label="款式">
                    <Input placeholder="请输入款式" maxLength={64} />
                  </Form.Item>
                  <Form.Item name="vin" label="车架号(VIN)" rules={[
                    { required: true, message: '请输入车架号' },
                    { max: 17, message: '车架号最多17位' },
                  ]}>
                    <Input placeholder="请输入车架号" maxLength={17} />
                  </Form.Item>
                  <Form.Item name="purchaseDate" label="发票日期">
                    <Input type="date" />
                  </Form.Item>
                </div>
                {hasWarranty && (
                  <div style={{ color: '#EF4444', fontSize: '13px' }}>
                    该订单包含延保商品，必须填写或选择含有车架号的车辆信息
                  </div>
                )}
              </Form>
            )}
          </div>
        )}
      </Modal>

      {/* ===== 商品/赠品选择弹框（仅正常状态商品可选）===== */}
      <Modal
        centered
        title={pickerOpen === 'gift' ? '添加赠品' : '添加商品'}
        open={!!pickerOpen}
        onCancel={() => setPickerOpen(null)}
        onOk={confirmPicker}
        okText="确定"
        cancelText="取消"
        width={700}
        className="crm-unified-modal"
      >
        <Table
          size="small"
          rowKey={(r: any) => String(r.id)}
          dataSource={allProducts}
          rowSelection={{
            selectedRowKeys: pickerSelected,
            onChange: (keys) => setPickerSelected(keys as string[]),
          }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          columns={[
            { title: '商品名称', dataIndex: 'productName' },
            { title: '编码', dataIndex: 'productCode', width: 150 },
            { title: '商品类型', dataIndex: 'productType', width: 110 },
            { title: '售价', dataIndex: 'salePrice', width: 100, render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
          ]}
        />
      </Modal>
    </>
  );
};

export default OrderCreateModal;
