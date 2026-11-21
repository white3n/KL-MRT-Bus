import type { BusCategory } from '../types/transit';

export interface RailFareEstimate {
  distanceKm: number;
  cashlessMyr: number; // Touch 'n Go / MyRapid
  cashTokenMyr: number; // Single-journey Token
  concessionMyr: number; // 50% Student / Senior / OKU
  my50Covered: boolean;
}

export interface BusFareEstimate {
  distanceKm: number;
  cashlessMyr: number; // Rapid KL buses are 100% cashless (Touch 'n Go / Pass)
  isFlatRate: boolean;
  my50Covered: boolean;
}

function roundTo10Sen(amount: number): number {
  return Math.round(amount * 10) / 10;
}

/**
 * Estimates Rapid KL Rail fare (MRT, LRT, Monorail, BRT) using Prasarana's
 * official distance-based cascading fare structure:
 * - Flag-fall RM 0.80
 * - 0..4 km: RM 0.302/km
 * - 4..9 km: RM 0.258/km
 * - 9..14 km: RM 0.207/km
 * - 14..19 km: RM 0.155/km
 * - >19 km: RM 0.103/km
 */
export function estimateRapidKlRailFare(distanceKm: number): RailFareEstimate {
  const km = Math.max(0.5, distanceKm);
  let raw = 0.8;

  const tiers: [number, number][] = [
    [4, 0.302],
    [5, 0.258],
    [5, 0.207],
    [5, 0.155],
    [Infinity, 0.103],
  ];

  let remaining = km;
  for (const [bandKm, rate] of tiers) {
    if (remaining <= 0) break;
    const used = Math.min(remaining, bandKm);
    raw += used * rate;
    remaining -= used;
  }

  const cashlessMyr = Math.max(1.1, Math.min(6.4, roundTo10Sen(raw)));
  const cashTokenMyr = Math.max(1.2, Math.min(7.2, roundTo10Sen(cashlessMyr * 1.15)));
  const concessionMyr = Math.max(0.6, roundTo10Sen(cashlessMyr * 0.5));

  return {
    distanceKm: Math.round(km * 10) / 10,
    cashlessMyr,
    cashTokenMyr,
    concessionMyr,
    my50Covered: true,
  };
}

/**
 * Estimates Rapid KL Bus & MRT Feeder Bus fare (100% cashless via Touch 'n Go / My50):
 * - MRT / LRT Feeder Bus (T-routes): Flat RM 1.00
 * - Rapid Bus KL stage buses: Distance-based RM 1.00 to RM 3.00 cap
 */
export function estimateRapidKlBusFare(
  category: BusCategory,
  distanceKm: number
): BusFareEstimate {
  const km = Math.max(0.3, distanceKm);
  if (category === 'rapid-bus-mrtfeeder') {
    return {
      distanceKm: Math.round(km * 10) / 10,
      cashlessMyr: 1.0,
      isFlatRate: true,
      my50Covered: true,
    };
  }

  let fare = 1.0;
  if (km > 15) fare = 3.0;
  else if (km > 10) fare = 2.5;
  else if (km > 5) fare = 2.0;
  else if (km > 2) fare = 1.5;

  return {
    distanceKm: Math.round(km * 10) / 10,
    cashlessMyr: fare,
    isFlatRate: false,
    my50Covered: true,
  };
}

export function formatMyr(amount: number): string {
  return `RM ${amount.toFixed(2)}`;
}
