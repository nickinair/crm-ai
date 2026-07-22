import React from 'react';
import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';

const NoPermission: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: 'calc(100vh - 200px)',
    }}>
      <Result
        status="403"
        title={<span style={{ color: '#ffffff' }}>权限不足</span>}
        subTitle={<span style={{ color: 'rgba(255, 255, 255, 0.75)' }}>抱歉，您没有权限访问该页面。请联系管理员分配相应权限。</span>}
        extra={
          <Button type="primary" onClick={() => navigate('/workbench')}>
            返回工作台
          </Button>
        }
      />
    </div>
  );
};

export default NoPermission;
