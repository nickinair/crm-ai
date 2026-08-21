import React, { useEffect, useState } from 'react';
import { Table, Input, Button, Modal, Form, Select, message, ConfigProvider, Switch, Tooltip } from 'antd';
import request from '../utils/request';
import './Leads.css';

/**
 * 配置管理（数据字典维护）
 * 左侧字典类型列表，右侧该类型下的字典项，支持新增/编辑/启停/删除。
 * 典型用途：调整「战败线索冷却期」天数、维护渠道来源/下单平台/商品属性等选项。
 */
const Config: React.FC = () => {
  const [types, setTypes] = useState<any[]>([]);
  const [typeKeyword, setTypeKeyword] = useState('');
  const [activeType, setActiveType] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  // 新增/编辑弹框
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  /** 联动字典：字典项需要指定父级值（如商品属性挂在商品类型下） */
  const LINKED_PARENT: Record<string, string> = { product_attribute: 'product_type' };
  const parentTypeCode = activeType ? LINKED_PARENT[activeType.dictTypeCode] : undefined;
  const [parentOptions, setParentOptions] = useState<{ label: string; value: string }[]>([]);

  const fetchTypes = async (keyword = '') => {
    setLoadingTypes(true);
    try {
      const res: any = await request.get('/dict/admin/types', { params: keyword ? { keyword } : {} });
      const list = Array.isArray(res) ? res : [];
      setTypes(list);
      // 默认选中第一个；若当前选中项仍在结果中则保持
      if (list.length) {
        const keep = activeType && list.find((t: any) => String(t.id) === String(activeType.id));
        setActiveType(keep || list[0]);
      } else {
        setActiveType(null);
        setItems([]);
      }
    } catch (e) {
      console.error(e);
      message.error('获取字典类型失败');
    } finally {
      setLoadingTypes(false);
    }
  };

  const fetchItems = async (typeId: string) => {
    setLoadingItems(true);
    try {
      const res: any = await request.get(`/dict/admin/items/${typeId}`);
      setItems(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error(e);
      message.error('获取字典项失败');
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => { fetchTypes(); }, []);

  useEffect(() => {
    if (activeType) {
      fetchItems(activeType.id);
      // 联动字典：加载父级可选值
      const pCode = LINKED_PARENT[activeType.dictTypeCode];
      if (pCode) {
        request.get(`/dict/type/${pCode}`).then((res: any) => {
          setParentOptions((Array.isArray(res) ? res : []).map((i: any) => ({ label: i.itemLabel, value: i.itemValue })));
        }).catch(() => setParentOptions([]));
      } else {
        setParentOptions([]);
      }
    }
  }, [activeType?.id]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1, sortOrder: (items.length || 0) + 1 });
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue({
      itemLabel: record.itemLabel,
      itemValue: record.itemValue,
      parentValue: record.parentValue || undefined,
      sortOrder: record.sortOrder,
      status: record.status,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await request.put(`/dict/admin/items/${editing.id}`, values);
        message.success('修改成功！');
      } else {
        await request.post('/dict/admin/items', { ...values, dictTypeId: activeType.id });
        message.success('新增成功！');
      }
      setModalOpen(false);
      setEditing(null);
      fetchItems(activeType.id);
      fetchTypes(typeKeyword);
    } catch (e: any) {
      if (e?.errorFields) return;
      if (!e?.response) message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (record: any, checked: boolean) => {
    try {
      await request.put(`/dict/admin/items/${record.id}`, { status: checked ? 1 : 0 });
      message.success(checked ? '已启用' : '已停用');
      fetchItems(activeType.id);
    } catch (e: any) {
      if (!e?.response) message.error(e?.message || '操作失败');
    }
  };

  const handleDelete = (record: any) => {
    Modal.confirm({
      title: '提示',
      content: `确定要删除字典项「${record.itemLabel}」吗？删除后使用该值的历史数据不受影响，但下拉菜单中将不再出现该选项。`,
      okText: '确定', cancelText: '取消', centered: true, className: 'crm-unified-modal',
      onOk: async () => {
        await request.delete(`/dict/admin/items/${record.id}`);
        message.success('删除成功！');
        fetchItems(activeType.id);
        fetchTypes(typeKeyword);
      },
    });
  };

  const columns: any[] = [
    { title: '显示名称', dataIndex: 'itemLabel', width: 220 },
    { title: '存储值', dataIndex: 'itemValue', width: 220, render: (v: any) => <span style={{ color: '#475569' }}>{v}</span> },
    ...(parentTypeCode ? [{
      title: '所属父级', dataIndex: 'parentValue', width: 140,
      render: (v: any) => v || <span style={{ color: '#94A3B8' }}>-</span>,
    }] : []),
    { title: '排序', dataIndex: 'sortOrder', width: 80 },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (v: number, r: any) => (
        <Switch size="small" checked={v === 1} onChange={(checked) => toggleStatus(r, checked)} />
      ),
    },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, r: any) => (
        <div className="action-links">
          <a onClick={() => openEdit(r)}>编辑</a>
          <a className="delete-link" onClick={() => handleDelete(r)}>删除</a>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, background: '#ffffff', borderRadius: '16px', overflow: 'hidden' }}>
      <div className="table-card" style={{ borderRadius: '16px', border: 'none', boxShadow: 'none', display: 'flex', flexDirection: 'row', gap: '20px', alignItems: 'stretch' }}>

        {/* ===== 左：字典类型 ===== */}
        <div style={{ width: '260px', flex: '0 0 260px', borderRight: '1px solid #e5e7eb', paddingRight: '20px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '12px' }}>配置项</h3>
          <Input.Search
            placeholder="搜索配置项"
            allowClear
            value={typeKeyword}
            onChange={e => setTypeKeyword(e.target.value)}
            onSearch={(v) => fetchTypes(v)}
            style={{ marginBottom: '12px' }}
          />
          <div style={{ maxHeight: '620px', overflowY: 'auto' }}>
            {loadingTypes && <div style={{ color: '#94A3B8', fontSize: 12, padding: '8px 0' }}>加载中…</div>}
            {!loadingTypes && types.length === 0 && <div style={{ color: '#94A3B8', fontSize: 12, padding: '8px 0' }}>暂无配置项</div>}
            {types.map(t => {
              const active = activeType && String(activeType.id) === String(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => setActiveType(t)}
                  style={{
                    padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '4px',
                    background: active ? 'rgba(99,102,241,0.08)' : 'transparent',
                    border: active ? '1px solid rgba(99,102,241,0.35)' : '1px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: active ? '#4F46E5' : '#1f2937', fontWeight: active ? 600 : 500, fontSize: '14px' }}>
                      {t.dictTypeName}
                    </span>
                    <span style={{ color: '#94A3B8', fontSize: '12px' }}>{t.itemCount}</span>
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '12px', marginTop: '2px' }}>{t.dictTypeCode}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===== 右：字典项 ===== */}
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div className="table-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0 }}>{activeType ? activeType.dictTypeName : '配置明细'}</h3>
              {activeType?.remark && (
                <div style={{ color: '#94A3B8', fontSize: '12px', marginTop: '4px' }}>{activeType.remark}</div>
              )}
            </div>
            <Button onClick={openAdd} className="action-btn" style={{ height: '36px' }} disabled={!activeType}>+ 新增配置</Button>
          </div>

          {/* 单值型配置（如冷却天数）给出使用提示 */}
          {activeType?.dictTypeCode === 'defeat_cooldown_days' && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#475569', fontSize: '12px' }}>
              该配置为单值配置：<b>存储值</b>即冷却天数。线索转为「已战败」后进入冷却期，满该天数后自动解冻，方可被重新分配或在公域池领取。修改后立即生效，无需重启服务。
            </div>
          )}

          <ConfigProvider getPopupContainer={(trigger) => trigger?.parentElement || document.body}>
            <Table
              className="custom-table"
              columns={columns}
              dataSource={items}
              rowKey="id"
              loading={loadingItems}
              pagination={false}
              locale={{ emptyText: activeType ? '该配置项下暂无内容，请点击右上角新增' : '请先选择左侧配置项' }}
            />
          </ConfigProvider>
        </div>
      </div>

      {/* ===== 新增/编辑弹框 ===== */}
      <Modal
        centered
        title={editing ? '编辑配置' : '新增配置'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={600}
        className="crm-unified-modal"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="itemLabel" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }, { max: 120, message: '最多120个字符' }]}>
            <Input placeholder="下拉菜单中展示的文字" maxLength={120} />
          </Form.Item>
          <Form.Item
            name="itemValue"
            label={<span>存储值 <Tooltip title="实际写入业务数据的值。已被历史数据使用的存储值不建议修改，否则历史记录将无法匹配到该选项。"><span style={{ color: '#94A3B8', cursor: 'help' }}>（?）</span></Tooltip></span>}
            rules={[{ required: true, message: '请输入存储值' }, { max: 120, message: '最多120个字符' }]}
          >
            <Input placeholder="写入数据库的值，通常与显示名称一致" maxLength={120} />
          </Form.Item>
          {parentTypeCode && (
            <Form.Item name="parentValue" label="所属父级" rules={[{ required: true, message: '请选择所属父级' }]}>
              <Select placeholder="请选择该选项归属的上级值" options={parentOptions} />
            </Form.Item>
          )}
          <Form.Item name="sortOrder" label="排序" rules={[{ required: true, message: '请输入排序号' }]}>
            <Input type="number" min={0} placeholder="数字越小越靠前" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={[{ label: '启用', value: 1 }, { label: '停用', value: 0 }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Config;
