import { Download, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { translations, useLanguage } from '../i18n';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { lang } = useLanguage();
  const t = translations[lang];
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <div className="p-2.5 border-t border-white/10 bg-[#0b0f17] shrink-0">
      <button
        type="button"
        onClick={handleClick}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 bg-emerald-500/15 hover:bg-emerald-500/22 border border-emerald-400/25 rounded-2xl text-xs font-extrabold text-emerald-100 active:scale-[0.99] transition-all cursor-pointer"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          {isInstallable ? (
            <Download className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="truncate">
            {isInstallable ? t.pwaInstallCta : t.pwaGuideCta}
          </span>
        </span>
        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-[11px] font-black text-slate-950 whitespace-nowrap shrink-0">
          {isInstallable ? t.pwaInstallNow : t.pwaGuideBtn}
        </span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <h3
                id="pwa-guide-title"
                className="font-display text-base font-bold text-slate-950"
              >
                {t.pwaModalTitle}
              </h3>
              <button
                type="button"
                aria-label={t.pwaCloseAria}
                onClick={() => setShowGuide(false)}
                className="w-8 h-8 inline-flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm text-slate-700">
              {isIOS ? (
                <div className="space-y-2">
                  <p className="font-semibold text-slate-900">{t.pwaIosHeading}</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed text-slate-600">
                    {t.pwaIosSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <p className="font-semibold text-slate-900">{t.pwaAndroid1Heading}</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed text-slate-600">
                      {t.pwaAndroid1Steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  <div className="pt-3 border-t border-slate-100 space-y-1.5">
                    <p className="font-semibold text-slate-900">{t.pwaAndroid2Heading}</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed text-slate-600">
                      {t.pwaAndroid2Steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                {t.pwaUnderstood}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
