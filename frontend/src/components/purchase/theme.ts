/**
 * Fixed design tokens for the Power Procurement premium dashboard.
 * These are intentionally hardcoded (not derived from Tailwind's light theme)
 * because this section of the app uses its own dark enterprise visual language.
 * DO NOT wire these to automatic/responsive chart behaviour — layout is fixed.
 */

export const NAVY_DEEPEST = '#00112C';
export const NAVY_CARD = '#001B48';
export const NAVY_ACCENT = '#002C74';
export const GOLD = '#F2B33D';
export const GOLD_SOFT = '#F7D488';
export const TEXT_MUTED = '#8FA3C7';

// Fixed visual order — never re-sort this dynamically (audit rule: visual order
// must never change based on value).
// NOTE: "Sugar" appended after Biomass — it is a real plant_type present in
// Plant_Purchase_Master (co-gen sugar mills) and was previously falling through
// to the grey "Unknown" bucket. Order stays fixed; only extended, never sorted.
export const PLANT_TYPE_ORDER = ['Thermal', 'Solar', 'Wind', 'Hydro', 'Biomass', 'Sugar'];

export const PLANT_TYPE_COLORS: Record<string, string> = {
  Thermal: '#E85D3C',
  Solar: '#F2B33D',
  Wind: '#3DB4F2',
  Hydro: '#2E9E6C',
  Biomass: '#8B5CF6',
  Sugar: '#D9A441', // warm amber — distinct from Solar gold, keeps renewable-ish family
  Unknown: '#5B7BA6',
};

export function plantColor(name: string): string {
  return PLANT_TYPE_COLORS[name] || PLANT_TYPE_COLORS.Unknown;
}

/** Sorts a list of {plant_type,...} rows into the fixed canonical order,
 *  with any unrecognized categories appended (stable) at the end. */
export function sortByFixedPlantOrder<T extends { plant_type?: string }>(rows: T[]): T[] {
  const rank = (t?: string) => {
    const i = PLANT_TYPE_ORDER.findIndex((p) => p.toLowerCase() === (t || '').toLowerCase());
    return i === -1 ? PLANT_TYPE_ORDER.length : i;
  };
  return [...rows].sort((a, b) => rank(a.plant_type) - rank(b.plant_type));
}

export const CHART_FONT = "'Inter', system-ui, -apple-system, sans-serif";
