import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store";

const MAX_SCATMAT_DEFAULT = 6;

export function AddPlotMenu() {
  const df = useAppStore((s) => s.df);
  const addScatter = useAppStore((s) => s.addScatter);
  const addBarchart = useAppStore((s) => s.addBarchart);
  const addDotplot = useAppStore((s) => s.addDotplot);
  const addScatmat = useAppStore((s) => s.addScatmat);
  const addParcoords = useAppStore((s) => s.addParcoords);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [kind, setKind] = useState<"scatter" | "barchart" | "dotplot" | "scatmat" | "parcoords">("scatter");

  const numericVars = useMemo(() => {
    if (!df) return [];
    return df.columns.filter((c) => c.type === "numeric" || c.type === "integer").map((c) => c.name);
  }, [df]);
  const barVars = useMemo(() => df?.columns.map((c) => c.name) ?? [], [df]);

  const [x, setX] = useState<string>("");
  const [y, setY] = useState<string>("");
  const [barVar, setBarVar] = useState<string>("");
  const [dotVar, setDotVar] = useState<string>("");
  const [scatmatVars, setScatmatVars] = useState<Set<string>>(new Set());
  const [parcoordsVars, setParcoordsVars] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (numericVars.length >= 2) { setX(numericVars[0]!); setY(numericVars[1]!); }
    else if (numericVars.length === 1) { setX(numericVars[0]!); setY(numericVars[0]!); }
  }, [numericVars]);
  useEffect(() => {
    if (barVars.length > 0) setBarVar(barVars[0]!);
  }, [barVars]);
  useEffect(() => {
    if (numericVars.length > 0) setDotVar(numericVars[0]!);
  }, [numericVars]);
  useEffect(() => {
    if (numericVars.length < 2 && barVars.length > 0) setKind("barchart");
  }, [numericVars.length, barVars.length]);
  useEffect(() => {
    // Default: select first up-to-6 numeric vars for scatmat and parcoords
    const defaults = numericVars.slice(0, MAX_SCATMAT_DEFAULT);
    setScatmatVars(new Set(defaults));
    setParcoordsVars(new Set(defaults));
  }, [numericVars]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const submit = () => {
    if (kind === "scatter") {
      if (!x || !y) return;
      addScatter(x, y);
    } else if (kind === "barchart") {
      if (!barVar) return;
      addBarchart(barVar);
    } else if (kind === "scatmat") {
      const selected = numericVars.filter((v) => scatmatVars.has(v));
      if (selected.length < 2) return;
      addScatmat(selected);
    } else if (kind === "parcoords") {
      const selected = numericVars.filter((v) => parcoordsVars.has(v));
      if (selected.length < 2) return;
      addParcoords(selected);
    } else {
      if (!dotVar) return;
      addDotplot(dotVar);
    }
    setOpen(false);
  };

  const disabled = !df || (
    kind === "scatter" ? numericVars.length < 2 :
    kind === "dotplot" ? numericVars.length < 1 :
    kind === "scatmat" ? numericVars.filter((v) => scatmatVars.has(v)).length < 2 :
    kind === "parcoords" ? numericVars.filter((v) => parcoordsVars.has(v)).length < 2 :
    barVars.length < 1
  );

  return (
    <div className="add-plot" ref={wrapRef}>
      <button
        className="toolbar"
        aria-label="add plot"
        disabled={!df || (numericVars.length < 2 && barVars.length < 1 && numericVars.length < 1)}
        onClick={() => setOpen((o) => !o)}
      >
        + Plot
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="add plot dialog">
          <label htmlFor="plot-kind">Type</label>
          <select
            id="plot-kind"
            aria-label="Plot type"
            value={kind}
            onChange={(e) => setKind(e.target.value as "scatter" | "barchart" | "dotplot" | "scatmat" | "parcoords")}
          >
            <option value="scatter">scatter</option>
            <option value="barchart">barchart</option>
            <option value="dotplot">dotplot</option>
            <option value="scatmat">scatmat</option>
            <option value="parcoords">parcoords</option>
          </select>
          {kind === "scatter" ? (
            <>
              <label htmlFor="x-var">X</label>
              <select id="x-var" aria-label="X variable" value={x} onChange={(e) => setX(e.target.value)}>
                {numericVars.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <label htmlFor="y-var">Y</label>
              <select id="y-var" aria-label="Y variable" value={y} onChange={(e) => setY(e.target.value)}>
                {numericVars.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </>
          ) : kind === "barchart" ? (
            <>
              <label htmlFor="bar-var">Variable</label>
              <select
                id="bar-var"
                aria-label="Bar variable"
                value={barVar}
                onChange={(e) => setBarVar(e.target.value)}
              >
                {barVars.map((n) => <option key={n} value={n}>{n || "(unnamed)"}</option>)}
              </select>
            </>
          ) : kind === "scatmat" ? (
            <>
              <label style={{ gridColumn: "span 2", marginBottom: 2 }}>Variables</label>
              <div
                aria-label="Scatmat variables"
                style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}
              >
                {numericVars.map((v) => (
                  <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      aria-label={`scatmat variable ${v}`}
                      checked={scatmatVars.has(v)}
                      onChange={(e) => {
                        const next = new Set(scatmatVars);
                        if (e.target.checked) next.add(v); else next.delete(v);
                        setScatmatVars(next);
                      }}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </>
          ) : kind === "parcoords" ? (
            <>
              <label style={{ gridColumn: "span 2", marginBottom: 2 }}>Variables</label>
              <div
                aria-label="Parcoords variables"
                style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}
              >
                {numericVars.map((v) => (
                  <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      aria-label={`parcoords variable ${v}`}
                      checked={parcoordsVars.has(v)}
                      onChange={(e) => {
                        const next = new Set(parcoordsVars);
                        if (e.target.checked) next.add(v); else next.delete(v);
                        setParcoordsVars(next);
                      }}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </>
          ) : (
            <>
              <label htmlFor="dot-var">Variable</label>
              <select
                id="dot-var"
                aria-label="Dot variable"
                value={dotVar}
                onChange={(e) => setDotVar(e.target.value)}
              >
                {numericVars.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </>
          )}
          <div className="actions">
            <button onClick={() => setOpen(false)}>Cancel</button>
            <button className="primary" disabled={disabled} onClick={submit}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
