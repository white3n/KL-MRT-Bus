import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TransitMode } from '../types/transit';
import { getClientMalaysiaClock } from '../utils/transitHelpers';

interface TopBarProps {
  mode: TransitMode;
  onModeChange: (mode: TransitMode) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  nextRefreshInSec: number;
}

export function TopBar({
  mode,
  onModeChange,
  onRefresh,
  isRefreshing,
  nextRefreshInSec,
}: TopBarProps) {
  const [clock, setClock] = useState(getClientMalaysiaClock);

  useEffect(() => {
    const id = setInterval(() => {
      setClock(getClientMalaysiaClock());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const navItems: { id: TransitMode; label: string }[] = [
    { id: 'rail', label: 'Đường sắt · Rail' },
    { id: 'bus', label: 'Xe Bus GPS' },
    { id: 'all', label: 'Tất cả' },
  ];

  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between gap-4 md:gap-8 z-30">
      {/* Zone 1: Single-line brand wordmark */}
      <button
        type="button"
        onClick={() => onModeChange('rail')}
        className="font-display text-base md:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded"
      >
        KL Transit Live
      </button>

      {/* Zone 2: Clean single-line navigation links */}
      <nav
        aria-label="Chế độ xem giao thông"
        className="flex items-center gap-4 md:gap-7 h-full overflow-x-auto no-scrollbar"
      >
        {navItems.map((item) => {
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onModeChange(item.id)}
              className={`relative h-full flex items-center text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                active ? 'text-slate-950 font-semibold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {item.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Live MYT Clock + 1 primary action with 5s auto-refresh counter */}
      <div className="flex items-center gap-4 shrink-0">
        <div
          className="hidden sm:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap"
          title="Giờ địa phương Kuala Lumpur, Malaysia (UTC+8)"
        >
          <span className="font-mono font-semibold text-slate-900 tabular-nums text-sm">
            {clock.time}
          </span>
          <span aria-hidden="true">·</span>
          <span>MYT ({clock.dayLabelVi})</span>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Tự động làm mới dữ liệu mỗi 5 giây (nhấn để làm mới ngay)"
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Làm mới</span>
          <span className="font-mono text-[11px] text-slate-300 tabular-nums">
            {nextRefreshInSec}s
          </span>
        </button>
      </div>
    </header>
  );
}
