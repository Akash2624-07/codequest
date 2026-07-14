import { NavLink, Outlet } from 'react-router';
import { PlusCircle, Users, ListChecks } from 'lucide-react';

const TABS = [
  { to: '/admin/create', label: 'Create Problem', icon: PlusCircle },
  { to: '/admin/problems', label: 'Problems', icon: ListChecks },
  { to: '/admin/users', label: 'Users', icon: Users },
];

function AdminLayout() {
  return (
    <div>
      <div className="tabs tabs-border px-6 pt-4 border-b border-base-200">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `tab gap-2 ${isActive ? 'tab-active' : ''}`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}

export default AdminLayout;
