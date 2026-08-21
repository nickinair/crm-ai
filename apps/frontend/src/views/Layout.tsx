import React, { useState, useEffect } from 'react';
import { Layout, Menu, Dropdown, Avatar } from 'antd';
import { 
  DesktopOutlined, 
  UserOutlined, 
  MessageOutlined,
  FileTextOutlined,
  PhoneOutlined,
  HomeOutlined,
  TeamOutlined,
  ShopOutlined,
  ProfileOutlined,
  SettingOutlined,
  BankOutlined,
  LockOutlined,
  SearchOutlined,
  LogoutOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Input } from 'antd';
import request from '../utils/request';
import ImportTaskFloat from '../components/ImportTaskFloat';
import { hasPerm } from '../utils/perm';
import { IS_TEST_ENV, ENV_LABEL, ENV_LABEL_SHORT } from '../utils/env';
import './Layout.css';

const { Header, Content, Sider } = Layout;

const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : {};
  const roleCode = user.roleCode || '';
  const [userPermissions, setUserPermissions] = useState<string[]>(user.permissions || []);

  // 每次进入应用时拉取实时权限，让角色权限调整后无需重新登录即可生效
  useEffect(() => {
    if (!token) return;
    request.get('/auth/profile').then((res: any) => {
      if (res && Array.isArray(res.permissions)) {
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        stored.permissions = res.permissions;
        localStorage.setItem('user', JSON.stringify(stored));
        setUserPermissions(res.permissions);
      }
    }).catch(() => {});
  }, []);

  // 鉴权守卫：未登录时跳转到登录页
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const allMenuItems = [
    { key: '/home', icon: <HomeOutlined />, label: '首页', permCode: 'dashboard' },
    { key: '/workbench', icon: <DesktopOutlined />, label: '工作台', permCode: 'workbench' },
    { key: '/leads', icon: <TeamOutlined />, label: '线索池管理', permCode: 'lead' },
    { key: '/customer', icon: <UserOutlined />, label: '客户管理', permCode: 'customer' },
    { key: '/product', icon: <ShopOutlined />, label: '商品管理', permCode: 'product' },
    { key: '/order', icon: <ProfileOutlined />, label: '订单管理', permCode: 'order' },
    { 
      key: 'org-group', 
      icon: <BankOutlined />, 
      label: '组织管理',
      permCode: 'organization',
      children: [
        { key: '/org', label: '组织层级管理' },
        { key: '/account', label: '账号管理' }
      ]
    },
    { 
      key: 'permission-group', 
      icon: <LockOutlined />, 
      label: '权限管理',
      permCode: 'permission',
      children: [
        { key: '/role', label: '角色管理' }
      ]
    },
    { key: '/config', icon: <SettingOutlined />, label: '配置管理', permCode: 'config' },
    { key: '/message', icon: <MessageOutlined />, label: '消息中心（敬请期待）', disabled: true, permCode: 'message' },
    { key: '/log', icon: <FileTextOutlined />, label: '日志管理（敬请期待）', disabled: true, permCode: 'log' },
    { key: '/outbound', icon: <PhoneOutlined />, label: '智能外呼管理（敬请期待）', disabled: true, permCode: 'outbound' }
  ];

  const menuItems = allMenuItems
    .filter(item => {
      if (roleCode === 'super_admin' || roleCode === 'super__admin' || roleCode === 'admin') return true;
      return userPermissions.includes(item.permCode);
    })
    .map(item => {
      if (!searchKeyword) return item;
      
      if (item.children) {
        const filteredChildren = item.children.filter(child => child.label.toLowerCase().includes(searchKeyword.toLowerCase()));
        if (filteredChildren.length > 0) {
          return { ...item, children: filteredChildren };
        }
        if (item.label.toLowerCase().includes(searchKeyword.toLowerCase())) return item;
        return null;
      }
      if (item.label.toLowerCase().includes(searchKeyword.toLowerCase())) return item;
      return null;
    })
    .filter(Boolean) as any[];

  const pageTitleMap: Record<string, string> = {
    '/home': '首页',
    '/workbench': '工作台',
    '/leads': '线索池管理',
    '/customer': '客户管理',
    '/product': '商品管理',
    '/order': '订单管理',
    '/config': '配置管理',
    '/org': '组织层级管理',
    '/account': '账号管理',
    '/role': '角色管理',
    '/permission-alloc': '权限分配',
    '/public-pool': '公域池抢单'
  };

  let currentPageTitle = pageTitleMap[location.pathname] || '';
  let displayTitle = '';

  if (currentPageTitle) {
    const searchParams = new URLSearchParams(location.search);
    if (location.pathname === '/customer' && searchParams.get('from') === 'workbench') {
      displayTitle = '我的客户';
    } else {
      displayTitle = currentPageTitle === '首页' ? '首页概览' : currentPageTitle;
    }
  } else {
    if (location.pathname.startsWith('/customer/360')) {
      displayTitle = '线索跟进';
    } else if (location.pathname.startsWith('/customer/detail')) {
      displayTitle = '客户360视图';
    } else if (location.pathname.startsWith('/order/detail')) {
      displayTitle = '订单详情';
    }
  }

  const getBreadcrumbItems = () => {
    const items = [{ label: '首页', path: '/home' }];
    const searchParams = new URLSearchParams(location.search);

    if (location.pathname === '/customer' && searchParams.get('from') === 'workbench') {
      items.push({ label: '工作台', path: '/workbench' });
      items.push({ label: '我的客户', path: `/customer${location.search}` });
      return items;
    }

    if (location.pathname.startsWith('/customer/360')) {
      const parts = location.pathname.split('/');
      const id = parts[parts.length - 1];
      // 从线索池管理点“详情”进入：首页 → 线索池管理 → 线索详情
      if (searchParams.get('from') === 'leads') {
        items.push({ label: '线索池管理', path: '/leads' });
        items.push({ label: '线索详情', path: `/customer/360/${id}${location.search}` });
        return items;
      }
      items.push({ label: '工作台', path: '/workbench' });
      items.push({ label: '线索跟进', path: `/customer/360/${id}${location.search}` });
      return items;
    }

    // 订单详情：首页 → 订单管理 → 订单详情（PRD 配图 image5 面包屑）
    // 销售（无订单管理菜单权限）从工作台进入：父级改为工作台，避免点面包屑落到无权限页（测试反馈）
    if (location.pathname.startsWith('/order/detail')) {
      const parts = location.pathname.split('/');
      const oid = parts[parts.length - 1];
      if (hasPerm('order')) {
        items.push({ label: '订单管理', path: '/order' });
      } else {
        items.push({ label: '工作台', path: '/workbench' });
      }
      items.push({ label: '订单详情', path: `/order/detail/${oid}` });
      return items;
    }

    if (location.pathname.startsWith('/customer/detail')) {
      const parts = location.pathname.split('/');
      const id = parts[parts.length - 1];

      if (searchParams.get('from') === 'customer') {
        items.push({ label: '客户管理', path: '/customer' });
      } else if (searchParams.get('from') === 'workbench_customer') {
        items.push({ label: '工作台', path: '/workbench' });
        items.push({ label: '我的客户', path: '/customer?from=workbench' });
      } else {
        items.push({ label: '工作台', path: '/workbench' });
        const leadIdParam = searchParams.get('leadId');
        if (leadIdParam) {
          items.push({ label: '线索跟进', path: `/customer/360/${id}?leadId=${leadIdParam}` });
        }
      }
      items.push({ label: '客户360视图', path: `/customer/detail/${id}` });
      return items;
    }

    if (location.pathname === '/public-pool') {
      items.push({ label: '工作台', path: '/workbench' });
      items.push({ label: '公域池抢单', path: '/public-pool' });
      return items;
    }

    if (currentPageTitle && currentPageTitle !== '首页') {
      items.push({ label: currentPageTitle, path: location.pathname });
    }
    return items;
  };
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout
    }
  ];


  return (
    <div className="dark-theme-layout">
      <div className="background-spheres">
        <div className="sphere sphere-1"></div>
        <div className="sphere sphere-2"></div>
        <div className="sphere sphere-3"></div>
      </div>
      {IS_TEST_ENV && <div className="env-topbar" />}
      <div className="app-wrapper">
        <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)} className="app-sider" width={260} trigger={null}>
          <div className="logo-vertical" style={{ height: '72px', padding: '0 24px', display: 'flex', alignItems: 'center' }}>
            <div className="logo-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="lightningGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#A855F7" />
                    <stop offset="100%" stopColor="#3B82F6" />
                  </linearGradient>
                </defs>
                <path fill="url(#lightningGradient)" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
              </svg>
            </div>
            {!collapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0 }}>
                {IS_TEST_ENV && <span className="env-badge env-badge-sm">{ENV_LABEL}</span>}
                <span className="logo-text" style={{ margin: 0, whiteSpace: 'nowrap' }}>涌客CRM销售系统</span>
              </div>
            )}
            {IS_TEST_ENV && collapsed && <span className="env-badge env-badge-sm" style={{ marginLeft: 2 }}>{ENV_LABEL_SHORT}</span>}
          </div>
          <div style={{ height: '56px', padding: '0 16px', display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <Input 
              prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.45)' }} />} 
              placeholder="搜索菜单..." 
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '8px', padding: '8px 12px' }} 
              className="sidebar-search-input"
            />
          </div>
          <Menu 
            theme="dark" 
            defaultOpenKeys={searchKeyword ? ['org-group', 'permission-group'] : []}
            selectedKeys={[
              location.pathname.startsWith('/customer/360') ? '/leads' :
              location.pathname.startsWith('/customer/detail') ? '/customer' :
              location.pathname
            ]} 
            mode="inline" 
            items={menuItems} 
            onClick={({ key }) => navigate(key)}
            className="app-menu"
          />
        </Sider>
        
        <Layout className="site-layout">
          <Header className="app-header" style={{ display: 'block', padding: 0, height: 'auto', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '72px', padding: '0 40px' }}>
              <div className="breadcrumb" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {getBreadcrumbItems().map((item, idx, arr) => (
                  <span key={item.path + idx}>
                    {idx > 0 && <span style={{ margin: '0 8px', color: '#475569' }}>/</span>}
                    {idx === arr.length - 1 ? (
                      <span style={{ color: '#F8FAFC', fontWeight: 600 }}>{item.label}</span>
                    ) : (
                      <a 
                        onClick={() => navigate(item.path)} 
                        style={{ color: 'var(--text-secondary)', cursor: 'pointer', transition: 'color 0.2s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#F8FAFC')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                      >
                        {item.label}
                      </a>
                    )}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {IS_TEST_ENV && <span className="env-badge">当前为{ENV_LABEL}，数据与生产环境隔离</span>}
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click', 'hover']}>
                <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 16px 6px 6px', borderRadius: '30px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Avatar size={34} style={{ background: 'linear-gradient(135deg, #A855F7, #3B82F6)', color: '#fff', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(user.realName || user.username || '超').charAt(0)}
                  </Avatar>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: '#f8fafc', letterSpacing: '1px' }}>{user.realName || user.username || '超级管理员'}</span>
                </div>
              </Dropdown>
              </div>
            </div>
            <div style={{ height: '56px', padding: '0 40px', display: 'flex', alignItems: 'center' }}>
              <h2 className="page-title-display" style={{ margin: 0 }}>{displayTitle}</h2>
            </div>
          </Header>
          
          <Content className="app-content-wrapper">
            <div className="app-content">
              <Outlet />
            </div>
          </Content>
        </Layout>
      </div>
      <ImportTaskFloat />
    </div>
  );
};

export default AppLayout;
