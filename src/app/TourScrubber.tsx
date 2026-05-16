import { useCallback, useRef } from "react";
import { useAppStore } from "@/store";

export function TourScrubber() {
  const tour = useAppStore((s) => s.tour);
  const setScrubberT = useAppStore((s) => s.setScrubberT);
  const setScrubbing = useAppStore((s) => s.setScrubbing);
  const trackRef = useRef<HTMLDivElement>(null);

  const hasKeyframes = tour.keyframes.length >= 2;
  const isGuided = tour.mode === "guided";

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isGuided || !hasKeyframes) return;
      e.preventDefault();
      setScrubbing(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updateScrubber(e);
    },
    [isGuided, hasKeyframes, setScrubbing],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!tour.scrubbing) return;
      updateScrubber(e);
    },
    [tour.scrubbing],
  );

  const handlePointerUp = useCallback(() => {
    setScrubbing(false);
  }, [setScrubbing]);

  const updateScrubber = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const t = Math.max(0, Math.min(1, x));
    setScrubberT(t);
  };

  const disabled = !isGuided || !hasKeyframes;
  const markerPos = isGuided ? tour.t * 100 : 0;

  return (
    <div className={`tour-scrubber${disabled ? " disabled" : ""}`}>
      <header>Scrub</header>
      <div
        ref={trackRef}
        className="scrubber-track"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="slider"
        aria-label="tour scrubber"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={tour.t}
        aria-valuetext={`${(tour.t * 100).toFixed(0)}%`}
        tabIndex={disabled ? -1 : 0}
      >
        <div className="scrubber-fill" style={{ width: `${markerPos}%` }} />
        <div className="scrubber-marker" style={{ left: `${markerPos}%` }} />
        {isGuided && tour.keyframes.map((kf, i) => {
          const pos = (i / Math.max(1, tour.keyframes.length - 1)) * 100;
          return <div key={kf.id} className="scrubber-keyframe-tick" style={{ left: `${pos}%` }} />;
        })}
      </div>
      <div className="scrubber-labels">
        <span>0</span>
        <span>{((tour.t ?? 0) * 100).toFixed(0)}%</span>
        <span>1</span>
      </div>
    </div>
  );
}
