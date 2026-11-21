import { Capacitor } from '@capacitor/core';
import { BellRing, Bus, Navigation, TrainFront, X } from 'lucide-react';
import { translations, useLanguage } from '../i18n';

export interface ActiveTrackerDisplay {
  kind: 'rail' | 'bus';
  id: string;
  badge: string;
  color: string;
  title: string;
  subtitle: string;
  primaryMetric: string;
  lat: number;
  lon: number;
}

interface LiveTrackerPillProps {
  tracker: ActiveTrackerDisplay | null;
  onFocus: () => void;
  onDirections: () => void;
  onStop: () => void;
}

export function LiveTrackerPill({
  tracker,
  onFocus,
  onDirections,
  onStop,
}: LiveTrackerPillProps) {
  const { lang } = useLanguage();
  const t = translations[lang];

  if (!tracker) return null;

  const isNative = Capacitor.isNativePlatform();
  const Icon = tracker.kind === 'bus' ? Bus : TrainFront;

  return (
    <div className="shrink-0 px-3 md:px-5 py-2 bg-slate-950 text-white border-b border-slate-800 shadow-sm z-25">
      <div className="flex items-center justify-between gap-2.5 max-w-full">
        <button
          type="button"
          onClick={onFocus}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group"
        >
          <span
            className="relative w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white shadow-xs"
            style={{ backgroundColor: tracker.color }}
          >
            <Icon className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950 animate-pulse" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-white/15 text-white shrink-0">
                {tracker.badge}
              </span>
              <span className="text-xs font-bold text-white truncate">{tracker.title}</span>
              <span className="ml-auto font-mono text-xs font-bold text-emerald-300 tabular-nums shrink-0 pl-1">
                {tracker.primaryMetric}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-300 truncate mt-0.5">
              <BellRing className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="truncate">
                {tracker.subtitle} ·{' '}
                {isNative ? t.liveTrackBannerSub : t.liveTrackBannerSubWeb}
              </span>
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onDirections}
            aria-label={t.directionsBtn}
            title={t.directionsBtn}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white transition-all cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onStop}
            aria-label={t.liveTrackStop}
            title={t.liveTrackStop}
            className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-slate-200 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
