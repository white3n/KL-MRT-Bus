import { Check, Download, ExternalLink, Loader2, Type, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PRESET_GOOGLE_FONTS } from '../hooks/useAppFont';
import { translations, useLanguage } from '../i18n';

interface FontPickerModalProps {
  open: boolean;
  currentFont: string;
  loadingFont: boolean;
  onSelectFont: (family: string) => Promise<boolean> | void;
  onClose: () => void;
}

export function FontPickerModal({
  open,
  currentFont,
  loadingFont,
  onSelectFont,
  onClose,
}: FontPickerModalProps) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState(false);

  // Preload preset preview fonts when modal opens (requesting both multi-weight & single-weight cleanly)
  useEffect(() => {
    if (!open) return;
    const previewId = 'kl-font-picker-previews';
    if (!document.getElementById(previewId)) {
      const families = PRESET_GOOGLE_FONTS.map(
        (f) => `family=${encodeURIComponent(f.family).replace(/%20/g, '+')}`
      ).join('&');
      const link = document.createElement('link');
      link.id = previewId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
      document.head.appendChild(link);
    }
  }, [open]);

  if (!open) return null;

  const handleApplyCustom = async () => {
    const clean = customInput.trim();
    if (!clean) return;
    setCustomError(false);
    const ok = await onSelectFont(clean);
    if (ok === false) {
      setCustomError(true);
    } else {
      setCustomInput('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1150] flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="font-picker-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md max-h-[86dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden">
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
          <span className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        <div className="px-5 pt-2.5 pb-3.5 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              {loadingFont ? (
                <Loader2 className="w-4.5 h-4.5 animate-spin" />
              ) : (
                <Type className="w-4.5 h-4.5" />
              )}
            </span>
            <div className="min-w-0">
              <h3 id="font-picker-title" className="font-display text-base font-bold text-slate-950">
                {t.fontModalTitle}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                {t.fontCurrentLabel(currentFont)}
              </p>
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

        {/* Live System Preview Banner */}
        <div className="px-5 py-3 bg-blue-50/70 border-b border-blue-100 shrink-0">
          <div className="p-3 rounded-2xl bg-white border border-blue-200/80 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-950 truncate">
                KLCC · Bukit Bintang · Bus 400
              </div>
              <div className="text-xs text-slate-600 truncate mt-0.5">
                {lang === 'en'
                  ? 'Next train arrives in 3 min · UI layout protected'
                  : 'Chuyến tàu kế tiếp còn 3 phút · Tự cân chỉnh khung UI'}
              </div>
            </div>
            <span className="px-2 py-1 rounded-lg bg-emerald-600 font-mono text-xs font-bold text-white shrink-0">
              3m
            </span>
          </div>
        </div>

        {/* Load any custom font directly from Google Fonts */}
        <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-100 space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="custom-google-font" className="text-xs font-semibold text-slate-700">
              {t.fontCustomLabel}
            </label>
            <a
              href="https://fonts.google.com/?subset=vietnamese"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
            >
              <span>fonts.google.com</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="custom-google-font"
              type="text"
              value={customInput}
              onChange={(e) => {
                setCustomInput(e.target.value);
                if (customError) setCustomError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApplyCustom();
              }}
              placeholder={t.fontCustomPlaceholder}
              className="flex-1 min-w-0 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-full text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15"
            />
            <button
              type="button"
              onClick={handleApplyCustom}
              disabled={!customInput.trim() || loadingFont}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold active:scale-95 transition-all shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.fontLoadApply}</span>
            </button>
          </div>
          {customError && (
            <p className="text-[11px] text-rose-600 font-medium">
              {lang === 'en'
                ? 'Font not found on Google Fonts. Check exact spelling (e.g. Montserrat, Oswald, Playfair Display).'
                : 'Không tải được font này từ Google Fonts. Hãy kiểm tra đúng tên font (vd: Montserrat, Oswald, Playfair Display).'}
            </p>
          )}
        </div>

        {/* Distinct Vietnamese-ready Google Fonts */}
        <div className="flex-1 overflow-y-auto transit-scroll p-4 space-y-2">
          {PRESET_GOOGLE_FONTS.map((font) => {
            const active = currentFont.toLowerCase() === font.family.toLowerCase();
            return (
              <button
                key={font.family}
                type="button"
                onClick={() => onSelectFont(font.family)}
                className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between gap-3 transition-all active:scale-[0.99] cursor-pointer ${
                  active
                    ? 'bg-blue-50/80 border-blue-500 ring-1 ring-blue-500/30'
                    : 'bg-white border-slate-200/90 hover:bg-slate-50'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-sm font-bold text-slate-950"
                      style={{ fontFamily: `"${font.family}", ${font.category}` }}
                    >
                      {font.label}
                    </span>
                    <span className="text-[10px] font-medium text-slate-500">{font.tag}</span>
                  </div>
                  <div
                    className="text-xs text-slate-600 mt-0.5 truncate"
                    style={{ fontFamily: `"${font.family}", ${font.category}` }}
                  >
                    {font.sample}
                  </div>
                </div>
                {active && (
                  <span className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
