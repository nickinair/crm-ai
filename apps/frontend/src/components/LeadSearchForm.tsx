import React, { useState } from 'react';
import { Form, Input, Select, Button, Modal, message, ConfigProvider } from 'antd';
import { useDict } from '../hooks/useDict';

interface Props {
  form: any;                 // 父级传入的 Form 实例
  onSearch: (values: any) => void;
  salesList?: any[];         // 负责人下拉数据
  darkLabels?: boolean;      // 深色背景页面（如公域池）用浅色标签
  storageScope: string;      // 常用搜索本地存储作用域，按页面隔离
  initialValues?: any;       // 表单初始值（用于返回列表时回填筛选）
}

// 线索类页面共享搜索表单：三分类字段 + 高级搜索 + 编辑常用搜索
// 线索池管理、公域池抢单共用，保证搜索能力完全一致
const LeadSearchForm: React.FC<Props> = ({ form, onSearch, salesList = [], darkLabels = false, storageScope, initialValues }) => {
  const { getDictOptions } = useDict();

  const DEFAULT_QUICK_KEYS = ['customerName', 'customerPhone', 'leadStatus', 'assignedAccountId'];
  const quickStorageKey = () => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      return `crm-quick-search-${storageScope}-${u.id || 'anon'}`;
    } catch { return `crm-quick-search-${storageScope}-anon`; }
  };
  const [quickSearchKeys, setQuickSearchKeys] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(quickStorageKey()) || 'null');
      if (Array.isArray(saved) && saved.length === 4) return saved;
    } catch { /* 忽略损坏的本地配置 */ }
    return DEFAULT_QUICK_KEYS;
  });
  const [isAdvancedSearch, setIsAdvancedSearch] = useState(false);
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [draftQuickKeys, setDraftQuickKeys] = useState<string[]>(DEFAULT_QUICK_KEYS);
  const [activeSlot, setActiveSlot] = useState(0);

  // 标签渲染：深色页面用浅色文字
  const L = (text: string) => darkLabels ? <span style={{ color: '#c9cdd4' }}>{text}</span> : (text as any);

  const groupTitle = (text: string) => (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 2px' }}>
      <span style={{ color: darkLabels ? '#E2E8F0' : '#1F2937', fontSize: 15, fontWeight: 600, flexShrink: 0 }}>{text}</span>
      <span style={{ flex: 1, height: 1, background: darkLabels ? 'rgba(255,255,255,0.12)' : '#EBEEF3' }} />
    </div>
  );
  const yesNoOptions = [{ value: '1', label: '是' }, { value: '0', label: '否' }];

  // 全部搜索字段注册表：key / 标签 / 分组 / 渲染器
  const searchFieldDefs: Array<{ key: string; label: string; group: string; render: () => React.ReactNode }> = [
    { key: 'customerName', label: '客户姓名', group: '基础信息', render: () => (
      <Form.Item name="customerName" label={L('客户姓名')}><Input placeholder="请输入姓名" style={{ width: 140 }} allowClear /></Form.Item>) },
    { key: 'customerPhone', label: '客户电话', group: '基础信息', render: () => (
      <Form.Item name="customerPhone" label={L('客户电话')}><Input placeholder="请输入电话" style={{ width: 140 }} allowClear /></Form.Item>) },
    { key: 'channelSource', label: '渠道来源', group: '基础信息', render: () => (
      <Form.Item name="channelSource" label={L('渠道来源')}><Select placeholder="请选择" style={{ width: 140 }} allowClear options={getDictOptions('channel_source')} /></Form.Item>) },
    { key: 'sourceMethod', label: '线索来源方式', group: '基础信息', render: () => (
      <Form.Item name="sourceMethod" label={L('线索来源方式')}><Select placeholder="请选择" style={{ width: 140 }} allowClear options={getDictOptions('lead_source_method')} /></Form.Item>) },
    { key: 'leadCode', label: '线索编码', group: '基础信息', render: () => (
      <Form.Item name="leadCode" label={L('线索编码')}><Input placeholder="请输入线索编码" style={{ width: 150 }} allowClear /></Form.Item>) },
    { key: 'leadStatus', label: '线索状态', group: '基础信息', render: () => (
      <Form.Item name="leadStatus" label={L('线索状态')}>
        <Select placeholder="请选择" style={{ width: 150 }} mode="multiple" allowClear maxTagCount="responsive">
          <Select.Option value={0}>待分配</Select.Option>
          <Select.Option value={1}>待跟进</Select.Option>
          <Select.Option value={2}>跟进中</Select.Option>
          <Select.Option value={3}>已完成</Select.Option>
          <Select.Option value={4}>已战败</Select.Option>
          <Select.Option value={5}>已作废</Select.Option>
          <Select.Option value={6}>回收待分配</Select.Option>
        </Select>
      </Form.Item>) },
    { key: 'assignControl', label: '分配管控标识', group: '基础信息', render: () => (
      <Form.Item name="assignControl" label={L('分配管控标识')}>
        <Select placeholder="请选择" style={{ width: 140 }} allowClear>
          <Select.Option value={1}>战败冷却期</Select.Option>
          <Select.Option value={2}>战败已复活</Select.Option>
        </Select>
      </Form.Item>) },
    { key: 'orderSituation', label: '订单情况', group: '基础信息', render: () => (
      <Form.Item name="orderSituation" label={L('订单情况')}>
        <Select placeholder="请选择" style={{ width: 150 }} allowClear>
          <Select.Option value={0}>未下单</Select.Option>
          <Select.Option value={1}>存在未完结订单</Select.Option>
          <Select.Option value={2}>全部订单已作废</Select.Option>
          <Select.Option value={3}>全部订单已完结</Select.Option>
        </Select>
      </Form.Item>) },
    { key: 'createType', label: '线索创建类型', group: '基础信息', render: () => (
      <Form.Item name="createType" label={L('线索创建类型')}>
        <Select placeholder="请选择" style={{ width: 140 }} allowClear>
          <Select.Option value={1}>普通新建</Select.Option>
          <Select.Option value={2}>战败线索复活</Select.Option>
        </Select>
      </Form.Item>) },
    { key: 'assignedAccountId', label: '负责人', group: '基础信息', render: () => (
      <Form.Item name="assignedAccountId" label={L('负责人')}>
        <Select placeholder="请选择" style={{ width: 140 }} allowClear showSearch optionFilterProp="label"
          options={salesList.map((s: any) => ({ value: s.id, label: s.realName || s.username }))} />
      </Form.Item>) },
    { key: 'createdAt', label: '创建时间', group: '基础信息', render: () => (<>
      <Form.Item name="createdAtStart" label={L('创建时间')}><Input type="date" style={{ width: 150 }} /></Form.Item>
      <Form.Item name="createdAtEnd" label={L('至')} style={{ marginLeft: -8 }}><Input type="date" style={{ width: 150 }} /></Form.Item>
    </>) },

    { key: 'carModel', label: '车型', group: '车辆信息', render: () => (
      <Form.Item name="carModel" label={L('车型')}><Input placeholder="请输入车型" style={{ width: 140 }} allowClear /></Form.Item>) },
    { key: 'carStyle', label: '款式', group: '车辆信息', render: () => (
      <Form.Item name="carStyle" label={L('款式')}><Input placeholder="请输入款式" style={{ width: 140 }} allowClear /></Form.Item>) },
    { key: 'invoiceDate', label: '发票日期', group: '车辆信息', render: () => (<>
      <Form.Item name="invoiceDateStart" label={L('发票日期')}><Input type="date" style={{ width: 150 }} /></Form.Item>
      <Form.Item name="invoiceDateEnd" label={L('至')} style={{ marginLeft: -8 }}><Input type="date" style={{ width: 150 }} /></Form.Item>
    </>) },
    { key: 'vin', label: '车架号', group: '车辆信息', render: () => (
      <Form.Item name="vin" label={L('车架号')}><Input placeholder="请输入车架号" style={{ width: 170 }} allowClear /></Form.Item>) },
    { key: 'vehicleAgeMin', label: '车龄（月）', group: '车辆信息', render: () => (
      <Form.Item name="vehicleAgeMin" label={L('车龄（月）')}><Input type="number" min={0} placeholder="≥ 月数" style={{ width: 110 }} /></Form.Item>) },
    { key: 'mileageMin', label: '里程数', group: '车辆信息', render: () => (
      <Form.Item name="mileageMin" label={L('里程数')}><Input type="number" min={0} placeholder="≥ 公里" style={{ width: 120 }} /></Form.Item>) },
    { key: 'isMileageOver40k', label: '里程≥4万公里', group: '车辆信息', render: () => (
      <Form.Item name="isMileageOver40k" label={L('里程≥4万公里')}><Select placeholder="请选择" style={{ width: 100 }} allowClear options={yesNoOptions} /></Form.Item>) },
    { key: 'isMileageOver95k', label: '里程≥9.5万公里', group: '车辆信息', render: () => (
      <Form.Item name="isMileageOver95k" label={L('里程≥9.5万公里')}><Select placeholder="请选择" style={{ width: 100 }} allowClear options={yesNoOptions} /></Form.Item>) },
    { key: 'hasExtendedWarranty', label: '是否已购整车延保', group: '车辆信息', render: () => (
      <Form.Item name="hasExtendedWarranty" label={L('是否已购整车延保')}><Select placeholder="请选择" style={{ width: 100 }} allowClear options={yesNoOptions} /></Form.Item>) },
    { key: 'hasBatteryWarranty', label: '是否已购电池延保', group: '车辆信息', render: () => (
      <Form.Item name="hasBatteryWarranty" label={L('是否已购电池延保')}><Select placeholder="请选择" style={{ width: 100 }} allowClear options={yesNoOptions} /></Form.Item>) },
    { key: 'hasPeaceOfMind', label: '是否已购安心保', group: '车辆信息', render: () => (
      <Form.Item name="hasPeaceOfMind" label={L('是否已购安心保')}><Select placeholder="请选择" style={{ width: 100 }} allowClear options={yesNoOptions} /></Form.Item>) },
    { key: 'hasTireProtection', label: '是否已购轮胎保障', group: '车辆信息', render: () => (
      <Form.Item name="hasTireProtection" label={L('是否已购轮胎保障')}><Select placeholder="请选择" style={{ width: 100 }} allowClear options={yesNoOptions} /></Form.Item>) },

    { key: 'isAddWechat', label: '添加微信状态', group: '跟进情况', render: () => (
      <Form.Item name="isAddWechat" label={L('添加微信状态')}><Select placeholder="请选择" style={{ width: 130 }} allowClear options={getDictOptions('wechat_add_status')} /></Form.Item>) },
    { key: 'purchaseIntention', label: '购买意向', group: '跟进情况', render: () => (
      <Form.Item name="purchaseIntention" label={L('购买意向')}><Select placeholder="请选择" style={{ width: 130 }} allowClear options={getDictOptions('purchase_intention')} /></Form.Item>) },
    { key: 'communicationTendency', label: '客户沟通倾向', group: '跟进情况', render: () => (
      <Form.Item name="communicationTendency" label={L('客户沟通倾向')}><Select placeholder="请选择" style={{ width: 140 }} allowClear options={getDictOptions('communication_tendency')} /></Form.Item>) },
    { key: 'callResult', label: '呼叫结果', group: '跟进情况', render: () => (
      <Form.Item name="callResult" label={L('呼叫结果')}><Select placeholder="请选择" style={{ width: 140 }} allowClear options={getDictOptions('call_result')} /></Form.Item>) },
    { key: 'intentProduct', label: '意向商品', group: '跟进情况', render: () => (
      <Form.Item name="intentProduct" label={L('意向商品')}><Input placeholder="请输入商品名称" style={{ width: 150 }} allowClear /></Form.Item>) },
    { key: 'intentGift', label: '意向赠品', group: '跟进情况', render: () => (
      <Form.Item name="intentGift" label={L('意向赠品')}><Input placeholder="请输入赠品名称" style={{ width: 150 }} allowClear /></Form.Item>) },
    { key: 'followDaysMin', label: '跟进天数', group: '跟进情况', render: () => (
      <Form.Item name="followDaysMin" label={L('跟进天数')}><Input type="number" min={0} placeholder="精确天数" style={{ width: 110 }} /></Form.Item>) },
  ];
  const fieldMap: Record<string, typeof searchFieldDefs[number]> = Object.fromEntries(searchFieldDefs.map(f => [f.key, f]));
  const groups = ['基础信息', '车辆信息', '跟进情况'];

  const openQuickEdit = () => { setDraftQuickKeys([...quickSearchKeys]); setActiveSlot(0); setIsQuickEditOpen(true); };
  const saveQuickSearch = () => {
    setQuickSearchKeys(draftQuickKeys);
    try { localStorage.setItem(quickStorageKey(), JSON.stringify(draftQuickKeys)); } catch { /* 忽略 */ }
    setIsQuickEditOpen(false);
    message.success('常用搜索已更新');
  };

  const linkColor = darkLabels ? '#818CF8' : '#3b82f6';

  return (<>
    {/* 深色页面：把下拉面板渲染到表单内部，使 pool-dark-search 深色样式生效 */}
    <ConfigProvider getPopupContainer={darkLabels ? ((node: any) => node?.parentElement || document.body) : undefined}>
    <Form form={form} layout="inline" onFinish={onSearch} style={{ rowGap: 16 }} initialValues={initialValues}>
      {!isAdvancedSearch
        ? quickSearchKeys.map(k => fieldMap[k] ? <React.Fragment key={k}>{fieldMap[k].render()}</React.Fragment> : null)
        : groups.map(g => (
            <React.Fragment key={g}>
              {groupTitle(g)}
              {searchFieldDefs.filter(f => f.group === g).map(f => <React.Fragment key={f.key}>{f.render()}</React.Fragment>)}
            </React.Fragment>
          ))}

      <Form.Item>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Button htmlType="button" onClick={() => { form.resetFields(); onSearch({}); }} className="crm-btn crm-btn-outline" style={{ height: '36px' }}>重置</Button>
          <Button htmlType="submit" className="crm-btn crm-btn-primary" style={{ height: '36px' }}>查询</Button>
          <a style={{ fontSize: 13, marginLeft: 4, color: linkColor, cursor: 'pointer' }} onClick={() => setIsAdvancedSearch(!isAdvancedSearch)}>
            {isAdvancedSearch ? '收起' : '高级搜索'}
          </a>
          <a style={{ fontSize: 13, marginLeft: 4, color: linkColor, cursor: 'pointer' }} onClick={openQuickEdit}>编辑常用搜索</a>
        </div>
      </Form.Item>
    </Form>
    </ConfigProvider>

    <Modal
      title="编辑常用搜索"
      open={isQuickEditOpen}
      onCancel={() => setIsQuickEditOpen(false)}
      centered
      width={780}
      className="crm-unified-modal"
      footer={[
        <Button key="reset" onClick={() => { setDraftQuickKeys([...DEFAULT_QUICK_KEYS]); setActiveSlot(0); }} style={{ float: 'left' }}>恢复默认</Button>,
        <Button key="cancel" onClick={() => setIsQuickEditOpen(false)}>取消</Button>,
        <Button key="save" type="primary" onClick={saveQuickSearch}>保存</Button>,
      ]}
    >
      <div style={{ color: '#64748B', fontSize: 13, marginBottom: 12 }}>
        先点击选中一个位置，再从下方字段中选择要放入的搜索项；每个字段只能使用一次。
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {draftQuickKeys.map((k, i) => (
          <div key={i} onClick={() => setActiveSlot(i)}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8, textAlign: 'center', cursor: 'pointer',
              border: activeSlot === i ? '2px solid #6366F1' : '1px solid #D1D5DB',
              background: activeSlot === i ? '#EEF2FF' : '#F8FAFC', color: '#1F2937', fontWeight: 500,
            }}>
            <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 2 }}>位置 {i + 1}</div>
            {fieldMap[k]?.label || '-'}
          </div>
        ))}
      </div>
      {groups.map(g => (
        <div key={g} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '6px 0 10px' }}>
            <span style={{ color: '#1F2937', fontSize: 14, fontWeight: 600 }}>{g}</span>
            <span style={{ flex: 1, height: 1, background: '#EBEEF3' }} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {searchFieldDefs.filter(f => f.group === g).map(f => {
              const usedIdx = draftQuickKeys.indexOf(f.key);
              const inActive = usedIdx === activeSlot;
              const usedElsewhere = usedIdx !== -1 && !inActive;
              return (
                <div key={f.key}
                  onClick={() => {
                    if (usedElsewhere || inActive) return;
                    setDraftQuickKeys(prev => { const next = [...prev]; next[activeSlot] = f.key; return next; });
                    setActiveSlot(s => Math.min(s + 1, 3));
                  }}
                  style={{
                    padding: '6px 14px', borderRadius: 16, fontSize: 13,
                    cursor: usedElsewhere ? 'not-allowed' : 'pointer',
                    border: inActive ? '1px solid #6366F1' : '1px solid #E2E8F0',
                    background: inActive ? '#EEF2FF' : usedElsewhere ? '#F1F5F9' : '#fff',
                    color: inActive ? '#4F46E5' : usedElsewhere ? '#B0B7C3' : '#334155',
                  }}>
                  {f.label}{usedIdx !== -1 ? ` · 位置${usedIdx + 1}` : ''}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Modal>
  </>);
};

export default LeadSearchForm;
