export interface TransitPalette {
  /** Deep full-bleed page/band dark background */
  bandBg: string;
  /** Slightly brighter nested card surface */
  surfaceBg: string;
  /** Bright juicy foreground accent for giant route codes & numbers */
  accent: string;
  /** Vibrant active tile / GO button fill */
  vivid: string;
  /** Muted warm-tinted secondary text */
  muted: string;
  /** Subtle tinted border */
  border: string;
  /** Line number circle badge (for KL rail lines like 9 Kajang, 3 Ampang) */
  lineNumber?: string;
}

const RAIL_LINE_NUMBERS: Record<string, string> = {
  AG: '3',
  PH: '4',
  KJ: '5',
  MR: '8',
  KGL: '9',
  PYL: '12',
  BRT: 'B1',
  SA: '11',
};

export function getRailLineNumber(routeId: string, fallbackShort?: string): string {
  return RAIL_LINE_NUMBERS[routeId.toUpperCase()] || fallbackShort || routeId;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || '').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (Number.isNaN(n)) return [225, 29, 72];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): string {
  const r = Math.round(a[0] * (1 - t) + b[0] * t);
  const g = Math.round(a[1] * (1 - t) + b[1] * t);
  const bl = Math.round(a[2] * (1 - t) + b[2] * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * Generates Transit-App-inspired rich dark tinted cards + bright cute accent colors
 * from any Rapid KL rail or bus color/category.
 */
export function getTransitPalette(
  rawColor: string,
  kind?: 'feeder' | 'rapid-bus' | 'rail',
  routeId?: string
): TransitPalette {
  const id = (routeId || '').toUpperCase();

  // Iconic Transit App curated palettes for KL lines & buses
  if (kind === 'feeder') {
    return {
      bandBg: '#360c09',
      surfaceBg: '#4c140f',
      accent: '#ff6454',
      vivid: '#ef4436',
      muted: '#f5b5ae',
      border: 'rgba(255, 100, 84, 0.22)',
    };
  }
  if (kind === 'rapid-bus') {
    return {
      bandBg: '#071b3d',
      surfaceBg: '#0d2957',
      accent: '#6da8ff',
      vivid: '#2563eb',
      muted: '#a6c8ff',
      border: 'rgba(109, 168, 255, 0.22)',
    };
  }
  if (id === 'KGL') {
    return {
      bandBg: '#052919',
      surfaceBg: '#093d26',
      accent: '#22c55e',
      vivid: '#16a34a',
      muted: '#9ae6b4',
      border: 'rgba(34, 197, 94, 0.22)',
      lineNumber: '9',
    };
  }
  if (id === 'PYL') {
    return {
      bandBg: '#2e2204',
      surfaceBg: '#453308',
      accent: '#facc15',
      vivid: '#eab308',
      muted: '#fde68a',
      border: 'rgba(250, 204, 21, 0.22)',
      lineNumber: '12',
    };
  }
  if (id === 'AG') {
    return {
      bandBg: '#331804',
      surfaceBg: '#4a2408',
      accent: '#fb923c',
      vivid: '#f97316',
      muted: '#fed7aa',
      border: 'rgba(251, 146, 60, 0.22)',
      lineNumber: '3',
    };
  }
  if (id === 'PH') {
    return {
      bandBg: '#330a18',
      surfaceBg: '#4a1124',
      accent: '#fb7185',
      vivid: '#e11d48',
      muted: '#fecdd3',
      border: 'rgba(251, 113, 133, 0.22)',
      lineNumber: '4',
    };
  }
  if (id === 'KJ') {
    return {
      bandBg: '#380a16',
      surfaceBg: '#521022',
      accent: '#ff5c7c',
      vivid: '#e11d48',
      muted: '#fda4af',
      border: 'rgba(255, 92, 124, 0.22)',
      lineNumber: '5',
    };
  }
  if (id === 'MR') {
    return {
      bandBg: '#1d2b06',
      surfaceBg: '#2b400a',
      accent: '#a3e635',
      vivid: '#84cc16',
      muted: '#d9f99d',
      border: 'rgba(163, 230, 53, 0.22)',
      lineNumber: '8',
    };
  }
  if (id === 'BRT') {
    return {
      bandBg: '#06291f',
      surfaceBg: '#0b3d2f',
      accent: '#34d399',
      vivid: '#10b981',
      muted: '#a7f3d0',
      border: 'rgba(52, 211, 153, 0.22)',
      lineNumber: 'B1',
    };
  }

  // Dynamic fallback from any hex color
  const rgb = hexToRgb(rawColor);
  const darkBase: [number, number, number] = [10, 14, 22];
  const white: [number, number, number] = [255, 255, 255];
  return {
    bandBg: mixRgb(rgb, darkBase, 0.78),
    surfaceBg: mixRgb(rgb, darkBase, 0.68),
    accent: mixRgb(rgb, white, 0.35),
    vivid: rawColor || '#ef4436',
    muted: mixRgb(rgb, white, 0.65),
    border: 'rgba(255, 255, 255, 0.14)',
    lineNumber: id ? getRailLineNumber(id) : undefined,
  };
}
