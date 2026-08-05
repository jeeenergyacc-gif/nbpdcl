import { Search, RotateCcw } from 'lucide-react';
import { fyLabel, FY_QUARTER_LABEL } from '@/components/filters/FilterPrimitives';

export interface PurchaseFilters {
  year: string; quarter: string; month: string;
  plant_type: string; plant_name: string; voltage_level: string;
  ppa_category: string; ppa_type: string; search: string; discom: string;
}

interface FilterOptions {
  years: string[]; quarters: string[]; plant_types: string[]; plant_names: string[];
  voltage_levels: string[]; ppa_categories: string[]; ppa_types: string[]; discoms?: string[];
}

interface Props {
  filters: PurchaseFilters;
  options?: FilterOptions;
  onChange: (key: keyof PurchaseFilters, value: string) => void;
  onReset: () => void;
}

const MONTHS = [
  ['01', 'Jan'], ['02', 'Feb'], ['03', 'Mar'], ['04', 'Apr'], ['05', 'May'], ['06', 'Jun'],
  ['07', 'Jul'], ['08', 'Aug'], ['09', 'Sep'], ['10', 'Oct'], ['11', 'Nov'], ['12', 'Dec'],
];

function Select({ value, onChange, options, placeholder, labelFor }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string; labelFor?: (v: string) => string }) {
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

export default function FilterBar({ filters, options, onChange, onReset }: Props) {
  return (
    <div className="card p-3 flex flex-wrap items-center gap-2">
      <Select value={filters.discom || 'BSPHCL'} onChange={(v) => onChange('discom', v)} options={options?.discoms || ['BSPHCL', 'NBPDCL', 'SBPDCL']} placeholder="DISCOM" />
      <Select value={filters.year} onChange={(v) => onChange('year', v)} options={options?.years || []} placeholder="Year" labelFor={fyLabel} />
      <Select value={filters.quarter} onChange={(v) => onChange('quarter', v)} options={options?.quarters || []} placeholder="Quarter" labelFor={(q) => FY_QUARTER_LABEL[q] || q} />
      <select
        value={filters.month}
        onChange={(e) => onChange('month', e.target.value)}
        className="text-xs font-medium border border-border rounded-lg px-2.5 py-2 bg-white text-textprimary outline-none focus:border-primary min-w-[100px]"
      >
        <option value="">Month</option>
        {MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <Select value={filters.plant_type} onChange={(v) => onChange('plant_type', v)} options={options?.plant_types || []} placeholder="Plant Type" />
      <Select value={filters.plant_name} onChange={(v) => onChange('plant_name', v)} options={options?.plant_names || []} placeholder="Plant Name" />
      <Select value={filters.voltage_level} onChange={(v) => onChange('voltage_level', v)} options={options?.voltage_levels || []} placeholder="Voltage Level" />
      <Select value={filters.ppa_category} onChange={(v) => onChange('ppa_category', v)} options={options?.ppa_categories || []} placeholder="PPA Category" />
      <Select value={filters.ppa_type} onChange={(v) => onChange('ppa_type', v)} options={options?.ppa_types || []} placeholder="PPA Type" />

      <div className="relative flex-1 min-w-[160px]">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textsecondary" />
        <input
          value={filters.search}
          onChange={(e) => onChange('search', e.target.value)}
          placeholder="Search plant..."
          className="w-full pl-8 pr-3 py-2 text-xs border border-border rounded-lg outline-none focus:border-primary"
        />
      </div>

      <button
        onClick={onReset}
        className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/5 rounded-lg px-3 py-2 transition"
      >
        <RotateCcw size={13} />
        Reset
      </button>
    </div>
  );
}
