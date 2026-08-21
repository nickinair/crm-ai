import React, { useEffect, useState } from 'react';
import { Button, Table, Tag, message, Modal } from 'antd';
import { WarningOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import request from '../utils/request';
import './Leads.css';

const LeadTemp: React.FC = () => {
  const navigate = useNavigate();
  const { batchNo } = useParams<{ batchNo?: string }>();
  const [rawWarnData, setRawWarnData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchWarnData = async () => {
    if (!batchNo) return;
    setLoading(true);
    try {
      const res = await request.get(`/lead/import-warn/${batchNo}`);
      setRawWarnData(Array.isArray(res) ? res : []);
    } catch (err) {
      message.error('获取警告数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWarnData();
  }, [batchNo]);

  const handleResolve = async (id: string, action: string) => {
    try {
      const res = await request.post(`/lead/import-warn/${id}/resolve`, { action });
      if ((res as any)?.error) {
        message.error((res as any).message);
        return;
      }
      message.success((res as any)?.message || '处理成功');
      setRawWarnData(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      message.error('处理失败');
    }
  };

  // Flatten: each warn item → 2 rows (import row + system row)
  const tableData = rawWarnData.flatMap((item) => {
    const raw = item.rawData || {};
    const importRow: any = {
      _key: `${item.id}-import`,
      _isImport: true,
      _warnId: item.id,
      _warnType: item.warnType,
      _warnDetail: item.warnDetail,
      _rowSpanCount: 2,
      警告内容: item.warnType,
      线索编码: raw['线索编码'] || '-',
      客户姓名: raw['客户姓名'] || '-',
      客户电话: raw['客户电话'] || '-',
      渠道来源: raw['渠道来源'] || '-',
      线索来源方式: raw['线索来源方式'] || '-',
      意向车型: raw['车型'] || '-',
      车架号: raw['车架号'] || '-',
      车型: raw['车型'] || '-',
      车牌号: raw['车牌号'] || '-',
      款式: raw['款式'] || '-',
      发票日期: raw['发票日期'] || '-',
    };

    // System row: fill from conflict data
    const sysRow: any = {
      _key: `${item.id}-system`,
      _isImport: false,
      _warnId: item.id,
      _warnType: item.warnType,
      _rowSpanCount: 0,
      警告内容: '-',
      线索编码: '-',
      客户姓名: item.conflictCustomer?.customerName || '-',
      客户电话: item.conflictCustomer?.phone || '-',
      渠道来源: '-',
      线索来源方式: '-',
      意向车型: '-',
      车架号: item.conflictVehicle?.vin || (item.customerVehicles?.[0]?.vin) || '-',
      车型: item.conflictVehicle?.model || (item.customerVehicles?.[0]?.model) || '-',
      车牌号: item.conflictVehicle?.plateNo || (item.customerVehicles?.[0]?.plateNo) || '-',
      款式: item.conflictVehicle?.style || (item.customerVehicles?.[0]?.style) || '-',
      发票日期: '-',
    };

    return [importRow, sysRow];
  });

  const warnTypeMap: Record<string, { color: string; text: string }> = {
    customer_name_mismatch: { color: 'orange', text: '电话相同，姓名不同' },
    vehicle_owner_conflict: { color: 'volcano', text: '车辆已绑定客户' },
    vehicle_info_diff: { color: 'gold', text: '车辆信息不一致' },
    vehicle_info_mismatch: { color: 'gold', text: '车辆信息不一致' },
    customer_exists: { color: 'blue', text: '客户已存在' },
    customer_active_lead: { color: 'red', text: '客户存在未完结线索' },
  };

  const confirmResolve = (r: any, action: string, type: 'customer_use' | 'customer_update' | 'vehicle_bind' | 'vehicle_use' | 'vehicle_update' | 'discard') => {
    let content: React.ReactNode = '';
    
    if (type === 'customer_use') {
      content = <div>确定后，线索：{r.线索编码} 的客户信息将更新为系统已有客户数据的信息，确定要沿用系统客户数据吗？<br/><br/><span style={{color:'#999'}}>PS：{r.线索编码}为线索编码</span></div>;
    } else if (type === 'customer_update') {
      content = '确定后，线索中客户已有数据将覆盖系统已有客户数据，确定要更新系统客户信息吗？';
    } else if (type === 'vehicle_bind') {
      content = <div>确定要将车辆信息绑定到 {r.客户姓名} 客户名下吗？<br/><br/><span style={{color:'#999'}}>PS：{r.客户姓名} 是线索中的客户名称</span></div>;
    } else if (type === 'vehicle_use') {
      content = '确定后，车辆信息将更新为系统已有车辆的信息，确定要沿用系统车辆数据吗？';
    } else if (type === 'vehicle_update') {
      content = '确定后，线索中车辆已有数据将覆盖系统已有车辆数据，确定要更新系统车辆信息吗？';
    } else if (type === 'discard') {
      content = '确定要弃用吗？';
    }

    Modal.confirm({
      title: '操作确认',
      content,
      okText: '确定',
      cancelText: '取消',
      onOk: () => handleResolve(r._warnId, action),
    });
  };

  const renderActions = (r: any) => {
    if (!r._isImport) return null;
    const type = r._warnType;
    const id = r._warnId;
    if (type === 'customer_name_mismatch' || type === 'customer_exists') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a style={{ color: '#3B82F6', whiteSpace: 'nowrap' }} onClick={() => confirmResolve(r, 'use_system', 'customer_use')}>沿用系统客户数据</a>
          <a style={{ color: '#10B981', whiteSpace: 'nowrap' }} onClick={() => confirmResolve(r, 'update_system', 'customer_update')}>更新系统客户信息</a>
        </div>
      );
    }
    if (type === 'vehicle_owner_conflict') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a style={{ color: '#3B82F6', whiteSpace: 'nowrap' }} onClick={() => handleResolve(id, 'overwrite_vehicle')}>修改车辆信息</a>
          <a style={{ color: '#10B981', whiteSpace: 'nowrap' }} onClick={() => confirmResolve(r, 'bind_new', 'vehicle_bind')}>绑定新客户信息</a>
        </div>
      );
    }
    if (type === 'vehicle_info_diff' || type === 'vehicle_info_mismatch') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a style={{ color: '#3B82F6', whiteSpace: 'nowrap' }} onClick={() => confirmResolve(r, 'use_system', 'vehicle_use')}>沿用系统车辆信息</a>
          <a style={{ color: '#10B981', whiteSpace: 'nowrap' }} onClick={() => confirmResolve(r, 'overwrite_vehicle', 'vehicle_update')}>覆盖系统车辆信息</a>
        </div>
      );
    }
    if (type === 'customer_active_lead') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <a style={{ color: '#EF4444', whiteSpace: 'nowrap' }} onClick={() => confirmResolve(r, 'discard', 'discard')}>弃用线索</a>
        </div>
      );
    }
    return <a style={{ color: '#3B82F6' }} onClick={() => confirmResolve(r, 'use_system', 'customer_use')}>沿用系统数据</a>;
  };

  const columns: any[] = [
    {
      title: '警告内容',
      dataIndex: '警告内容',
      width: 150,
      fixed: 'left',
      onCell: (r: any) => ({
        rowSpan: r._rowSpanCount,
        style: r._isImport ? {} : { display: 'none' },
      }),
      render: (v: string, r: any) => {
        if (!r._isImport) return null;
        const info = warnTypeMap[v] || { color: 'default', text: v };
        return <Tag color={info.color} style={{ whiteSpace: 'normal' }}>{info.text}</Tag>;
      },
    },
    { title: '线索编码', dataIndex: '线索编码', width: 120 },
    { title: '客户姓名', dataIndex: '客户姓名', width: 80 },
    { title: '客户电话', dataIndex: '客户电话', width: 130 },
    { title: '渠道来源', dataIndex: '渠道来源', width: 100 },
    { title: '线索来源方式', dataIndex: '线索来源方式', width: 120 },
    { title: '意向车型', dataIndex: '意向车型', width: 100 },
    {
      title: '车架号',
      dataIndex: '车架号',
      width: 200,
      render: (v: string, r: any) => {
        if (v === '-') return '-';
        // Highlight conflict VIN in red
        const isConflict = !r._isImport && (r._warnType === 'vehicle_owner_conflict' || r._warnType === 'vehicle_info_diff');
        return isConflict ? <span style={{ color: '#EF4444', fontWeight: 600 }}>{v}</span> : v;
      },
    },
    { title: '车型', dataIndex: '车型', width: 110 },
    { title: '车牌号', dataIndex: '车牌号', width: 100 },
    { title: '款式', dataIndex: '款式', width: 130 },
    { title: '发票日期', dataIndex: '发票日期', width: 110 },
    {
      title: '操作',
      width: 160,
      fixed: 'right',
      onCell: (r: any) => ({
        rowSpan: r._rowSpanCount,
        style: r._isImport ? {} : { display: 'none' },
      }),
      render: (_: any, r: any) => renderActions(r),
    },
  ];

  if (!batchNo) {
    return (
      <div style={{ padding: 24, background: '#fff', minHeight: 'calc(100vh - 120px)', textAlign: 'center', paddingTop: 80 }}>
        <WarningOutlined style={{ fontSize: 48, color: '#94A3B8', marginBottom: 16 }} />
        <div style={{ fontSize: 14, color: '#94A3B8', marginBottom: 24 }}>暂无警告数据</div>
        <Button className="crm-btn crm-btn-primary" onClick={() => navigate('/leads')}>返回线索管理</Button>
      </div>
    );
  }

  return (
    <div className="leads-container">
      <div className="table-card">
        {/* Header: red warning text on left, return button on right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <WarningOutlined style={{ color: '#F59E0B', fontSize: 16 }} />
            <span style={{ color: '#DC2626', fontSize: 14, fontWeight: 500 }}>
              冲突警告：以下数据与现有系统数据存在冲突，请确认处理方案
            </span>
          </div>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/leads')}
            style={{ borderRadius: 6 }}
          >
            返回列表
          </Button>
        </div>

        {/* Table */}
        <Table
          loading={loading}
          dataSource={tableData}
          rowKey="_key"
          size="small"
          scroll={{ x: 1700 }}
          pagination={false}
          columns={columns}
          bordered
          rowClassName={(r: any) => r._isImport ? 'warn-row-import' : 'warn-row-system'}
        />
      </div>

      <style>{`
        .warn-row-system td {
          background: #FAFAFA !important;
          color: #6B7280;
        }
        .warn-row-import td {
          background: #fff !important;
        }
        .ant-table-bordered .ant-table-tbody > tr.warn-row-system > td {
          border-bottom: 2px solid #E5E7EB;
        }
      `}</style>
    </div>
  );
};

export default LeadTemp;
