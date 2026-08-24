import React, { useEffect, useState, useMemo } from 'react';
import { Modal, Form, Input, Select, Row, Col, Button, Table, message, Checkbox, Spin, AutoComplete, Steps } from 'antd';
import { DeleteOutlined, SearchOutlined, CloseOutlined } from '@ant-design/icons';
import request from '../utils/request';
import { useDict } from '../hooks/useDict';
import debounce from 'lodash/debounce';
import dayjs from 'dayjs';

interface Props {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  editId?: string;
  isView?: boolean;
  defaultAssigneeId?: number | string;
  lockedCustomer?: { id: string; customerName: string; phone: string } | null;
  showWorkbenchFields?: boolean;
}

const LeadAddModal: React.FC<Props> = ({ open, onCancel, onSuccess, editId, isView, defaultAssigneeId, lockedCustomer, showWorkbenchFields }) => {
  const [form] = Form.useForm();
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [loading, setLoading] = useState(false);
  const { getDictOptions } = useDict();
  // 品牌/车型/款式选项改为数据字典驱动（PRD 4.7；原为既有车辆数据去重）
  const brandOptions = getDictOptions('vehicle_brand');
  const modelOptions = getDictOptions('vehicle_model');
  const styleOptions = getDictOptions('vehicle_style');
  
  // Customer Search
  const [customerOptions, setCustomerOptions] = useState<any[]>([]);
  const [fetchingCustomers, setFetchingCustomers] = useState(false);
  const [customerSearchValue, setCustomerSearchValue] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerTotal, setCustomerTotal] = useState(0);

  // Products & Gifts Search
  const [productOptions, setProductOptions] = useState<any[]>([]);
  const [giftOptions, setGiftOptions] = useState<any[]>([]);
  const [productSearchStr, setProductSearchStr] = useState('');
  const [giftSearchStr, setGiftSearchStr] = useState('');
  
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
  const [isGiftSelectorOpen, setIsGiftSelectorOpen] = useState(false);

  // ===== 三步式新增（PRD 4.3.3 / 4.2.3.3 / 4.2.5.2）：仅新增模式启用，编辑/查看保持单页 =====
  const isThreeStep = !editId && !isView;
  const [step, setStep] = useState(0);
  const [stepLoading, setStepLoading] = useState(false);
  const [vehicleMode, setVehicleMode] = useState<'select' | 'create'>('select');
  const [customerVehicles, setCustomerVehicles] = useState<any[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | undefined>(undefined);

  /** 车辆下拉展示：车型（车架号）_车牌，只拼有值字段，全空展示占位（PRD 4.2.3.2） */
  const vehicleLabel = (v: any) => {
    const parts: string[] = [];
    if (v.model) parts.push(v.vin ? `${v.model}（${v.vin}）` : v.model);
    else if (v.vin) parts.push(`（${v.vin}）`);
    const head = parts.join('');
    const tail = v.plateNo || '';
    const text = [head, tail].filter(Boolean).join('_');
    return text || '未获取到车辆展示信息';
  };

  const loadCustomerVehicles = async (custId: string) => {
    try {
      const vs: any = await request.get(`/customer/${custId}/vehicles`);
      setCustomerVehicles(Array.isArray(vs) ? vs : []);
    } catch { setCustomerVehicles([]); }
  };

  /** 第一步 下一步：新增客户时直接保存客户（PRD 4.3.3），然后加载车辆进入第二步 */
  const nextFromStep1 = async () => {
    const baseFields = ['channelSource', 'sourceMethod', 'sourceDate'];
    try {
      if (lockedCustomer) {
        await form.validateFields(baseFields);
        setStepLoading(true);
        await loadCustomerVehicles(lockedCustomer.id);
        setStep(1);
        return;
      }
      if (isNewCustomer) {
        const values = await form.validateFields(['customerName', 'customerPhone', ...baseFields]);
        setStepLoading(true);
        // 新增客户：点击下一步，直接保存客户信息（PRD 4.3.3）
        const res: any = await request.post('/customer', { customerName: values.customerName || '', phone: values.customerPhone });
        if (res?.error) { message.error(res.message || '保存客户失败'); return; }
        setCustomerOptions([res]);
        form.setFieldsValue({ customerId: res.id });
        setIsNewCustomer(false);
        await loadCustomerVehicles(res.id);
        setStep(1);
        return;
      }
      const values = await form.validateFields(['customerId', ...baseFields]);
      setStepLoading(true);
      await loadCustomerVehicles(values.customerId);
      setStep(1);
    } catch (e: any) {
      if (e?.errorFields) return;
      // 手机号重复等由全局拦截器提示
    } finally {
      setStepLoading(false);
    }
  };

  /** 第二步 下一步：新增车辆时直接保存车辆并关联客户（PRD 4.3.3） */
  const nextFromStep2 = async () => {
    if (vehicleMode === 'select') { setStep(2); return; }
    const v = form.getFieldsValue(['carBrand', 'carPlate', 'carModel', 'carStyle', 'carVin', 'purchaseDate', 'carMileage',
      'isMileageOver40k', 'isMileageOver95k', 'hasExtendedWarranty', 'hasBatteryWarranty', 'hasPeaceOfMind', 'hasTireProtection', 'remark']);
    const hasAny = Object.values(v).some(x => x !== undefined && x !== null && x !== '');
    if (!hasAny) { setStep(2); return; } // 车辆信息整体非必填，全空则不建车
    try {
      await form.validateFields(['carVin']);
      setStepLoading(true);
      const custId = lockedCustomer?.id || form.getFieldValue('customerId');
      const res: any = await request.post('/customer/vehicle', {
        customerId: custId,
        brand: v.carBrand || null, plateNo: v.carPlate || null, model: v.carModel || null,
        style: v.carStyle || null, vin: v.carVin || null, purchaseDate: v.purchaseDate || null,
        mileage: v.carMileage || null,
        isMileageOver40k: v.isMileageOver40k ?? null, isMileageOver95k: v.isMileageOver95k ?? null,
        hasExtendedWarranty: v.hasExtendedWarranty ?? null, hasBatteryWarranty: v.hasBatteryWarranty ?? null,
        hasPeaceOfMind: v.hasPeaceOfMind ?? null, hasTireProtection: v.hasTireProtection ?? null,
        remark: v.remark || null,
      });
      if (res?.error) { message.error(res.message || '保存车辆失败'); return; }
      // 保存成功：转为选择模式并选中该车辆
      await loadCustomerVehicles(custId);
      setSelectedVehicleId(String(res.id));
      setVehicleMode('select');
      setStep(2);
    } catch (e: any) {
      if (e?.errorFields) return;
    } finally {
      setStepLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      form.resetFields();
      setIsNewCustomer(false);
      setCustomerOptions([]);
      setCustomerSearchValue('');
      setCustomerPage(1);
      setCustomerTotal(0);
      setStep(0);
      setVehicleMode('select');
      setCustomerVehicles([]);
      setSelectedVehicleId(undefined);
      fetchProducts();
      if (editId) {
        fetchLead(editId);
      } else if (lockedCustomer) {
        // Pre-fill locked customer and set defaults for 是/否 fields
        setCustomerOptions([lockedCustomer]);
        form.setFieldsValue({
          customerId: lockedCustomer.id,
          isMileageOver40k: '0',
          isMileageOver95k: '0',
          hasExtendedWarranty: '0',
          hasBatteryWarranty: '0',
          hasPeaceOfMind: '0',
          hasTireProtection: '0',
        });
      }
    }
  }, [open, form, editId, lockedCustomer]);

  const fetchLead = async (id: string) => {
    setLoading(true);
    try {
      const res: any = await request.get(`/lead/${id}`);
      if (res) {
        if (res.customer) {
          setCustomerOptions([res.customer]);
        } else {
          setCustomerOptions([]);
        }
        
        const intentProducts = (res.products || []).filter((p: any) => p.productRole === 1).map((p: any) => p.product);
        const intentGifts = (res.products || []).filter((p: any) => p.productRole === 2).map((p: any) => p.product);

        form.setFieldsValue({
          customerId: res.customer?.id,
          channelSource: res.channelSource,
          sourceMethod: res.sourceMethod,
          sourceDate: res.sourceDate ? res.sourceDate.substring(0, 10) : null,
          carBrand: res.vehicle?.brand || '',
          carModel: (res.vehicle?.model?.split(' ')[0] === 'undefined' ? '' : res.vehicle?.model?.split(' ')[0]) || '',
          carStyle: res.vehicle?.style || res.vehicle?.model?.split(' ')[1] || '',
          carVin: res.vehicle?.vin || '',
          carPlate: res.vehicle?.plateNo || '',
          carMileage: res.vehicle?.mileage || '',
          purchaseDate: res.vehicle?.purchaseDate ? res.vehicle.purchaseDate.substring(0, 10) : null,
          isMileageOver40k: res.vehicle?.isMileageOver40k,
          isMileageOver95k: res.vehicle?.isMileageOver95k,
          hasExtendedWarranty: res.vehicle?.hasExtendedWarranty,
          hasBatteryWarranty: res.vehicle?.hasBatteryWarranty,
          hasPeaceOfMind: res.vehicle?.hasPeaceOfMind,
          hasTireProtection: res.vehicle?.hasTireProtection,
          remark: res.vehicle?.remark || '',
          intentProducts,
          intentGifts,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await request.get('/product', { params: { status: 1 } }); // 仅正常状态商品，排除已归档（测试问题17/26）
      const items = Array.isArray(res) ? res : (res as any).data || [];
      setProductOptions(items);
      setGiftOptions(items);
    } catch (error) {
      console.error(error);
    }
  };

  const loadCustomerOptions = async (value: string, page: number) => {
    setFetchingCustomers(true);
    try {
      const res: any = await request.get('/customer', { params: { search: value, limit: 10, page } });
      const items = res.items || (Array.isArray(res) ? res : (res.data || []));
      setCustomerTotal(res.total || items.length);
      if (page === 1) {
        setCustomerOptions(items);
      } else {
        setCustomerOptions(prev => {
          // Avoid duplicate keys by checking existing IDs
          const existingIds = new Set(prev.map(p => p.id));
          const newItems = items.filter((item: any) => !existingIds.has(item.id));
          return [...prev, ...newItems];
        });
      }
    } finally {
      setFetchingCustomers(false);
    }
  };

  const onSearchCustomer = useMemo(() => {
    return debounce((value: string) => {
      setCustomerSearchValue(value);
      setCustomerPage(1);
      loadCustomerOptions(value, 1);
    }, 500);
  }, []);

  const handleCustomerPopupScroll = (e: any) => {
    e.persist();
    const { target } = e;
    if (target.scrollTop + target.offsetHeight >= target.scrollHeight - 10) {
      if (!fetchingCustomers && customerOptions.length < customerTotal) {
        const nextPage = customerPage + 1;
        setCustomerPage(nextPage);
        loadCustomerOptions(customerSearchValue, nextPage);
      }
    }
  };

  const handleSave = async (values: any, forceBindVehicle = false) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        isNewCustomer: isThreeStep ? false : isNewCustomer, // 三步式：客户已在第一步落库
        // 三步式：车辆已在第二步落库/选定，直接关联（后端跳过重复建车）
        ...(isThreeStep && selectedVehicleId ? { vehicleId: selectedVehicleId } : {}),
        forceBindVehicle,
        sourceDate: values.sourceDate || undefined,
        purchaseDate: values.purchaseDate || undefined,
        intentProducts: (values.intentProducts || []).map((p: any) => p.id),
        intentGifts: (values.intentGifts || []).map((p: any) => p.id),
        ...(!editId && defaultAssigneeId ? { assigneeId: defaultAssigneeId } : {})
      };

      let res: any;
      if (editId) {
        res = await request.put(`/lead/${editId}`, payload);
      } else {
        res = await request.post('/lead', payload);
      }

      // Backend returns { error: true, code: '...' } with 200 status
      if (res && res.error) {
        if (res.code === 'CUSTOMER_PHONE_EXIST') {
          const customerName = res.customerName || res.message || '';
          form.setFields([
            {
              name: 'customerPhone',
              errors: [`该电话已被客户${customerName}使用，请核对后重新输入！`],
            },
          ]);
        } else if (res.code === 'VEHICLE_VIN_EXIST') {
          Modal.confirm({
            title: '车辆已存在',
            content: `该车辆已存在并绑定了客户${res.customerName || ''}，是否绑定多客户？`,
            okText: '确定',
            cancelText: '取消',
            centered: true,
            className: 'crm-unified-modal',
            onOk: () => handleSave(values, true),
          });
        } else if (res.code === 'LEAD_STATUS_CONFLICT') {
          message.error(`客户${res.customerName || ''}存在${res.statusName || ''}的线索【${res.leadCode || ''}】，不可重复创建线索!`);
        } else {
          message.error(res.message || '保存失败');
        }
        return;
      }

      message.success(editId ? '编辑线索成功' : '新增线索成功');
      onSuccess();
    } catch (error: any) {
      // HTTP errors are toasted by the global interceptor; only toast non-HTTP failures
      if (!error?.response) {
        message.error(error?.message || '保存失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const onFinish = (values: any) => {
    handleSave(values, false);
  };

  const renderInlineSelector = (fieldName: 'intentProducts' | 'intentGifts', options: any[], searchStr: string, setSearchStr: (val: string) => void, onClose: () => void) => {
    const selectedList = form.getFieldValue(fieldName) || [];
    const filteredOptions = options.filter(p => (p.productName || '').includes(searchStr) || (p.productCode || '').includes(searchStr));

    const handleCheck = (checked: boolean, item: any) => {
      const currentList = form.getFieldValue(fieldName) || [];
      if (checked) {
        form.setFieldsValue({ [fieldName]: [...currentList, item] });
      } else {
        form.setFieldsValue({ [fieldName]: currentList.filter((p: any) => p.id !== item.id) });
      }
    };

    return (
      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
          <Input 
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="搜索商品名称或编码..." 
            value={searchStr} 
            onChange={e => setSearchStr(e.target.value)} 
            style={{ flex: 1, borderRadius: '6px', display: 'flex', alignItems: 'center' }}
          />
          <Button type="primary" style={{ background: '#4F8DFF', borderRadius: '6px', border: 'none', padding: '0 24px' }} onClick={onClose}>确认添加</Button>
          <Button type="text" icon={<CloseOutlined style={{ fontSize: '16px', color: '#94A3B8' }} />} onClick={onClose} />
        </div>
        <div style={{ maxHeight: 250, overflowY: 'auto' }}>
          {filteredOptions.map(p => {
            const isChecked = selectedList.some((selected: any) => selected.id === p.id);
            return (
              <div key={p.id} onClick={() => handleCheck(!isChecked, p)} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                padding: '12px 0', 
                borderBottom: '1px solid #F1F5F9',
                color: isChecked ? '#4F8DFF' : '#64748B',
                fontWeight: isChecked ? 600 : 400,
                cursor: 'pointer',
              }}>
                <Checkbox 
                  checked={isChecked} 
                  onClick={e => e.stopPropagation()}
                  onChange={e => handleCheck(e.target.checked, p)}
                  style={{ marginRight: '16px' }}
                />
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px' }}>{p.productName}</span>
                  <div style={{ display: 'flex', alignItems: 'center', width: '260px' }}>
                    <span style={{ color: '#94A3B8', fontSize: '12px', flex: 1, textAlign: 'left', paddingRight: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.productCode}</span>
                    <span style={{ color: isChecked ? '#4F8DFF' : '#94A3B8', fontWeight: 600, width: '80px', textAlign: 'right', whiteSpace: 'nowrap' }}>¥{p.salePrice}</span>
                    <span style={{ color: '#94A3B8', fontSize: '12px', width: '48px', textAlign: 'right', whiteSpace: 'nowrap', marginLeft: '12px' }}>{isChecked ? '已添加' : ''}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Modal
      centered
      title={isView ? "线索详情" : editId ? "编辑线索" : "新增线索"}
      open={open}
      onCancel={onCancel}
      width={740}
      okText="保存"
      cancelText="取消"
      onOk={() => form.submit()}
      confirmLoading={loading}
      className="crm-unified-modal"
      footer={isView ? null : isThreeStep ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button onClick={onCancel}>取消</Button>
          {step > 0 && <Button onClick={() => setStep(step - 1)}>上一步</Button>}
          {step < 2 && <Button type="primary" loading={stepLoading} onClick={step === 0 ? nextFromStep1 : nextFromStep2}>下一步</Button>}
          {step === 2 && <Button type="primary" loading={loading} onClick={() => form.submit()}>保存线索</Button>}
        </div>
      ) : undefined}
    >
      {isThreeStep && (
        <Steps
          current={step}
          items={[{ title: '客户信息' }, { title: '车辆信息' }, { title: '商品信息' }]}
          style={{ marginBottom: '24px' }}
        />
      )}
      <Form form={form} layout="vertical" onFinish={onFinish} disabled={isView}>
        <div style={{ display: (!isThreeStep || step === 0) ? 'block' : 'none' }}>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>基础信息</div>

        <Row gutter={24}>
          <Col span={24}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div><span style={{ color: '#ff4d4f', marginRight: '4px' }}>*</span>客户信息</div>
              {!isView && !lockedCustomer && (
                <Button type="link" onClick={() => setIsNewCustomer(!isNewCustomer)}>
                  {isNewCustomer ? '← 选择已有客户' : '+ 新增客户'}
                </Button>
              )}
            </div>
            {lockedCustomer ? (
              <>
                <Form.Item name="customerId" hidden><Input /></Form.Item>
                <Input disabled value={`${lockedCustomer.customerName} (${lockedCustomer.phone})`} style={{ marginBottom: '16px', color: '#1f2937', backgroundColor: '#f3f4f6' }} />
              </>
            ) : isNewCustomer ? (
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item name="customerName" rules={[{ max: 30, message: '最多30字符' }]}>
                    <Input placeholder="请输入客户姓名" maxLength={30} showCount />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="customerPhone" rules={[{ required: true, message: '请输入客户电话' }, { pattern: /^\d{11}$/, message: '请输入11位纯数字手机号' }]}>
                    <Input placeholder="请输入客户电话" maxLength={11} showCount />
                  </Form.Item>
                </Col>
              </Row>
            ) : (
              <Form.Item name="customerId" rules={[{ required: true, message: '请选择客户' }]}>
                <Select
                  showSearch
                  placeholder="搜索客户姓名或电话"
                  filterOption={false}
                  onSearch={onSearchCustomer}
                  onPopupScroll={handleCustomerPopupScroll}
                  onDropdownVisibleChange={(open) => {
                    if (open && customerOptions.length === 0) {
                      setCustomerSearchValue('');
                      setCustomerPage(1);
                      loadCustomerOptions('', 1);
                    }
                  }}
                  notFoundContent={fetchingCustomers ? <Spin size="small" /> : null}
                  options={customerOptions.map(c => ({
                    value: c.id,
                    label: `${c.customerName} (${c.phone})`
                  }))}
                />
              </Form.Item>
            )}
          </Col>
        </Row>

        <Row gutter={24}>
          <Col span={12}>
            <Form.Item name="channelSource" label="渠道来源" rules={[{ required: true }]}>
              <Select placeholder="请选择" options={getDictOptions('channel_source')} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="sourceMethod" label="线索来源方式" rules={[{ required: true }]}>
              <Select placeholder="请选择" options={getDictOptions('lead_source_method')} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item name="sourceDate" label="来源日期" rules={[{ required: true, message: '请选择来源日期' }]}>
              <Input type="date" onClick={(e: any) => e.target?.showPicker?.()} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          {showWorkbenchFields && (
            <Col span={12}>
              <Form.Item name="callResult" label="呼出结果">
                <Select placeholder="请选择" allowClear options={getDictOptions('call_result')} />
              </Form.Item>
            </Col>
          )}
        </Row>

        {showWorkbenchFields && (
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item name="communicationTendency" label="客户沟通倾向">
                <Select placeholder="请选择" allowClear options={getDictOptions('communication_tendency')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="purchaseIntention" label="购买意向">
                <Select placeholder="请选择" allowClear options={getDictOptions('purchase_intention')} />
              </Form.Item>
            </Col>
          </Row>
        )}

        </div>

        {/* ===== 车辆信息（三步式第二步：默认选择方式 + 新增切换，PRD 配图 image24/25）===== */}
        <div style={{ display: (!isThreeStep || step === 1) ? 'block' : 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', marginTop: '8px' }}>
          <span style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>车辆信息</span>
          {isThreeStep && (
            vehicleMode === 'select'
              ? <Button type="link" onClick={() => setVehicleMode('create')}>+ 新增车辆</Button>
              : <Button type="link" onClick={() => setVehicleMode('select')}>← 选择已有车辆</Button>
          )}
        </div>
        {isThreeStep && vehicleMode === 'select' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '8px' }}>选择车辆</div>
            <Select
              style={{ width: '100%' }}
              placeholder={customerVehicles.length ? '请选择车辆' : '该客户暂无车辆，可点击右上角新增'}
              allowClear
              value={selectedVehicleId}
              onChange={setSelectedVehicleId}
              options={customerVehicles.map(v => ({ label: vehicleLabel(v), value: String(v.id) }))}
            />
          </div>
        )}
        <div style={{ display: (!isThreeStep || vehicleMode === 'create') ? 'block' : 'none' }}>
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item name="carBrand" label="品牌">
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
            <Form.Item name="carPlate" label="车牌号">
              <Input placeholder="请输入车牌号" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item name="carModel" label="车型">
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
            <Form.Item name="carStyle" label="款式">
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
        </Row>
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item name="carVin" label="车架号(VIN)" rules={[{ max: 17, message: '车架号(VIN)最多17位' }]}>
              <Input placeholder="请输入车架号" maxLength={17} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="purchaseDate" label="发票日期">
              <Input type="date" onClick={(e: any) => e.target?.showPicker?.()} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item label="车龄（月）" shouldUpdate={(prevValues, currentValues) => prevValues.purchaseDate !== currentValues.purchaseDate}>
              {() => {
                const pDate = form.getFieldValue('purchaseDate');
                let age = '自动计算';
                if (pDate) {
                  const diff = dayjs().diff(dayjs(pDate), 'month');
                  age = diff >= 0 ? String(diff) : '0';
                }
                return <Input value={age} disabled style={{ color: '#4b5563', backgroundColor: '#f3f4f6' }} />;
              }}
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="carMileage" label="里程数">
              <Input placeholder="请输入里程数" suffix="公里" onKeyDown={(e) => { if (!/[0-9.]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'].includes(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault(); }} onChange={(e) => { const val = e.target.value.replace(/[^0-9.]/g, ''); form.setFieldsValue({ carMileage: val }); }} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item name="isMileageOver40k" label="里程≥4万公里">
              <Select placeholder="请选择" allowClear>
                <Select.Option value="1">是</Select.Option>
                <Select.Option value="0">否</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="isMileageOver95k" label="里程≥9.5万公里">
              <Select placeholder="请选择" allowClear onChange={(val) => {
                if (val === '1' || val === '是') form.setFieldsValue({ isMileageOver40k: '1' });
              }}>
                <Select.Option value="1">是</Select.Option>
                <Select.Option value="0">否</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item name="hasExtendedWarranty" label="是否已购整车延保">
              <Select placeholder="请选择" allowClear>
                <Select.Option value="1">是</Select.Option>
                <Select.Option value="0">否</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="hasBatteryWarranty" label="是否已购电池延保">
              <Select placeholder="请选择" allowClear>
                <Select.Option value="1">是</Select.Option>
                <Select.Option value="0">否</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item name="hasPeaceOfMind" label="是否已购安心保">
              <Select placeholder="请选择" allowClear>
                <Select.Option value="1">是</Select.Option>
                <Select.Option value="0">否</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="hasTireProtection" label="是否已购轮胎保障">
              <Select placeholder="请选择" allowClear>
                <Select.Option value="1">是</Select.Option>
                <Select.Option value="0">否</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={24}>
          <Col span={24}>
            <Form.Item name="remark" label="车辆备注">
              <Input.TextArea placeholder="请输入备注信息" rows={3} maxLength={500} showCount />
            </Form.Item>
          </Col>
        </Row>
        </div>
        </div>

        {/* ===== 商品信息（三步式第三步，PRD 配图 image26）===== */}
        <div style={{ display: (!isThreeStep || step === 2) ? 'block' : 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '24px 0 16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937' }}>意向商品信息</span>
          <Button 
            type="primary" 
            style={{ borderRadius: '6px', background: '#4F8DFF', border: 'none', padding: '0 16px', height: '32px' }} 
            onClick={() => setIsProductSelectorOpen(true)}
          >
            + 添加商品
          </Button>
        </div>
        {isProductSelectorOpen && renderInlineSelector('intentProducts', productOptions, productSearchStr, setProductSearchStr, () => { setProductSearchStr(''); setIsProductSelectorOpen(false); })}
        <Form.Item name="intentProducts" noStyle>
          <Input type="hidden" />
        </Form.Item>
        <Table 
          dataSource={(Form.useWatch('intentProducts', form) || []).map((item: any, i: number) => ({ ...item, key: item.id || i, _index: i }))}
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无商品，请点击右上角添加' }}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: '商品名称', dataIndex: 'productName' },
            { title: '编码', dataIndex: 'productCode' },
            { title: '单价', dataIndex: 'salePrice', width: 120, render: val => `¥${val || 0}` },
            { title: '操作', key: 'action', width: 80, align: 'center', render: (_, record: any) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => {
              const currentList = form.getFieldValue('intentProducts') || [];
              const newProducts = currentList.filter((_: any, idx: number) => idx !== record._index);
              form.setFieldsValue({ intentProducts: newProducts });
            }} /> }
          ]}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '24px 0 16px' }}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937' }}>赠品信息</span>
          <Button 
            type="primary" 
            style={{ borderRadius: '6px', background: '#4F8DFF', border: 'none', padding: '0 16px', height: '32px' }} 
            onClick={() => setIsGiftSelectorOpen(true)}
          >
            + 添加赠品
          </Button>
        </div>
        {isGiftSelectorOpen && renderInlineSelector('intentGifts', giftOptions, giftSearchStr, setGiftSearchStr, () => { setGiftSearchStr(''); setIsGiftSelectorOpen(false); })}
        <Form.Item name="intentGifts" noStyle>
          <Input type="hidden" />
        </Form.Item>
        <Table 
          dataSource={(Form.useWatch('intentGifts', form) || []).map((item: any, i: number) => ({ ...item, key: item.id || i, _index: i }))}
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无赠品，请点击右上角添加' }}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: '赠品名称', dataIndex: 'productName' },
            { title: '编码', dataIndex: 'productCode' },
            { title: '单价/价值', dataIndex: 'salePrice', width: 120, render: val => `¥${val || 0}` },
            { title: '操作', key: 'action', width: 80, align: 'center', render: (_, record: any) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => {
              const currentList = form.getFieldValue('intentGifts') || [];
              const newGifts = currentList.filter((_: any, idx: number) => idx !== record._index);
              form.setFieldsValue({ intentGifts: newGifts });
            }} /> }
          ]}
        />
        </div>
      </Form>
    </Modal>
  );
};

export default LeadAddModal;
