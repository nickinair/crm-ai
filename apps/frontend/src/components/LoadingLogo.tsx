import React from 'react';
import LightningLoading from './LightningLoading';

interface LoadingLogoProps {
  text?: string;
  style?: React.CSSProperties;
}

/**
 * 全屏 loading 容器，内部复用统一的 LightningLoading 闪电 Logo
 */
const LoadingLogo: React.FC<LoadingLogoProps> = ({ text = '加载中...', style }) => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        height: '100vh',
        paddingTop: '28vh',
        ...style,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}>
        <LightningLoading />
        {text && (
          <div
            style={{
              color: 'rgba(255, 255, 255, 0.4)',
              fontSize: '13px',
              letterSpacing: '2px',
              animation: 'crm-text-fade 2.5s ease-in-out infinite',
            }}
          >
            {text}
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingLogo;
