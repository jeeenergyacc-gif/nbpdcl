import { useMemo } from 'react';

export interface CalendarPoint {
  /** ISO date, YYYY-MM-DD */
  date: string;
  value: number;
}

interface DeviationCalendarProps {
  points: CalendarPoint[];
  /** Month to render, as YYYY-MM. Defaults to the month of the first point. */
  month?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Deviation bands. Positive is good (over-schedule); the more negative, the worse. */
const BANDS = [
  { test: (v: number) => v > 0, bg: '#DCFCE7', border: '#86EFAC', text: '#166534', swatch: '#22C55E', label: '> 0 (Positive)' },
  { test: (v: number) => v <= 0 && v > -2, bg: '#FEF9C3', border: '#FDE68A', text: '#854D0E', swatch: '#FACC15', label: '-2 to 0 (Low)' },
  { test: (v: number) => v <= -2 && v > -4, bg: '#FFEDD5', border: '#FDBA74', text: '#9A3412', swatch: '#FB923C', label: '-4 to -2 (Medium)' },
  { test: (v: number) => v <= -4, bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B', swatch: '#EF4444', label: '<= -4 (High)' },
];
const bandOf = (v: number) => BANDS.find((b) => b.test(v)) ?? BANDS[1];

/**
 * A real monthly calendar (Sun→Sat), aligned to the actual weekday the month
 * starts on. Each cell prints the date number and that day's deviation, so no
 * value needs a hover to be read. Days outside the month are shown greyed, which
 * is what makes the week alignment legible.
 */
export default function DeviationCalendar({ points, month }: DeviationCalendarProps) {
  const { year, monthIdx, cells } = useMemo(() => {
    const byDate = new Map(points.map((p) => [p.date.slice(0, 10), p.value]));
    const anchor = month || points[0]?.date?.slice(0, 7);
    if (!anchor) return { year: 0, monthIdx: 0, cells: [] as any[] };

    const y = parseInt(anchor.slice(0, 4), 10);
    const m = parseInt(anchor.slice(5, 7), 10) - 1;

    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startDow = first.getDay(); // 0 = Sunday
    const prevMonthDays = new Date(y, m, 0).getDate();

    const out: { day: number; inMonth: boolean; value?: number }[] = [];
    // leading days from the previous month, so the first row lines up correctly
    for (let i = startDow - 1; i >= 0; i--) out.push({ day: prevMonthDays - i, inMonth: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ day: d, inMonth: true, value: byDate.get(key) });
    }
    // trailing days to complete the final week
    let trail = 1;
    while (out.length % 7 !== 0) out.push({ day: trail++, inMonth: false });

    return { year: y, monthIdx: m, cells: out };
  }, [points, month]);

  if (!cells.length) {
    return <div className="flex items-center justify-center h-full text-sm text-textsecondary">No data available</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="text-[11px] font-bold text-textprimary uppercase tracking-wide mb-2">
        {MONTHS[monthIdx]} {year}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[11px] font-semibold text-textsecondary text-center pb-0.5">{d}</div>
        ))}

        {cells.map((c, i) => {
          if (!c.inMonth) {
            return (
              <div key={i} className="rounded-lg border border-transparent px-1 py-1.5 text-center">
                <div className="text-[11px] text-slate-300">{c.day}</div>
              </div>
            );
          }
          if (c.value === undefined) {
            return (
              <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-1 py-1.5 text-center">
                <div className="text-[11px] font-semibold text-slate-400">{c.day}</div>
                <div className="text-[10px] text-slate-300">—</div>
              </div>
            );
          }
          const b = bandOf(c.value);
          return (
            <div
              key={i}
              className="rounded-lg px-1 py-1.5 text-center transition hover:brightness-95"
              style={{ background: b.bg, border: `1px solid ${b.border}` }}
              title={`${c.day} ${MONTHS[monthIdx]} ${year}: ${c.value.toFixed(1)} MU`}
            >
              <div className="text-[11px] font-bold" style={{ color: b.text }}>{String(c.day).padStart(2, '0')}</div>
              <div className="text-[11px] font-semibold tabular-nums" style={{ color: b.text }}>
                {c.value.toFixed(1)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 pt-2.5 border-t border-border">
        {BANDS.map((b) => (
          <div key={b.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: b.swatch }} />
            <span className="text-[11px] text-textsecondary">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
