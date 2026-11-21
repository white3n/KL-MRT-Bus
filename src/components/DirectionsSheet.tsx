import {
  Bike,
  Bus,
  Car,
  ExternalLink,
  Footprints,
  LocateFixed,
  MapPin,
  Navigation,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { translations, useLanguage } from '../i18n';
import type { UserLocation } from '../types/transit';
import {
  buildAppleMapsDirectionsUrl,
  buildGoogleMapsDirectionsUrl,
  buildWazeUrl,
  estimateTravelMinutes,
  isIOSDevice,
  openExternalMapUrl,
  type DirectionsTarget,
  type TravelMode,
} from '../utils/directionsHelper';

interface DirectionsSheetProps {
  target: DirectionsTarget | null;
  userLocation: UserLocation | null;
  isLocating: boolean;
  onRequestGps: () => void;
  onClose: () => void;
}

export function DirectionsSheet({
  target,
  userLocation,
  isLocating,
  onRequestGps,
  onClose,
}: DirectionsSheetProps) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const [travelMode, setTravelMode] = useState<TravelMode>('walking');

  if (!target) return null;

  const ios = isIOSDevice();
  const est = estimateTravelMinutes(userLocation, target, travelMode);
  const distStr = est
    ? est.distanceKm < 1
      ? `${Math.round(est.distanceKm * 1000)}m`
      : `${est.distanceKm.toFixed(1)}km`
    : null;

  const modes: { id: TravelMode; label: string; icon: typeof Footprints }[] = [
    { id: 'walking', label: t.modeWalk, icon: Footprints },
    { id: 'transit', label: t.modeTransit, icon: Bus },
    { id: 'driving', label: t.modeDrive, icon: Car },
    { id: 'bicycling', label: t.modeBike, icon: Bike },
  ];

  const handleOpenGoogleMaps = () => {
    const url = buildGoogleMapsDirectionsUrl(userLocation, target, travelMode);
    openExternalMapUrl(url);
  };

  const handleOpenAppleMaps = () => {
    const url = buildAppleMapsDirectionsUrl(userLocation, target, travelMode);
    openExternalMapUrl(url);
  };

  const handleOpenWaze = () => {
    const url = buildWazeUrl(target);
    openExternalMapUrl(url);
  };

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="directions-sheet-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Material 3 Drag Handle (Mobile) */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <span className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Navigation className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0">
              <h3
                id="directions-sheet-title"
                className="font-display text-base font-bold text-slate-950 truncate"
              >
                {t.dirSheetTitle}
              </h3>
              {est && distStr && (
                <p className="text-xs font-medium text-blue-700">
                  {t.dirEstAway(distStr, est.minutes)}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.pwaCloseAria}
            className="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* From -> To Visual Route Card */}
        <div className="px-5 py-4 space-y-4">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            {/* From */}
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-1 w-3 h-3 rounded-full bg-blue-600 ring-4 ring-blue-100 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {t.dirFromLabel}
                  </div>
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {userLocation ? t.dirCurrentGps : t.dirAutoGps}
                  </div>
                  {userLocation && (
                    <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                      {userLocation.lat.toFixed(5)}, {userLocation.lon.toFixed(5)}
                    </div>
                  )}
                </div>
              </div>

              {!userLocation && (
                <button
                  type="button"
                  onClick={onRequestGps}
                  disabled={isLocating}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold shrink-0 active:scale-95 transition-all cursor-pointer"
                >
                  <LocateFixed className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                  <span>{isLocating ? t.locatingShort : t.dirGetGpsNow}</span>
                </button>
              )}
            </div>

            <div className="ml-1.5 h-3 border-l-2 border-dashed border-slate-300" />

            {/* To */}
            <div className="flex items-start gap-2.5 min-w-0">
              <MapPin className="w-4 h-4 text-rose-600 mt-0.5 -ml-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {t.dirToLabel}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {target.badge && (
                    <span
                      className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold text-white"
                      style={{ backgroundColor: target.color || '#0F172A' }}
                    >
                      {target.badge}
                    </span>
                  )}
                  <span className="text-sm font-bold text-slate-950 truncate">{target.name}</span>
                </div>
                {target.subtitle && (
                  <div className="text-xs text-slate-500 truncate mt-0.5">{target.subtitle}</div>
                )}
              </div>
            </div>
          </div>

          {/* Travel Mode Selector (Material 3 Filter Chips) */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-600">{t.dirTravelModeLabel}</div>
            <div className="grid grid-cols-4 gap-1.5">
              {modes.map((m) => {
                const Icon = m.icon;
                const active = travelMode === m.id;
                const modeEst = estimateTravelMinutes(userLocation, target, m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTravelMode(m.id)}
                    aria-pressed={active}
                    className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1.5 rounded-2xl border text-center transition-all active:scale-95 cursor-pointer ${
                      active
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-600/25'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4.5 h-4.5 shrink-0" />
                    <span className="text-[11px] font-semibold leading-tight truncate max-w-full">
                      {m.label}
                    </span>
                    {modeEst && (
                      <span
                        className={`text-[10px] font-mono tabular-nums ${
                          active ? 'text-blue-100' : 'text-slate-400'
                        }`}
                      >
                        ~{modeEst.minutes}m
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary Action: Google Maps (Pre-filled From -> To) */}
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={handleOpenGoogleMaps}
              className="w-full py-3.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-semibold text-sm shadow-md shadow-blue-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Navigation className="w-4.5 h-4.5" />
              <span>{t.openGoogleMaps}</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </button>

            {/* Secondary Apps: Waze & Apple Maps */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenWaze}
                className="py-2.5 px-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200/80 active:scale-[0.98] text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <span>{t.openWaze}</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </button>

              <button
                type="button"
                onClick={handleOpenAppleMaps}
                className={`py-2.5 px-3.5 rounded-2xl active:scale-[0.98] text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  ios
                    ? 'bg-slate-900 hover:bg-slate-800 text-white'
                    : 'bg-slate-100 hover:bg-slate-200/80 text-slate-800'
                }`}
              >
                <span>{t.openAppleMaps}</span>
                <ExternalLink
                  className={`w-3.5 h-3.5 ${ios ? 'text-slate-300' : 'text-slate-500'}`}
                />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed pb-1">
              {t.dirReadyNote}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
