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
  const addMissingPattern = useAppStore((s) => s.addMissingPattern);
  const addTimeseries = useAppStore((s) => s.addTimeseries);
  const addBoxplot = useAppStore((s) => s.addBoxplot);
  const addAndrews = useAppStore((s) => s.addAndrews);
  const addConcentric = useAppStore((s) => s.addConcentric);
  const addMapper = useAppStore((s) => s.addMapper);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [kind, setKind] = useState<"scatter" | "barchart" | "dotplot" | "boxplot" | "scatmat" | "parcoords" | "andrews" | "concentric" | "missingPattern" | "timeseries" | "mapper">("scatter");

  const numericVars = useMemo(() => {
    if (!df) return [];
    return df.columns.filter((c) => c.type === "numeric" || c.type === "integer").map((c) => c.name);
  }, [df]);
  const barVars = useMemo(() => df?.columns.map((c) => c.name) ?? [], [df]);
  const catVars = useMemo(() => {
    if (!df) return [];
    return df.columns.filter((c) => c.type === "categorical").map((c) => c.name);
  }, [df]);

  const [x, setX] = useState<string>("");
  const [y, setY] = useState<string>("");
  const [barVar, setBarVar] = useState<string>("");
  const [dotVar, setDotVar] = useState<string>("");
  const [boxVar, setBoxVar] = useState<string>("");
  const [boxGroup, setBoxGroup] = useState<string>("");
  const [scatmatVars, setScatmatVars] = useState<Set<string>>(new Set());
  const [parcoordsVars, setParcoordsVars] = useState<Set<string>>(new Set());
  const [andrewsVars, setAndrewsVars] = useState<Set<string>>(new Set());
  const [concentricVars, setConcentricVars] = useState<Set<string>>(new Set());
  const [tsX, setTsX] = useState<string>("");
  const [tsY, setTsY] = useState<Set<string>>(new Set());
  const [tsGroup, setTsGroup] = useState<string>("");
  const [tsDisplay, setTsDisplay] = useState<"points" | "lines" | "points+lines">("points+lines");

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
    if (numericVars.length > 0) setBoxVar(numericVars[0]!);
    setBoxGroup("");
  }, [numericVars]);
  useEffect(() => {
    if (numericVars.length < 2 && barVars.length > 0) setKind("barchart");
  }, [numericVars.length, barVars.length]);
  useEffect(() => {
    const defaults = numericVars.slice(0, MAX_SCATMAT_DEFAULT);
    setScatmatVars(new Set(defaults));
    setParcoordsVars(new Set(defaults));
    setAndrewsVars(new Set(defaults));
    setConcentricVars(new Set(defaults));
  }, [numericVars]);
  useEffect(() => {
    if (numericVars.length >= 1) setTsX(numericVars[0]!);
    if (numericVars.length >= 2) setTsY(new Set([numericVars[1]!]));
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
    } else if (kind === "andrews") {
      const selected = numericVars.filter((v) => andrewsVars.has(v));
      if (selected.length < 2) return;
      addAndrews(selected);
    } else if (kind === "concentric") {
      const selected = numericVars.filter((v) => concentricVars.has(v));
      if (selected.length < 2) return;
      addConcentric(selected);
  } else if (kind === "missingPattern") {
      addMissingPattern();
    } else if (kind === "boxplot") {
      if (!boxVar) return;
      addBoxplot(boxVar, boxGroup || null);
    } else if (kind === "timeseries") {
      const yList = numericVars.filter((v) => tsY.has(v));
      if (!tsX || yList.length === 0) return;
      addTimeseries(tsX, yList, tsGroup || null, tsDisplay);
    } else if (kind === "mapper") {
      addMapper();
    } else {
      if (!dotVar) return;
      addDotplot(dotVar);
    }
    setOpen(false);
  };

  const disabled = !df || (kind === "missingPattern" ? false :
    kind === "mapper" ? false :
    kind === "scatter" ? numericVars.length < 2 :
    kind === "dotplot" ? numericVars.length < 1 :
    kind === "boxplot" ? numericVars.length < 1 :
    kind === "scatmat" ? numericVars.filter((v) => scatmatVars.has(v)).length < 2 :
    kind === "parcoords" ? numericVars.filter((v) => parcoordsVars.has(v)).length < 2 :
    kind === "andrews" ? numericVars.filter((v) => andrewsVars.has(v)).length < 2 :
    kind === "concentric" ? numericVars.filter((v) => concentricVars.has(v)).length < 2 :
    kind === "timeseries" ? !tsX || numericVars.filter((v) => tsY.has(v)).length < 1 :
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
          onChange={(e) => setKind(e.target.value as "scatter" | "barchart" | "dotplot" | "boxplot" | "scatmat" | "parcoords" | "andrews" | "concentric" | "missingPattern" | "timeseries" | "mapper")}
        >
          <option value="scatter">scatter</option>
          <option value="barchart">barchart</option>
          <option value="dotplot">dotplot</option>
        <option value="boxplot">boxplot</option>
          <option value="scatmat">scatmat</option>
          <option value="parcoords">parcoords</option>
        <option value="andrews">andrews curves</option>
        <option value="concentric">concentric coords</option>
          <option value="missingPattern">missing pattern</option>
        <option value="timeseries">timeseries</option>
        <option value="mapper">mapper</option>
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
    ) : kind === "andrews" ? (
      <>
        <label style={{ gridColumn: "span 2", marginBottom: 2 }}>Variables</label>
        <div
          aria-label="Andrews variables"
          style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}
        >
          {numericVars.map((v) => (
            <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                aria-label={`andrews variable ${v}`}
                checked={andrewsVars.has(v)}
                onChange={(e) => {
                  const next = new Set(andrewsVars);
                  if (e.target.checked) next.add(v); else next.delete(v);
                  setAndrewsVars(next);
                }}
              />
              {v}
            </label>
          ))}
        </div>
      </>
    ) : kind === "concentric" ? (
      <>
        <label style={{ gridColumn: "span 2", marginBottom: 2 }}>Variables</label>
        <div
          aria-label="Concentric coordinates variables"
          style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}
        >
          {numericVars.map((v) => (
            <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
              <input
                type="checkbox"
                aria-label={`concentric variable ${v}`}
                checked={concentricVars.has(v)}
                onChange={(e) => {
                  const next = new Set(concentricVars);
                  if (e.target.checked) next.add(v); else next.delete(v);
                  setConcentricVars(next);
                }}
              />
              {v}
            </label>
          ))}
        </div>
      </>
) : kind === "missingPattern" ? (
  <label style={{ gridColumn: "span 2" }}>Shows missingness patterns across all variables</label>
) : kind === "timeseries" ? (
  <>
    <label htmlFor="ts-x">X (time)</label>
    <select id="ts-x" aria-label="Timeseries X variable" value={tsX} onChange={(e) => setTsX(e.target.value)}>
      {numericVars.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
    <label style={{ gridColumn: "span 2", marginBottom: 2 }}>Y variables</label>
    <div
      aria-label="Timeseries Y variables"
      style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflowY: "auto" }}
    >
      {numericVars.map((v) => (
        <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            aria-label={`timeseries y variable ${v}`}
            checked={tsY.has(v)}
            onChange={(e) => {
              const next = new Set(tsY);
              if (e.target.checked) next.add(v); else next.delete(v);
              setTsY(next);
            }}
          />
          {v}
        </label>
      ))}
    </div>
    {catVars.length > 0 && (
      <>
        <label htmlFor="ts-group">Group</label>
        <select id="ts-group" aria-label="Timeseries group variable" value={tsGroup} onChange={(e) => setTsGroup(e.target.value)}>
          <option value="">(none)</option>
          {catVars.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </>
    )}
    <label htmlFor="ts-display">Display</label>
    <select id="ts-display" aria-label="Timeseries display mode" value={tsDisplay} onChange={(e) => setTsDisplay(e.target.value as "points" | "lines" | "points+lines")}>
      <option value="points+lines">points + lines</option>
      <option value="lines">lines only</option>
      <option value="points">points only</option>
        </select>
        </>
      ) : kind === "mapper" ? (
        <label style={{ gridColumn: "span 2" }}>Displays the Mapper TDA graph. Configure in the Mapper tab first, then add this plot.</label>
      ) : kind === "boxplot" ? (
<>
  <label htmlFor="box-var">Variable</label>
  <select
    id="box-var"
    aria-label="Boxplot variable"
    value={boxVar}
    onChange={(e) => setBoxVar(e.target.value)}
  >
    {numericVars.map((n) => <option key={n} value={n}>{n}</option>)}
  </select>
  {catVars.length > 0 && (
    <>
      <label htmlFor="box-group">Group</label>
      <select id="box-group" aria-label="Boxplot group variable" value={boxGroup} onChange={(e) => setBoxGroup(e.target.value)}>
        <option value="">(none)</option>
        {catVars.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </>
  )}
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
