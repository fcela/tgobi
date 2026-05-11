import { useAppStore } from "@/store";

export function VariablePanel() {
  const spec = useAppStore((s) => s.spec);
  const setIncluded = useAppStore((s) => s.setIncluded);

  if (spec.length === 0) return <div className="empty-vars">No variables loaded.</div>;

  return (
    <div className="var-list" data-testid="variable-list">
      {spec.map((v) => (
        <div key={v.name} className={`var-row${v.included ? "" : " excluded"}`}>
          <span className="name">{v.name}</span>
          <span className="type">{v.type}</span>
          <button
            className="toggle"
            aria-label={v.included ? `exclude ${v.name}` : `include ${v.name}`}
            onClick={() => setIncluded(v.name, !v.included)}
          >
            {v.included ? "●" : "○"}
          </button>
        </div>
      ))}
    </div>
  );
}
