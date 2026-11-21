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
    <header className="shrink-0 bg-white border-b border-slate-200/90 shadow-xs z-30">
      {/* Row 1: Material 3 Top App Bar */}
      <div className="h-14 px-3 md:px-6 flex items-center justify-between gap-1.5">
        <button
          type="button"
          onClick={() => onModeChange('rail')}
          className="inline-flex items-center gap-2 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xl group min-w-0"
        >
          <span className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0 group-active:scale-95 transition-transform">
            <TrainFront className="w-4.5 h-4.5" />
          </span>
          <div className="min-w-0">
            <div className="font-display text-[15px] sm:text-base md:text-lg font-bold tracking-tight text-slate-900 leading-tight whitespace-nowrap truncate">
              KL Transit Live
            </div>
            <div
              className="flex items-center gap-1.5 text-[11px] text-slate-500 leading-tight"
              title={t.clockTitle}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="font-mono font-semibold text-slate-700 tabular-nums">
                {clock.hhmm}
              </span>
              <span>MYT</span>
              <span className="hidden sm:inline" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline">{dayLabel}</span>
            </div>
          </div>
        </button>

        {/* Right Controls: Trip Planner + Font Picker + Language Switcher + Icon-Only Refresh */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenTripPlanner}
            aria-label={t.tripPlanner}
            title={t.tripPlanner}
            className="h-8.5 w-8.5 sm:w-auto sm:h-9 sm:px-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-100 hover:bg-slate-200/80 active:scale-95 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
          >
            <Route className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="hidden sm:inline">{t.tripPlanner}</span>
          </button>

          <button
            type="button"
            onClick={onOpenFontPicker}
            aria-label={t.fontPickerAria}
            title={t.fontPickerAria}
            className="w-8.5 h-8.5 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200/80 active:scale-95 text-slate-700 transition-all cursor-pointer"
          >
            <Type className="w-4 h-4" />
          </button>

          <div
            role="group"
            aria-label={t.langSwitchAria}
            className="inline-flex items-center p-0.5 rounded-full bg-slate-100 border border-slate-200/90"
          >
            <button
              type="button"
              onClick={() => setLang('vi')}
              aria-pressed={lang === 'vi'}
              className={`px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-semibold rounded-full transition-all cursor-pointer ${
                lang === 'vi'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              VI
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              aria-pressed={lang === 'en'}
              className={`px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-semibold rounded-full transition-all cursor-pointer ${
                lang === 'en'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
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
            className="w-8.5 h-8.5 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-full bg-blue-50 hover:bg-blue-100 active:scale-95 text-blue-700 border border-blue-200/70 disabled:opacity-60 shadow-2xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Row 2 (Desktop / Tablet): Dedicated Material 3 Segmented Navigation Bar */}
      <div className="hidden md:block px-6 pb-2.5 pt-0.5">
        <nav
          aria-label={t.navAriaLabel}
          className="inline-grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100/95 border border-slate-200/80"
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
                className={`inline-flex items-center justify-center gap-1.5 px-5 py-1.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
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
