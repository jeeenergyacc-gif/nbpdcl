import { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  loading?: boolean;
  height?: number;
}

export default function ChartCard({ title, children, className = '', loading, height = 320 }: ChartCardProps) {
  return (
    <div className={`card p-4 flex flex-col overflow-hidden ${className}`}>
      <div className="text-xs font-bold text-textprimary uppercase tracking-wide mb-2">{title}</div>
      {loading ? (
        <div className="skeleton" style={{ height }} />
      ) : (
        /* A FIXED height (not minHeight): a Plotly chart sized `height: 100%`
           resolves against its parent, and an auto-height parent made Plotly fall
           back to its 450px default and spill out of the card. */
        <div style={{ height }} className="w-full">
          {children}
        </div>
      )}
    </div>
  );
}
