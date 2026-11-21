import { RefreshCw } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  pullLabel: string;
  releaseLabel: string;
  refreshingLabel: string;
  className?: string;
  children: ReactNode;
}

const THRESHOLD_PX = 62;
const MAX_PULL_PX = 96;

export function PullToRefresh({
  onRefresh,
  pullLabel,
  releaseLabel,
  refreshingLabel,
  className = '',
  children,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (refreshing) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 2) return;
    startYRef.current = e.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (refreshing || startYRef.current === null) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 2) {
      startYRef.current = null;
      setPullDist(0);
      return;
    }
    const curY = e.touches[0]?.clientY ?? startYRef.current;
    const delta = curY - startYRef.current;
    if (delta > 6) {
      const damped = Math.min(MAX_PULL_PX, Math.round(delta * 0.48));
      setPullDist(damped);
    } else {
      setPullDist(0);
    }
  };

  const handleTouchEnd = async () => {
    if (startYRef.current === null) return;
    startYRef.current = null;
    if (pullDist >= THRESHOLD_PX && !refreshing) {
      setRefreshing(true);
      setPullDist(52);
      try {
        await onRefresh();
      } finally {
        window.setTimeout(() => {
          setRefreshing(false);
          setPullDist(0);
        }, 320);
      }
    } else {
      setPullDist(0);
    }
  };

  const progress = Math.min(1, pullDist / THRESHOLD_PX);
  const visible = pullDist > 4 || refreshing;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={className}
    >
      {/* Dark Transit Pull-to-Refresh Header Indicator */}
      <div
        className="overflow-hidden flex items-center justify-center transition-[height] duration-150 bg-[#0b0f17]"
        style={{ height: visible ? `${Math.max(40, pullDist)}px` : '0px' }}
      >
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#161e2e] border border-white/12 shadow-md text-xs font-extrabold text-emerald-400">
          <RefreshCw
            className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`}
            style={
              !refreshing ? { transform: `rotate(${Math.round(progress * 260)}deg)` } : undefined
            }
          />
          <span>
            {refreshing
              ? refreshingLabel
              : pullDist >= THRESHOLD_PX
                ? releaseLabel
                : pullLabel}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}
