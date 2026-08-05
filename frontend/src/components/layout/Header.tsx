import { Calendar, RefreshCw, Bell } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  dataMonth?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function Header({ title, subtitle, dataMonth, onRefresh, isRefreshing }: HeaderProps) {
  return (
    <header className="h-[72px] sticky top-0 z-20 bg-white border-b border-border flex items-center justify-between px-6">
      <div>
        <h1 className="text-lg font-bold text-textprimary leading-tight">{title}</h1>
        {subtitle && <p className="text-xs text-textsecondary">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {dataMonth && (
          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-textsecondary bg-bgapp border border-border rounded-lg px-3 py-2">
            <Calendar size={14} />
            Data Month: {dataMonth}
          </div>
        )}
        <button
          onClick={onRefresh}
          className="p-2 rounded-lg border border-border hover:bg-bgapp transition text-textsecondary"
          title="Refresh data"
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
        <button className="p-2 rounded-lg border border-border hover:bg-bgapp transition text-textsecondary relative">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-danger" />
        </button>
      </div>
    </header>
  );
}
