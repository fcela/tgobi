import { useAppStore } from "@/store";

export function KeyframeGallery() {
  const keyframes = useAppStore((s) => s.tour.keyframes);
  const removeKeyframe = useAppStore((s) => s.removeKeyframe);
  const activeVars = useAppStore((s) => s.tour.activeVars);
  const shape = useAppStore((s) => s.tour.shape);

  if (keyframes.length === 0) {
    return (
      <div className="keyframe-gallery empty">
        <span>No keyframes yet. Save views then add them as keyframes, or add the current projection.</span>
      </div>
    );
  }

  const k = shape === "2d" ? 2 : 1;

  return (
    <div className="keyframe-gallery" aria-label="keyframe gallery">
      <header>Keyframes ({keyframes.length})</header>
      <div className="gallery-grid">
        {keyframes.map((kf) => (
          <div key={kf.id} className="keyframe-thumb">
            <ProjectionThumbnail basis={kf.basis} vars={activeVars} k={k} />
            <div className="keyframe-meta">
              <span className="keyframe-name">{kf.name}</span>
              <span className="keyframe-source">{kf.source}</span>
            </div>
            <button
              type="button"
              className="keyframe-remove"
              aria-label={`remove keyframe ${kf.name}`}
              onClick={() => removeKeyframe(kf.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProjectionThumbnail({
  basis,
  vars,
  k,
}: {
  basis: Float64Array;
  vars: string[];
  k: number;
}) {
  const W = 48, H = 48;

  if (k === 2) {
    const coords: Array<{ x: number; y: number; label: string }> = [];
    for (let i = 0; i < vars.length; i++) {
      const bx = basis[i * 2] ?? 0;
      const by = basis[i * 2 + 1] ?? 0;
      coords.push({ x: bx, y: by, label: vars[i]! });
    }
    const maxR = Math.max(0.01, ...coords.map((c) => Math.sqrt(c.x * c.x + c.y * c.y)));
    const scale = (W / 2 - 4) / maxR;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="thumb-svg">
        <circle cx={W / 2} cy={H / 2} r={W / 2 - 2} fill="none" stroke="var(--border)" strokeWidth={0.5} />
        {coords.map((c) => (
          <line
            key={c.label}
            x1={W / 2} y1={H / 2}
            x2={W / 2 + c.x * scale} y2={H / 2 - c.y * scale}
            stroke="var(--accent)" strokeWidth={1}
          />
        ))}
      </svg>
    );
  }

  const vals = Array.from({ length: vars.length }, (_, i) => basis[i] ?? 0);
  const maxV = Math.max(0.01, ...vals.map(Math.abs));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="thumb-svg">
      <line x1={4} y1={H / 2} x2={W - 4} y2={H / 2} stroke="var(--border)" strokeWidth={0.5} />
      {vals.map((v, i) => (
        <circle
          key={vars[i]}
          cx={W / 2 + (v / maxV) * (W / 2 - 6)}
          cy={H / 2}
          r={2}
          fill="var(--accent)"
        />
      ))}
    </svg>
  );
}
