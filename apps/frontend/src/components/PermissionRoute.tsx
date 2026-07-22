import React from 'react';
import NoPermission from '../views/NoPermission';

interface PermissionRouteProps {
  permCode: string; // can be comma separated, e.g. 'lead,workbench'
  children: React.ReactNode;
}

const PermissionRoute: React.FC<PermissionRouteProps> = ({ permCode, children }) => {
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : {};
  const roleCode = user.roleCode || '';
  const permissions: string[] = user.permissions || [];

  // super_admin and admin have full access
  if (roleCode === 'super_admin' || roleCode === 'super__admin' || roleCode === 'admin') {
    return <>{children}</>;
  }

  // Check if user has at least one of the required permissions
  const requiredPerms = permCode.split(',').map(p => p.trim());
  const hasPerm = requiredPerms.some(p => permissions.includes(p));

  if (hasPerm) {
    return <>{children}</>;
  }

  // No permission → show 403 page
  return <NoPermission />;
};

export default PermissionRoute;
