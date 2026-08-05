import Header from '@/components/layout/Header';
import { useAuthStore } from '@/store/authStore';

export default function SettingsPage() {
  const { username } = useAuthStore();
  return (
    <div className="flex-1 min-w-0">
      <Header title="Settings" subtitle="Account and application preferences" />
      <div className="p-6 max-w-lg">
        <div className="card p-5 space-y-4">
          <div>
            <div className="text-xs font-semibold text-textsecondary mb-1">Signed in as</div>
            <div className="text-sm font-semibold text-textprimary">{username}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-textsecondary mb-1">Data Refresh Interval</div>
            <div className="text-sm text-textprimary">60 seconds (auto)</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-textsecondary mb-1">Data Source</div>
            <div className="text-sm text-textprimary">Google Sheets via Apps Script (live)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
