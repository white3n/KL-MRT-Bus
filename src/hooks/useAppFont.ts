import { useCallback, useEffect, useState } from 'react';

export interface FontOption {
  family: string;
  label: string;
  tag: string;
  sample: string;
  /** Slight root scale normalization so wider fonts never overflow tight buttons/tabs */
  scalePercent?: number;
  category: 'sans-serif' | 'serif' | 'cursive';
}

export const PRESET_GOOGLE_FONTS: FontOption[] = [
  {
    family: 'Be Vietnam Pro',
    label: 'Be Vietnam Pro',
    tag: 'Mặc định · Sans-serif hiện đại',
    sample: 'KLCC · 3 phút nữa tàu đến ga',
    scalePercent: 100,
    category: 'sans-serif',
  },
  {
    family: 'Roboto',
    label: 'Roboto',
    tag: 'Chuẩn Android Material',
    sample: 'KLCC · 3 phút nữa tàu đến ga',
    scalePercent: 100,
    category: 'sans-serif',
  },
  {
    family: 'Nunito',
    label: 'Nunito',
    tag: 'Bo tròn mềm mại · Dễ nhìn',
    sample: 'KLCC · 3 phút nữa tàu đến ga',
    scalePercent: 100,
    category: 'sans-serif',
  },
  {
    family: 'Comfortaa',
    label: 'Comfortaa',
    tag: 'Tròn hiện đại · Khác biệt rõ',
    sample: 'KLCC · 3 phút nữa tàu đến ga',
    scalePercent: 93,
    category: 'sans-serif',
  },
  {
    family: 'Space Grotesk',
    label: 'Space Grotesk',
    tag: 'Công nghệ · Biển chỉ dẫn tàu',
    sample: 'KLCC · 3 phút nữa tàu đến ga',
    scalePercent: 96,
    category: 'sans-serif',
  },
  {
    family: 'Lora',
    label: 'Lora',
    tag: 'Có chân (Serif) · Thanh lịch',
    sample: 'KLCC · 3 phút nữa tàu đến ga',
    scalePercent: 98,
    category: 'serif',
  },
  {
    family: 'Merriweather',
    label: 'Merriweather',
    tag: 'Có chân (Serif) · Đậm nét',
    sample: 'KLCC · 3 phút nữa tàu đến ga',
    scalePercent: 92,
    category: 'serif',
  },
  {
    family: 'Patrick Hand',
    label: 'Patrick Hand',
    tag: 'Chữ viết tay · Vui mắt',
    sample: 'KLCC · 3 phút nữa tàu đến ga',
    scalePercent: 104,
    category: 'cursive',
  },
];

const STORAGE_KEY = 'kl_transit_app_font_v1';
const DEFAULT_FONT = 'Be Vietnam Pro';
const LINK_ID = 'kl-dynamic-google-font';

function readSavedFont(): string {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim().length > 0) return saved.trim();
  } catch {
    // ignore
  }
  return DEFAULT_FONT;
}

function getFontMeta(family: string): { scalePercent: number; fallback: string } {
  const preset = PRESET_GOOGLE_FONTS.find(
    (f) => f.family.toLowerCase() === family.trim().toLowerCase()
  );
  if (preset) {
    return {
      scalePercent: preset.scalePercent ?? 100,
      fallback:
        preset.category === 'serif'
          ? 'Georgia, serif'
          : preset.category === 'cursive'
            ? 'cursive, sans-serif'
            : 'system-ui, -apple-system, sans-serif',
    };
  }
  return { scalePercent: 96, fallback: 'system-ui, -apple-system, sans-serif' };
}

export async function loadGoogleFontStylesheet(
  family: string,
  linkId = LINK_ID
): Promise<boolean> {
  const clean = family.trim().replace(/['"]/g, '');
  if (!clean) return false;

  const encoded = encodeURIComponent(clean).replace(/%20/g, '+');
  // Request generic family first (supports both variable & single-weight Google Fonts like Patrick Hand!)
  const hrefWeights = `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700;800&display=swap`;
  const hrefSimple = `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;

  const attachCss = (href: string): Promise<boolean> =>
    new Promise((resolve) => {
      let link = document.getElementById(linkId) as HTMLLinkElement | null;
      if (link && link.href === href) {
        resolve(true);
        return;
      }
      if (!link) {
        link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      link.onload = () => resolve(true);
      link.onerror = () => resolve(false);
      link.href = href;
    });

  let ok = await attachCss(hrefWeights);
  if (!ok) {
    // Fallback for single-weight Google Fonts (e.g. Patrick Hand, Pacifico, Bangers...)
    ok = await attachCss(hrefSimple);
  }

  // Wait for browser FontFaceSet to actually finish downloading the .woff2 font binary
  if (ok && typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load(`400 16px "${clean}"`),
          document.fonts.load(`700 16px "${clean}"`),
        ]),
        new Promise((r) => setTimeout(r, 3500)),
      ]);
    } catch {
      // continue applying font stack
    }
  }
  return ok;
}

function applyRootFontFamily(family: string): void {
  const safe = family.trim().replace(/['"]/g, '') || DEFAULT_FONT;
  const { scalePercent, fallback } = getFontMeta(safe);
  const stack = `"${safe}", ${fallback}`;
  const root = document.documentElement;
  root.style.setProperty('--app-font-family', stack);
  root.style.setProperty('--app-font-scale', `${scalePercent}%`);
  root.style.setProperty('--font-sans', stack);
  root.style.setProperty('--font-display', stack);
  root.style.setProperty('--default-font-family', stack);
  document.body.style.fontFamily = stack;
}

export function useAppFont() {
  const [fontFamily, setFontFamilyState] = useState<string>(readSavedFont);
  const [loadingFont, setLoadingFont] = useState(false);
  const [fontError, setFontError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingFont(true);
    setFontError(null);
    loadGoogleFontStylesheet(fontFamily).then((ok) => {
      if (cancelled) return;
      if (ok) {
        applyRootFontFamily(fontFamily);
      } else {
        setFontError(fontFamily);
      }
      setLoadingFont(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fontFamily]);

  const setAppFont = useCallback(async (nextFamily: string): Promise<boolean> => {
    const clean = nextFamily.trim().replace(/['"]/g, '');
    if (!clean) return false;
    setLoadingFont(true);
    setFontError(null);
    const ok = await loadGoogleFontStylesheet(clean);
    if (!ok) {
      setFontError(clean);
      setLoadingFont(false);
      return false;
    }
    applyRootFontFamily(clean);
    setFontFamilyState(clean);
    setLoadingFont(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, clean);
    } catch {
      // ignore
    }
    return true;
  }, []);

  return { fontFamily, setAppFont, loadingFont, fontError };
}
