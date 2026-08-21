import { useState } from 'react';
import { Table, Button } from 'antd';

export const CustomPaginationTable = (props: any) => {
  const { dataSource, pagination, ...rest } = props;
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize] = useState(pagination?.defaultPageSize || 10);

  const isRemote = !!pagination?.onChange;
  const current = isRemote ? pagination.current : internalPage;
  const pageSize = isRemote ? pagination.pageSize : internalPageSize;
  const total = isRemote ? pagination.total : (dataSource?.length || 0);
  const totalPages = Math.ceil(total / pageSize) || 1;

  const currentData = isRemote ? dataSource : (dataSource || []).slice((current - 1) * pageSize, current * pageSize);

  const handlePrev = () => {
    const newPage = Math.max(1, current - 1);
    if (isRemote) pagination.onChange(newPage, pageSize);
    else setInternalPage(newPage);
  };

  const handleNext = () => {
    const newPage = Math.min(totalPages, current + 1);
    if (isRemote) pagination.onChange(newPage, pageSize);
    else setInternalPage(newPage);
  };

  return (
    <div className="custom-pagination-table-wrapper">
      <Table 
        {...rest}
        dataSource={currentData}
        pagination={false}
      />
      {total > 0 && (
        <div className="custom-pagination-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', background: 'transparent' }}>
          <div style={{ color: 'var(--text-secondary, #8c8c8c)', fontSize: '14px' }}>
            共 {total} 条记录，每页 {pageSize} 条
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Button disabled={current === 1} onClick={handlePrev} size="small">上一页</Button>
            <span style={{ color: 'var(--text-main, #333)', fontSize: '14px' }}>{current} / {totalPages}</span>
            <Button disabled={current === totalPages} onClick={handleNext} size="small">下一页</Button>
          </div>
        </div>
      )}
    </div>
  );
};
