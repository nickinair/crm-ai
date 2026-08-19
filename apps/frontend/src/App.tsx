import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './views/Login';
import Layout from './views/Layout';
import Home from './views/Home';
import Workbench from './views/Workbench';
import Leads from './views/Leads';
import LeadTemp from './views/LeadTemp';
import Customer from './views/Customer';
import Customer360 from './views/Customer360';
import CustomerDetail from './views/CustomerDetail';
import Org from './views/Org';
import Account from './views/Account';
import Product from './views/Product';
import Order from './views/Order';
import OrderDetail from './views/OrderDetail';
import Config from './views/Config';
import Role from './views/Role';
import PublicPool from './views/PublicPool';
import PermissionRoute from './components/PermissionRoute';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={
            <PermissionRoute permCode="dashboard"><Home /></PermissionRoute>
          } />
          <Route path="workbench" element={
            <PermissionRoute permCode="workbench"><Workbench /></PermissionRoute>
          } />
          <Route path="leads" element={
            <PermissionRoute permCode="lead"><Leads /></PermissionRoute>
          } />
          <Route path="public-pool" element={
            <PermissionRoute permCode="lead,workbench"><PublicPool /></PermissionRoute>
          } />
          <Route path="lead-temp" element={
            <PermissionRoute permCode="lead"><LeadTemp /></PermissionRoute>
          } />
          <Route path="lead-temp/:batchNo" element={
            <PermissionRoute permCode="lead"><LeadTemp /></PermissionRoute>
          } />
          <Route path="customer" element={
            <PermissionRoute permCode="customer,workbench"><Customer /></PermissionRoute>
          } />
          <Route path="customer/360/:id" element={
            <PermissionRoute permCode="customer,workbench"><Customer360 /></PermissionRoute>
          } />
          <Route path="customer/detail/:id" element={
            <PermissionRoute permCode="customer,workbench"><CustomerDetail /></PermissionRoute>
          } />
          <Route path="org" element={
            <PermissionRoute permCode="organization"><Org /></PermissionRoute>
          } />
          <Route path="account" element={
            <PermissionRoute permCode="organization"><Account /></PermissionRoute>
          } />
          <Route path="product" element={
            <PermissionRoute permCode="product"><Product /></PermissionRoute>
          } />
          <Route path="order" element={
            <PermissionRoute permCode="order"><Order /></PermissionRoute>
          } />
          <Route path="order/detail/:id" element={
            <PermissionRoute permCode="order,workbench"><OrderDetail /></PermissionRoute>
          } />
          <Route path="config" element={
            <PermissionRoute permCode="config"><Config /></PermissionRoute>
          } />
          <Route path="role" element={
            <PermissionRoute permCode="permission"><Role /></PermissionRoute>
          } />
          <Route path="*" element={
            <div style={{ padding: '50px', textAlign: 'center', color: '#fff' }}>
              <h2>404 - 页面不存在或已更新</h2>
              <p>您访问的链接可能已失效或被替换。</p>
              <Navigate to="/workbench" replace />
            </div>
          } />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
