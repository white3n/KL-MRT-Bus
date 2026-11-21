import { Bus, Layers, RefreshCw, Route, TrainFront, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { translations, useLanguage } from '../i18n';
import type { TransitMode } from '../types/transit';
import { getClientMalaysiaClock } from '../utils/transitHelpers';

interface TopBarProps {
  mode: TransitMode;
  onModeChange: (mode: TransitMode) => void;
  onRefresh: () => void;
  onOpenTripPlanner: () => void;
  onOpenFontPicker: () => void;
  isRefreshing: boolean;
  nextRefreshInSec: number;
}

export function TopBar({
  mode,
  onModeChange,
  onRefresh,
  onOpenTripPlanner,
  onOpenFontPicker,
  isRefreshing,
  nextRefreshInSec,
}: TopBarProps) {
  const { lang, setLang } = useLanguage();
  const t = translations[lang];
  const [clock, setClock] = useState(getClientMalaysiaClock);

  useEffect(() => {
    const id = setInterval(() => {
      setClock(getClientMalaysiaClock());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const navItems: { id: TransitMode; label: string; icon: typeof TrainFront }[] = [
    { id: 'rail', label: t.modeRail, icon: TrainFront },
    { id: 'bus', label: t.modeBus, icon: Bus },
    { id: 'all', label: t.modeAll, icon: Layers },
  ];

  const dayLabel = lang === 'en' ? clock.dayLabelEn : clock.dayLabelVi;

  return (
    <header className="shrink-0 bg-[#0b0f17] border-b border-white/10 z-30">
      {/* Row 1: Sleek Minimalist Dark Transit Top Bar */}
      <div className="h-13 px-3.5 md:px-6 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onModeChange('rail')}
          className="inline-flex items-center gap-2.5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-xl group min-w-0"
        >
          <span className="w-8.5 h-8.5 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center shadow-sm shadow-emerald-500/25 shrink-0 group-active:scale-95 transition-transform">
            <TrainFront className="w-4.5 h-4.5 stroke-[2.4]" />
          </span>
          <div className="min-w-0">
            <div className="font-display text-base md:text-lg font-black tracking-tight text-white leading-tight whitespace-nowrap truncate">
              KL Transit
            </div>
            <div
              className="flex items-center gap-1.5 text-[11px] text-slate-400 leading-tight"
              title={t.clockTitle}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span className="font-mono font-bold text-slate-200 tabular-nums">{clock.hhmm}</span>
              <span>MYT</span>
              <span className="hidden sm:inline" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline">{dayLabel}</span>
            </div>
          </div>
        </button>

        {/* Minimalist Dark Controls: Trip Planner (desktop) + Font + VI/EN + Refresh */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenTripPlanner}
            aria-label={t.tripPlanner}
            title={t.tripPlanner}
            className="hidden sm:inline-flex h-8.5 px-3 items-center justify-center gap-1.5 rounded-full bg-emerald-600/90 hover:bg-emerald-500 active:scale-95 text-white text-xs font-extrabold transition-all cursor-pointer"
          >
            <Route className="w-3.5 h-3.5 shrink-0" />
            <span>{t.tripPlanner}</span>
          </button>

          <button
            type="button"
            onClick={onOpenFontPicker}
            aria-label={t.fontPickerAria}
            title={t.fontPickerAria}
            className="w-8.5 h-8.5 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/18 active:scale-95 text-slate-200 transition-all cursor-pointer"
          >
            <Type className="w-4 h-4" />
          </button>

          <div
            role="group"
            aria-label={t.langSwitchAria}
            className="inline-flex items-center p-0.5 rounded-full bg-white/10 border border-white/10"
          >
            <button
              type="button"
              onClick={() => setLang('vi')}
              aria-pressed={lang === 'vi'}
              className={`px-2 py-1 text-[11px] font-extrabold rounded-full transition-all cursor-pointer ${
                lang === 'vi'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              VI
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              aria-pressed={lang === 'en'}
              className={`px-2 py-1 text-[11px] font-extrabold rounded-full transition-all cursor-pointer ${
                lang === 'en'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              EN
            </button>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label={t.refreshAria}
            title={t.refreshTitle(nextRefreshInSec)}
            className="w-8.5 h-8.5 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/18 active:scale-95 text-emerald-400 disabled:opacity-60 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Row 2 (Desktop / Tablet): Sleek Dark Segmented Navigation Bar */}
      <div className="hidden md:block px-6 pb-2.5 pt-0.5">
        <nav
          aria-label={t.navAriaLabel}
          className="inline-grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-white/8 border border-white/10"
        >
          {navItems.map((item) => {
            const active = mode === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onModeChange(item.id)}
                aria-pressed={active}
                className={`inline-flex items-center justify-center gap-1.5 px-5 py-1.5 rounded-xl text-sm font-extrabold whitespace-nowrap transition-all active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                  active
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-white/8'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
