import React, { useEffect, useState, useMemo } from 'react';
import { Modal, Form, Input, Select, Row, Col, Button, Table, message, Checkbox, Spin, AutoComplete } from 'antd';
import { DeleteOutlined, SearchOutlined, CloseOutlined } from '@ant-design/icons';
import request from '../utils/request';
import { useDict } from '../hooks/useDict';
import { useVehicleOptions } from '../hooks/useVehicleOptions';
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
  const { brandOptions, modelOptions, styleOptions } = useVehicleOptions();
  
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

  useEffect(() => {
    if (open) {
      form.resetFields();
      setIsNewCustomer(false);
      setCustomerOptions([]);
      setCustomerSearchValue('');
      setCustomerPage(1);
      setCustomerTotal(0);
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
      const res = await request.get('/product');
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
        isNewCustomer,
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
              <div key={p.id} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                padding: '12px 0', 
                borderBottom: '1px solid #F1F5F9',
                color: isChecked ? '#4F8DFF' : '#64748B',
                fontWeight: isChecked ? 600 : 400,
              }}>
                <Checkbox 
                  checked={isChecked} 
                  onChange={e => handleCheck(e.target.checked, p)}
                  style={{ marginRight: '16px' }}
                />
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px' }}>{p.productName}</span>
                  <div style={{ display: 'flex', alignItems: 'center', width: '260px' }}>
                    <span style={{ color: '#94A3B8', fontSize: '13px', flex: 1, textAlign: 'left', paddingRight: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.productCode}</span>
                    <span style={{ color: isChecked ? '#4F8DFF' : '#94A3B8', fontWeight: 600, width: '80px', textAlign: 'right', whiteSpace: 'nowrap' }}>¥{p.salePrice}</span>
                    <span style={{ color: '#94A3B8', fontSize: '13px', width: '48px', textAlign: 'right', whiteSpace: 'nowrap', marginLeft: '12px' }}>{isChecked ? '已添加' : ''}</span>
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
      width={720}
      okText="保存"
      cancelText="取消"
      onOk={() => form.submit()}
      confirmLoading={loading}
      className="crm-unified-modal"
      footer={isView ? null : undefined}
    >
      <Form form={form} layout="vertical" onFinish={onFinish} disabled={isView}>
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>基础信息</div>

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
              <Input type="date" style={{ width: '100%' }} />
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

        <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '16px', marginTop: '8px' }}>车辆信息</div>
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
              <Input type="date" style={{ width: '100%' }} />
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
      </Form>
    </Modal>
  );
};

export default LeadAddModal;
