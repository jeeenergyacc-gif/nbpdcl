import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

import LoginPage from '@/pages/LoginPage';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/routes/ProtectedRoute';
import PowerPurchaseDashboard from '@/pages/dashboard/PowerPurchaseDashboard';
import DeviationDashboard from '@/pages/dashboard/DeviationDashboard';
import InputEnergyDashboard from '@/pages/dashboard/InputEnergyDashboard';
import RailwayDashboard from '@/pages/dashboard/RailwayDashboard';
import ProsumerDashboard from '@/pages/dashboard/ProsumerDashboard';
import TransmissionLossDashboard from '@/pages/dashboard/TransmissionLossDashboard';
import ReportsPage from '@/pages/dashboard/ReportsPage';
import SettingsPage from '@/pages/dashboard/SettingsPage';
import { useAuthStore } from '@/store/authStore';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => { hydrate(); }, [hydrate]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="purchase" replace />} />
            <Route path="purchase" element={<PowerPurchaseDashboard />} />
            <Route path="deviation" element={<DeviationDashboard />} />
            <Route path="input-energy" element={<InputEnergyDashboard />} />
            <Route path="railway" element={<RailwayDashboard />} />
            <Route path="prosumer" element={<ProsumerDashboard />} />
            <Route path="transmission-loss" element={<TransmissionLossDashboard />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard/purchase" replace />} />
          <Route path="*" element={<Navigate to="/dashboard/purchase" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
