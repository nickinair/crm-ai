import React from 'react';

const Home: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '24px' }}>
      <div className="home-welcome-card" style={{
        background: 'rgba(30, 41, 59, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '60px 40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        marginTop: '20px',
        minHeight: '400px'
      }}>
        <div className="welcome-icon-box" style={{
          width: '72px',
          height: '72px',
          background: 'rgba(99, 102, 241, 0.1)',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          color: '#818CF8'
        }}>
          <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
          </svg>
        </div>
        <h2 style={{ color: '#F8FAFC', fontSize: '28px', fontWeight: 600, marginBottom: '16px' }}>
          欢迎进入涌客CRM销售系统！
        </h2>
        <p style={{ color: '#94A3B8', fontSize: '15px', textAlign: 'center', maxWidth: '500px', lineHeight: '1.6' }}>
          未来这里将呈现不同维度的数据板块！我们致力于为您提供最专业、最高效的客户关系管理体验。
        </p>
      </div>
    </div>
  );
};

export default Home;
