import { Search, RotateCcw } from 'lucide-react';

export function FilterSelect({ value, onChange, options, placeholder, labelFor }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string; labelFor?: (v: string) => string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs font-medium border border-border rounded-lg px-2.5 py-2 bg-white text-textprimary outline-none focus:border-primary min-w-[110px]"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>{labelFor ? labelFor(o) : o}</option>
      ))}
    </select>
  );
}

// Indian financial year helpers — a "year" value of "2026" means FY 2026-27
// (April 2026 → March 2027). The backend filters on this basis; these only
// control how the option is displayed.
export const fyLabel = (startYear: string) => {
  const y = parseInt(startYear, 10);
  return isNaN(y) ? startYear : `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};
export const FY_QUARTER_LABEL: Record<string, string> = {
  Q1: 'Q1 (Apr-Jun)', Q2: 'Q2 (Jul-Sep)', Q3: 'Q3 (Oct-Dec)', Q4: 'Q4 (Jan-Mar)',
};

export function FilterSearch({ value, onChange, placeholder = 'Search...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative flex-1 min-w-[160px]">
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textsecondary" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-3 py-2 text-xs border border-border rounded-lg outline-none focus:border-primary"
      />
    </div>
  );
}

export function FilterResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      onClick={onReset}
      className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/5 rounded-lg px-3 py-2 transition"
    >
      <RotateCcw size={13} />
      Reset
    </button>
  );
}

export const MONTHS: [string, string][] = [
  ['01', 'Jan'], ['02', 'Feb'], ['03', 'Mar'], ['04', 'Apr'], ['05', 'May'], ['06', 'Jun'],
  ['07', 'Jul'], ['08', 'Aug'], ['09', 'Sep'], ['10', 'Oct'], ['11', 'Nov'], ['12', 'Dec'],
];

export function MonthSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs font-medium border border-border rounded-lg px-2.5 py-2 bg-white text-textprimary outline-none focus:border-primary min-w-[100px]"
    >
      <option value="">Month</option>
      {MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
