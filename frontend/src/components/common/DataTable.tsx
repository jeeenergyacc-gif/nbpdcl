import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { downloadCsv } from '@/utils/csvExport';

interface DataTableProps {
  rows: any[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  columns?: string[];
  exportFilename?: string;
}

export default function DataTable({ rows, total, page, pageSize, onPageChange, loading, columns, exportFilename }: DataTableProps) {
  const cols = columns || (rows?.[0] ? Object.keys(rows[0]) : []);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = parseFloat(av);
      const bn = parseFloat(bv);
      let cmp: number;
      if (!isNaN(an) && !isNaN(bn)) {
        cmp = an - bn;
      } else {
        cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const handleSort = (col: string) => {
    if (sortKey === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col);
      setSortDir('asc');
    }
  };

  if (loading) {
    return <div className="skeleton h-64 w-full" />;
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={() => downloadCsv(exportFilename || 'export.csv', sortedRows)}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/5 rounded-lg px-3 py-1.5 transition"
        >
          <Download size={13} />
          Export CSV (this page)
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-border text-left text-textsecondary">
              {cols.map((c) => (
                <th
                  key={c}
                  onClick={() => handleSort(c)}
                  className="py-2 pr-4 font-semibold whitespace-nowrap cursor-pointer select-none hover:text-primary"
                >
                  <span className="inline-flex items-center gap-1">
                    {c.replace(/_/g, ' ')}
                    {sortKey === c ? (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} className="opacity-30" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, i) => (
              <tr key={i} className="border-b border-border/60 hover:bg-bgapp">
                {cols.map((c) => (
                  <td key={c} className="py-2 pr-4 whitespace-nowrap">{String(row[c] ?? '—')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-textsecondary">
        <span>
          Showing {rows.length ? (page - 1) * pageSize + 1 : 0}–{(page - 1) * pageSize + rows.length} of {total.toLocaleString('en-IN')} records
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-bgapp"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-medium">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-bgapp"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
