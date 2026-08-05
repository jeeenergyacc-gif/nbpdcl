import { Outlet } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';

export default function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-bgapp">
      <Sidebar />
      <Outlet />
    </div>
  );
}
