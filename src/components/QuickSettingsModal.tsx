import { Globe, Home, RefreshCw, Type, X } from 'lucide-react';
import { translations, useLanguage } from '../i18n';

interface QuickSettingsModalProps {
  open: boolean;
  fontFamily: string;
  myRailName: string | null;
  myBusName: string | null;
  isRefreshing: boolean;
  onClose: () => void;
  onOpenFontPicker: () => void;
  onOpenMyRailSetup: () => void;
  onOpenMyBusSetup: () => void;
  onRefresh: () => void;
}

export function QuickSettingsModal({
  open,
  fontFamily,
  myRailName,
  myBusName,
  isRefreshing,
  onClose,
  onOpenFontPicker,
  onOpenMyRailSetup,
  onOpenMyBusSetup,
  onRefresh,
}: QuickSettingsModalProps) {
  const { lang, setLang } = useLanguage();
  const t = translations[lang];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1060] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-[#111723] text-white border-t sm:border border-white/12 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-display text-lg font-black text-white">{t.settingsTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.pwaCloseAria}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/18 flex items-center justify-center text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2.5">
          {/* Language Switcher */}
          <div className="px-4 py-3 rounded-2xl bg-white/6 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2.5 text-sm font-extrabold text-white">
              <Globe className="w-4.5 h-4.5 text-emerald-400" />
              <span>{lang === 'en' ? 'Language' : 'Ngôn ngữ'}</span>
            </span>
            <div className="inline-flex p-0.5 rounded-full bg-black/40 border border-white/10">
              <button
                type="button"
                onClick={() => setLang('vi')}
                className={`px-3 py-1 rounded-full text-xs font-black transition-all cursor-pointer ${
                  lang === 'vi' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                }`}
              >
                Tiếng Việt
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-3 py-1 rounded-full text-xs font-black transition-all cursor-pointer ${
                  lang === 'en' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* Google Font Picker */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFontPicker();
            }}
            className="w-full px-4 py-3 rounded-2xl bg-white/6 hover:bg-white/12 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-all cursor-pointer"
          >
            <span className="inline-flex items-center gap-2.5 text-sm font-extrabold text-white">
              <Type className="w-4.5 h-4.5 text-sky-400" />
              <span>{t.fontPickerAria}</span>
            </span>
            <span className="text-xs font-bold text-slate-400 truncate max-w-[130px]">
              {fontFamily}
            </span>
          </button>

          {/* My Rail Station */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenMyRailSetup();
            }}
            className="w-full px-4 py-3 rounded-2xl bg-white/6 hover:bg-white/12 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-all cursor-pointer"
          >
            <span className="inline-flex items-center gap-2.5 text-sm font-extrabold text-white">
              <Home className="w-4.5 h-4.5 text-emerald-400" />
              <span>{t.myRailStationLabel}</span>
            </span>
            <span className="text-xs font-bold text-emerald-300 truncate max-w-[140px]">
              {myRailName || t.setupBtn}
            </span>
          </button>

          {/* My Bus Station */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenMyBusSetup();
            }}
            className="w-full px-4 py-3 rounded-2xl bg-white/6 hover:bg-white/12 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-all cursor-pointer"
          >
            <span className="inline-flex items-center gap-2.5 text-sm font-extrabold text-white">
              <Home className="w-4.5 h-4.5 text-rose-400" />
              <span>{t.myBusStationLabel}</span>
            </span>
            <span className="text-xs font-bold text-rose-300 truncate max-w-[140px]">
              {myBusName || t.setupBtn}
            </span>
          </button>

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={() => {
              onRefresh();
              onClose();
            }}
            disabled={isRefreshing}
            className="w-full px-4 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{t.refreshAria}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
