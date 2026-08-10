import React, { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { IS_TEST_ENV, ENV_LABEL } from '../utils/env';
import './Login.css';

import request from '../utils/request';

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const res: any = await request.post('/auth/login', values);
      if (res && res.access_token) {
        localStorage.setItem('token', res.access_token);
        localStorage.setItem('user', JSON.stringify(res.user));
        message.success('登录成功，欢迎使用！');
        // 按权限挑选第一个可访问的页面作为落地页
        const roleCode = res.user.roleCode || '';
        const perms: string[] = res.user.permissions || [];
        const isAdmin = roleCode === 'super_admin' || roleCode === 'super__admin' || roleCode === 'admin';
        const landingByPerm: [string, string][] = [
          ['dashboard', '/home'],
          ['workbench', '/workbench'],
          ['lead', '/leads'],
          ['customer', '/customer'],
          ['product', '/product'],
          ['organization', '/org'],
          ['permission', '/role'],
        ];
        const landing = isAdmin ? '/' : (landingByPerm.find(([p]) => perms.includes(p))?.[1] || '/workbench');
        navigate(landing);
      }
    } catch (error) {
      // 错误已经在 request 拦截器中通过 message.error 提示了，这里无需重复，或者需要特定处理可以在这加
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-icon-wrapper">
          <div className="login-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill="white" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
          </div>
        </div>
        <div className="login-header">
          <h2>涌客CRM销售系统</h2>
          {IS_TEST_ENV && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <span className="env-badge">{ENV_LABEL}</span>
            </div>
          )}
          <p>欢迎回来，请登录您的账号</p>
        </div>
        
        <Form name="login" onFinish={onFinish} size="large" className="login-form">
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入账号！' }]}
          >
            <Input prefix={<UserOutlined style={{color: '#888'}}/>} placeholder="请输入账号" className="dark-input" />
          </Form.Item>
          
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码！' }]}
          >
            <Input.Password prefix={<LockOutlined style={{color: '#888'}}/>} placeholder="请输入密码" className="dark-input" />
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block className="login-btn">
              安全登录 -&gt;
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
};

export default Login;
