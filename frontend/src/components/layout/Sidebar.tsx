import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Zap, GitBranch, Activity, TrainFront, Users, FileBarChart, Settings, LogOut, Waypoints,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const NAV_ITEMS = [
  { to: '/dashboard/purchase', label: 'Power Purchase', icon: Zap },
  { to: '/dashboard/deviation', label: 'Bihar UI Deviation', icon: GitBranch },
  { to: '/dashboard/input-energy', label: 'Input Energy', icon: Activity },
  { to: '/dashboard/railway', label: 'Railway Power', icon: TrainFront },
  { to: '/dashboard/prosumer', label: 'Prosumer Sales', icon: Users },
  { to: '/dashboard/transmission-loss', label: 'Transmission Losses', icon: Waypoints },
  { to: '/dashboard/reports', label: 'Reports', icon: FileBarChart },
];

export default function Sidebar() {
  const { username, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`${collapsed ? 'w-[68px]' : 'w-64'} shrink-0 bg-bgdark text-white flex flex-col h-screen sticky top-0 transition-[width] duration-200`}
    >
      {/* Brand + collapse toggle. When collapsed: icons only, no extra labels. */}
      <div className={`h-[72px] flex items-center border-b border-white/10 ${collapsed ? 'justify-center px-2' : 'gap-3 px-5'}`}>
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <Zap size={20} className="text-white" />
        </div>
        {!collapsed && (
          <>
            <div className="leading-tight">
              <div className="font-bold text-sm">NBPDCL</div>
              <div className="text-[10px] text-slate-400">Energy Accounting</div>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="ml-auto p-2 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition"
            >
              <PanelLeftClose size={17} />
            </button>
          </>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          className="mx-auto mt-3 p-2 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition"
        >
          <PanelLeftOpen size={17} />
        </button>
      )}

      <nav className={`flex-1 overflow-y-auto py-4 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-lg text-sm font-medium transition ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                isActive
                  ? 'bg-primary text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon size={17} className="shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      <div className={`pb-4 space-y-1 border-t border-white/10 pt-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        <NavLink
          to="/dashboard/settings"
          title={collapsed ? 'Settings' : undefined}
          className={`flex items-center rounded-lg text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition ${
            collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
          }`}
        >
          <Settings size={17} className="shrink-0" />
          {!collapsed && 'Settings'}
        </NavLink>

        {collapsed ? (
          <button
            onClick={logout}
            title="Logout"
            aria-label="Logout"
            className="w-full flex justify-center py-2.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-danger transition"
          >
            <LogOut size={16} />
          </button>
        ) : (
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="text-xs">
              <div className="text-slate-400">Signed in as</div>
              <div className="font-semibold text-white">{username || 'admin'}</div>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="p-2 rounded-lg hover:bg-white/10 text-slate-300 hover:text-danger transition"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
