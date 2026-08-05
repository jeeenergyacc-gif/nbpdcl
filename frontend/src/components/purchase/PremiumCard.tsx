import { ReactNode } from 'react';
import { NAVY_CARD, NAVY_ACCENT, GOLD, TEXT_MUTED } from './theme';

interface PremiumCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  height: number;
  loading?: boolean;
}

/**
 * Fixed-composition card shell for the premium procurement dashboard.
 * Height is always explicit (no flex-grow auto-sizing) so the chart beneath
 * it never has to guess its own container size.
 */
export default function PremiumCard({ title, subtitle, children, height, loading }: PremiumCardProps) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${NAVY_CARD} 0%, ${NAVY_ACCENT} 100%)`,
        border: '1px solid rgba(242,179,61,0.18)',
        boxShadow: '0 8px 24px rgba(0,6,20,0.45)',
      }}
    >
      <div className="px-5 pt-4 pb-2 flex items-baseline justify-between">
        <h3
          className="text-[13px] font-bold uppercase tracking-wider"
          style={{ color: GOLD }}
        >
          {title}
        </h3>
        {subtitle && (
          <span className="text-[11px]" style={{ color: TEXT_MUTED }}>
            {subtitle}
          </span>
        )}
      </div>
      <div style={{ height, width: '100%' }} className="px-2 pb-3 relative">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center" style={{ color: TEXT_MUTED }}>
            <span className="text-xs">Loading…</span>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
