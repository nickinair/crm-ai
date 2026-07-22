import React, { useState, useEffect } from 'react';
import { Modal, Input, Table } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import request from '../utils/request';

interface EditProductsModalProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  leadId: string;
  initialSelectedIds: string[];
  mode: 'product' | 'gift';
}

const EditProductsModal: React.FC<EditProductsModalProps> = ({ visible, onCancel, onSuccess, leadId, initialSelectedIds, mode }) => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>(initialSelectedIds);

  useEffect(() => {
    if (visible) {
      fetchProducts();
      setSelectedRowKeys(initialSelectedIds);
    }
  }, [visible, initialSelectedIds]);

  const fetchProducts = async () => {
    try {
      const res = await request.get('/product', { params: { productName: searchText, limit: 100 } }) as any;
      if (Array.isArray(res)) {
        setProducts(res);
      } else if (res.items) {
        setProducts(res.items);
      } else {
        setProducts([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (visible) fetchProducts();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchText]);

  const handleOk = async () => {
    setLoading(true);
    try {
      const payload = mode === 'product' 
        ? { intentProducts: selectedRowKeys }
        : { intentGifts: selectedRowKeys };
        
      const res = await request.put(`/lead/${leadId}/products`, payload) as any;
      if (!res.error) {
        onSuccess();
      }
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '商品名称',
      dataIndex: 'productName',
      key: 'productName',
    },
    {
      title: '商品编码',
      dataIndex: 'productModel',
      key: 'productModel',
      render: (text: string) => <span style={{ color: '#8892b0' }}>{text || '-'}</span>
    },
    {
      title: '单价',
      dataIndex: 'salePrice',
      key: 'salePrice',
      render: (price: number) => <span style={{ color: '#6366f1', fontWeight: 600 }}>¥{price}</span>
    }
  ];

  return (
    <Modal
      centered
      title={`编辑意向${mode === 'product' ? '商品' : '赠品'}`}
      open={visible}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      okText="确认添加"
      cancelText="取消"
      width={700}
      className="crm-unified-modal"
    >
      <div style={{ marginBottom: 16 }}>
        <Input 
          prefix={<SearchOutlined />} 
          placeholder="搜索商品名称或编码..." 
          value={searchText}
          onChange={handleSearch}
          style={{ width: '100%', marginBottom: 8 }}
          size="large"
        />
        <div style={{ color: '#6366f1' }}>已选择 {selectedRowKeys.length} 件商品</div>
      </div>
      
      <Table 
        rowSelection={{
          type: 'checkbox',
          selectedRowKeys,
          onChange: (newSelectedRowKeys: React.Key[]) => {
            setSelectedRowKeys(newSelectedRowKeys);
          }
        }}
        columns={columns} 
        dataSource={products}
        rowKey="id"
        pagination={false}
        scroll={{ y: 300 }}
        size="middle"
      />
    </Modal>
  );
};

export default EditProductsModal;
