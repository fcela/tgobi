import { useAppStore } from "@/store";

export function VariableCircle() {
  const tour = useAppStore((s) => s.tour);
  const vars = tour.activeVars;
  const basis = tour.basis;
  if (!basis || vars.length === 0 || tour.activePanelId == null) {
    return <div className="var-circle empty">no tour active</div>;
  }
  const k = tour.shape === "2d" ? 2 : 1;
  const SZ = 140, R = 56, CX = SZ / 2, CY = SZ / 2;

  if (k === 2) {
    return (
      <svg viewBox={`0 0 ${SZ} ${SZ}`} className="var-circle" aria-label="variable circle">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" />
        {vars.map((name, i) => {
          const x = basis[i * 2]! * R;
          const y = -basis[i * 2 + 1]! * R; // SVG y inverted
          return (
            <g key={name}>
              <line x1={CX} y1={CY} x2={CX + x} y2={CY + y}
                    stroke="var(--accent)" strokeWidth={1.2} />
              <text x={CX + x * 1.12} y={CY + y * 1.12}
                    fontSize="9" fill="var(--text-dim)" textAnchor="middle">
                {name}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // k === 1
  return (
    <svg viewBox={`0 0 ${SZ} ${SZ}`} className="var-circle" aria-label="variable circle 1d">
      <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke="var(--border)" />
      {vars.map((name, i) => {
        const v = basis[i]!;
        const xEnd = CX + v * R;
        const y = CY - 6 - i * 12;
        return (
          <g key={name}>
            <line x1={CX} y1={y} x2={xEnd} y2={y} stroke="var(--accent)" strokeWidth={1.2} />
            <text x={xEnd + 4} y={y + 3} fontSize="9" fill="var(--text-dim)">{name}</text>
          </g>
        );
      })}
    </svg>
  );
}
