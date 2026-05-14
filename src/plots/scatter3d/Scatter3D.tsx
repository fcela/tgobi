import { useEffect, useMemo, useRef, useState } from "react";
import { Regl3DScatterRenderer } from "@/plots/scatter3d/regl3dRenderer";
import type { Scatter3DPanel } from "@/store/types";
import type {
  Camera3D,
  Scatter3DRenderState,
  Scatter3DTransform,
} from "@/plots/scatter3d/types";
import { useAppStore } from "@/store";
import { bitGet, bitSet, type Point2D } from "@/lib/brush/hitTest";
import { KdTree2D } from "@/lib/brush/kdtree";
import { pointsInRect, pointsInEllipse, pointsInPolygon } from "@/lib/brush/hitTest";
import { categoricalScale, sequentialScale, divergingScale } from "@/lib/color/scales";
import { getPalette } from "@/lib/color/palettes";
import { formatRowLabel } from "@/lib/data/format";
import { resolveScaledValues } from "@/lib/data/resolveScaling";

const FIXED_FALLBACK = "#88c";
const DEFAULT_POINT_SIZE = 3;
const ORBIT_SENSITIVITY = 0.006;
const ZOOM_SENSITIVITY = 0.002;

export interface Scatter3DProps {
  panel: Scatter3DPanel;
}

export function Scatter3D({ panel }: Scatter3DProps) {
  const df = useAppStore((s) => s.df);
  const spec = useAppStore((s) => s.spec);
  const selection = useAppStore((s) => s.selection);
  const colorState = useAppStore((s) => s.color);
  const brush = useAppStore((s) => s.brush);
  const tools = useAppStore((s) => s.tools);
  const activeTool = useAppStore((s) => s.tools.active);
  const setIdentifyHover = useAppStore((s) => s.setIdentifyHover);
  const togglePinnedIdentify = useAppStore((s) => s.togglePinnedIdentify);
  const setActiveBrush = useAppStore((s) => s.setActiveBrush);
  const setSelectionMask = useAppStore((s) => s.setSelectionMask);
  const setSelectionPaint = useAppStore((s) => s.setSelectionPaint);
  const setSelectionShape = useAppStore((s) => s.setSelectionShape);
  const removePanel = useAppStore((s) => s.removePanel);
  const setScatter3DCamera = useAppStore((s) => s.setScatter3DCamera);
  const setScatter3DDepthCue = useAppStore((s) => s.setScatter3DDepthCue);

  const tourProj = useAppStore((s) => s.tour.proj);
  const tourActivePanelId = useAppStore((s) => s.tour.activePanelId);
  const tourActiveVars = useAppStore((s) => s.tour.activeVars);
  const isTourActive = false;

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Regl3DScatterRenderer | null>(null);
  const treeRef = useRef<KdTree2D | null>(null);

  const [tip, setTip] = useState<{ i: number; px: number; py: number } | null>(null);
  const [labels, setLabels] = useState<Array<{ i: number; x: number; y: number; label: string }>>([]);
  const [alpha, setAlpha] = useState<number | null>(null);
  const [pointSize, setPointSize] = useState(DEFAULT_POINT_SIZE);
  const [localCamera, setLocalCamera] = useState<Camera3D | null>(panel.camera ?? null);
  const [webglFailed, setWebglFailed] = useState(false);

  const xCol = df?.column(panel.x);
  const yCol = df?.column(panel.y);
  const zCol = df?.column(panel.z);

  const xSpec = spec.find((v) => v.name === panel.x);
  const ySpec = spec.find((v) => v.name === panel.y);
  const zSpec = spec.find((v) => v.name === panel.z);

  const xScaled = useMemo(() => xCol ? resolveScaledValues(xCol, xSpec) : undefined, [xCol, xSpec?.scaling]);
  const yScaled = useMemo(() => yCol ? resolveScaledValues(yCol, ySpec) : undefined, [yCol, ySpec?.scaling]);
  const zScaled = useMemo(() => zCol ? resolveScaledValues(zCol, zSpec) : undefined, [zCol, zSpec?.scaling]);

  const colors: ReadonlyArray<string> = useMemo(() => {
    if (!df) return [];
    const n = df.nrow;
    const out = new Array<string>(n).fill(FIXED_FALLBACK);
    const enc = colorState.encoding;
    if (enc.kind === "byVar") {
      const c = df.column(enc.var);
      if (!c) return out;
      const palette = getPalette(colorState.palette);
      let scale: ((i: number) => string) | null = null;
      if (enc.scale === "categorical" && c.type === "categorical") {
        scale = categoricalScale(c, palette);
      } else if (
        (enc.scale === "sequential" || enc.scale === "diverging") &&
        (c.type === "numeric" || c.type === "integer")
      ) {
        scale =
          enc.scale === "sequential"
            ? sequentialScale(c, palette)
            : divergingScale(c, palette);
      }
      if (scale) for (let i = 0; i < n; i++) out[i] = scale(i);
    }
    return out;
  }, [df, colorState.encoding, colorState.palette]);

  const paintPalette = useMemo(() => getPalette(colorState.palette), [colorState.palette]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const r = new Regl3DScatterRenderer();
      r.attach(canvas);
      rendererRef.current = r;
      setWebglFailed(false);
    } catch (e) {
      console.warn("[scatter3d] WebGL not supported.", e);
      setWebglFailed(true);
    }
    return () => {
      rendererRef.current?.detach();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const body = bodyRef.current;
    const canvas = canvasRef.current;
    if (!body || !canvas) return;
    let lastW = 0, lastH = 0;
    const ro = new ResizeObserver((entries) => {
      const r = rendererRef.current;
      if (!r) return;
      for (const entry of entries) {
        const w = Math.max(1, Math.floor(entry.contentBoxSize[0]?.inlineSize ?? entry.contentRect.width));
        const h = Math.max(1, Math.floor(entry.contentBoxSize[0]?.blockSize ?? entry.contentRect.height));
        if (w === lastW && h === lastH) return;
        lastW = w; lastH = h;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    r.setSize(w, h);
        treeRef.current = null;
        requestPaint();
      }
    });
    ro.observe(body);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !df) return;

    if (isTourActive && tourProj) {
      const n = df.nrow;
      const xs = new Float64Array(n);
      const ys = new Float64Array(n);
      const zs = new Float64Array(n);
      const xm = new Uint8Array(Math.ceil(n / 8));
      const ym = new Uint8Array(Math.ceil(n / 8));
      const zm = new Uint8Array(Math.ceil(n / 8));
      for (let i = 0; i < n; i++) {
        xs[i] = tourProj[i * 3]!;
        ys[i] = tourProj[i * 3 + 1]!;
        zs[i] = tourProj[i * 3 + 2]!;
      }
      r.setData(xs, ys, zs, xm, ym, zm);
    } else {
      if (!xCol || !yCol || !zCol) return;
      if (!xScaled || !yScaled || !zScaled) return;
      r.setData(xScaled.values, yScaled.values, zScaled.values, xScaled.missingBuffer, yScaled.missingBuffer, zScaled.missingBuffer);
    }
    const cam = localCamera;
    if (cam) r.setCamera(cam);
    treeRef.current = null;
    requestPaint();
  }, [df, panel.x, panel.y, panel.z, xCol, yCol, zCol, xScaled, yScaled, zScaled, isTourActive, tourProj]);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    if (localCamera) r.setCamera(localCamera);
    treeRef.current = null;
    requestPaint();
  }, [localCamera]);

  const paintHandle = useRef<number | null>(null);

  const requestPaint = () => {
    if (paintHandle.current != null) return;
    let firedSynchronously = false;
    const handle = requestAnimationFrame(() => {
      firedSynchronously = true;
      paintHandle.current = null;
      paint();
    });
    if (!firedSynchronously) paintHandle.current = handle;
  };

  const paint = () => {
    const r = rendererRef.current;
    if (!r || !df) return;
    const n = df.nrow;
    const defaultAlpha = n > 50000 ? Math.max(0.15, 0.65 * Math.sqrt(50000 / n)) : 0.65;
    const effectiveAlpha = alpha ?? defaultAlpha;
    const visual: Scatter3DRenderState = {
      color: colors,
      alpha: effectiveAlpha,
      pointSize,
      selected: selection.mask,
      paint: selection.paint,
      shadow: selection.shadow,
      paintPalette,
      depthCue: panel.depthCue,
    };
    r.draw(visual);
    updatePinnedLabels(r);
    rebuildKdTree(r);
  };

  function rebuildKdTree(r: Regl3DScatterRenderer) {
    if (!df || treeRef.current) return;
    const t = r.transform();
    const n = df.nrow;
    const xy = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p = projectRow(i, t);
      if (!p) { xy[2 * i] = NaN; xy[2 * i + 1] = NaN; }
      else { xy[2 * i] = p.px; xy[2 * i + 1] = p.py; }
    }
    try { treeRef.current = new KdTree2D(xy); } catch { treeRef.current = null; }
  }

  function projectRow(row: number, t: Scatter3DTransform) {
    if (isTourActive && tourProj && df) {
      if (row < 0 || row >= df.nrow) return null;
      return t.project(tourProj[row * 3]!, tourProj[row * 3 + 1]!, tourProj[row * 3 + 2]!);
    }
    if (!xScaled || !yScaled || !zScaled) return null;
    if (
      bitGet(xScaled.missingBuffer, row) ||
      bitGet(yScaled.missingBuffer, row) ||
      bitGet(zScaled.missingBuffer, row)
    ) return null;
    const xv = xScaled.values;
    const yv = yScaled.values;
    const zv = zScaled.values;
    return t.project(xv[row]!, yv[row]!, zv[row]!);
  }

  function updatePinnedLabels(r: Regl3DScatterRenderer) {
    if (!df) return;
    const t = r.transform();
    const next: Array<{ i: number; x: number; y: number; label: string }> = [];
    for (let i = 0; i < df.nrow; i++) {
      if (!bitGet(tools.pinnedRows, i)) continue;
      const p = projectRow(i, t);
      if (!p) continue;
      next.push({ i, x: p.px + 6, y: p.py - 8, label: formatRowLabel(df, i, tools.labelVar) });
    }
    setLabels((prev) => sameLabels(prev, next) ? prev : next);
  }

  useEffect(() => {
    treeRef.current = null;
    requestPaint();
  }, [df, colors, selection, brush.activeRect, brush.activePath, brush.activePanelId, brush.tool, paintPalette, alpha, pointSize, panel.depthCue, tools.pinnedRows, tools.labelVar, colorState.encoding, tourProj]);

  const orbitRef = useRef<{
    startX: number;
    startY: number;
    startTheta: number;
    startPhi: number;
    startDist: number;
    centerX: number;
    centerY: number;
    centerZ: number;
  } | null>(null);

  const dragRef = useRef<{
    x0: number;
    y0: number;
    tool: typeof brush.tool;
    path: Point2D[] | null;
    localMask: Uint8Array;
    currentRect: { x0: number; y0: number; x1: number; y1: number };
  } | null>(null);

  const applyCamera = (next: Camera3D) => {
    setLocalCamera(next);
    setScatter3DCamera(panel.id, next);
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const r = rendererRef.current;
    if (!r) return;
    const bounds = r.getDataBounds();
    const cam: Camera3D = localCamera ?? {
      theta: 0.5, phi: 0.4,
      distance: 3,
      centerX: (bounds.xMin + bounds.xMax) / 2,
      centerY: (bounds.yMin + bounds.yMax) / 2,
      centerZ: (bounds.zMin + bounds.zMax) / 2,
    };
    cam.distance = Math.max(0.5, cam.distance * (e.deltaY < 0 ? 0.9 : 1.1));
    applyCamera(cam);
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvasRect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;

    if (e.shiftKey || e.button === 1) {
      if (activeTool === "brush") {
        if (!df) return;
        const local = new Uint8Array(Math.ceil(df.nrow / 8));
        const path = brush.tool === "lasso" ? [{ x, y }] : null;
        const currentRect = { x0: x, y0: y, x1: x, y1: y };
        dragRef.current = { x0: x, y0: y, tool: brush.tool, path, localMask: local, currentRect };
        setActiveBrush(panel.id, currentRect, path);
        return;
      }
    }

    if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
      return;
    }

    if (activeTool === "identify") {
      if (!df || !treeRef.current) return;
      const i = treeRef.current.nearest(x, y);
      if (i >= 0) {
        setIdentifyHover(i);
        togglePinnedIdentify(i);
      }
      return;
    }

    if (activeTool === "brush" && !e.shiftKey) {
      if (!df) return;
      const local = new Uint8Array(Math.ceil(df.nrow / 8));
      const path = brush.tool === "lasso" ? [{ x, y }] : null;
      const currentRect = { x0: x, y0: y, x1: x, y1: y };
      dragRef.current = { x0: x, y0: y, tool: brush.tool, path, localMask: local, currentRect };
      setActiveBrush(panel.id, currentRect, path);
      return;
    }

    const r = rendererRef.current;
    if (!r) return;
    const cam = localCamera ?? { theta: 0.5, phi: 0.4, distance: 3, centerX: 0, centerY: 0, centerZ: 0 };
    orbitRef.current = { startX: x, startY: y, startTheta: cam.theta, startPhi: cam.phi, startDist: cam.distance, centerX: cam.centerX, centerY: cam.centerY, centerZ: cam.centerZ };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvasRect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;

    if (dragRef.current && activeTool === "brush") {
      const drag = dragRef.current;
      const brushRect = { x0: drag.x0, y0: drag.y0, x1: x, y1: y };
      drag.currentRect = brushRect;
      drag.localMask.fill(0);
      let hits: Int32Array;
      if (drag.tool === "lasso") {
        const path = appendLassoPoint(drag.path ?? [], { x, y });
        drag.path = path;
        if (treeRef.current) hits = pointsInPolygon(treeRef.current, path);
        else hits = new Int32Array(0);
        setActiveBrush(panel.id, pathBounds(path), path);
      } else if (drag.tool === "ellipse") {
        if (treeRef.current) hits = pointsInEllipse(treeRef.current, brushRect);
        else hits = new Int32Array(0);
        setActiveBrush(panel.id, brushRect);
      } else {
        if (treeRef.current) hits = pointsInRect(treeRef.current, brushRect);
        else hits = new Int32Array(0);
        setActiveBrush(panel.id, brushRect);
      }
      for (let k = 0; k < hits.length; k++) bitSet(drag.localMask, hits[k]!);
      setSelectionMask(new Uint8Array(drag.localMask));
      return;
    }

    if (activeTool === "identify" && treeRef.current && df) {
      const i = treeRef.current.nearest(x, y);
      if (i >= 0) {
        setIdentifyHover(i);
        setTip({ i, px: x + 8, py: y + 8 });
      } else {
        setIdentifyHover(null);
        setTip(null);
      }
      return;
    }

    if (orbitRef.current) {
      const dx = x - orbitRef.current.startX;
      const dy = y - orbitRef.current.startY;
      applyCamera({
        theta: orbitRef.current.startTheta + dx * ORBIT_SENSITIVITY,
        phi: Math.max(0.05, Math.min(Math.PI - 0.05, orbitRef.current.startPhi + dy * ORBIT_SENSITIVITY)),
        distance: orbitRef.current.startDist,
        centerX: orbitRef.current.centerX,
        centerY: orbitRef.current.centerY,
        centerZ: orbitRef.current.centerZ,
      });
    }
  };

  const onMouseUp = () => {
    if (dragRef.current && activeTool === "brush") {
      if (brush.mode === "persistent" && df) {
        const { localMask } = dragRef.current;
        const nextPaint = new Uint8Array(selection.paint);
        const nextShape = new Uint8Array(selection.shape);
        for (let i = 0; i < df.nrow; i++) {
          if (bitGet(localMask, i)) {
            nextPaint[i] = brush.paintColor;
            nextShape[i] = brush.paintShape;
          }
        }
        setSelectionPaint(nextPaint);
        setSelectionShape(nextShape);
      }
      if (df) setSelectionMask(new Uint8Array(Math.ceil(df.nrow / 8)));
      dragRef.current = null;
      setActiveBrush(null, null);
      return;
    }
    orbitRef.current = null;
  };

  const onMouseLeave = () => {
    setTip(null);
    setIdentifyHover(null);
    orbitRef.current = null;
    if (dragRef.current) onMouseUp();
  };

  const resetCamera = () => {
    const r = rendererRef.current;
    if (!r) return;
    r.resetCamera();
    const bounds = r.getDataBounds();
    const diag = Math.sqrt(
      (bounds.xMax - bounds.xMin) ** 2 +
      (bounds.yMax - bounds.yMin) ** 2 +
      (bounds.zMax - bounds.zMin) ** 2
    );
    const cam: Camera3D = {
      theta: 0.5,
      phi: 0.4,
      distance: diag * 1.5 || 3,
      centerX: (bounds.xMin + bounds.xMax) / 2,
      centerY: (bounds.yMin + bounds.yMax) / 2,
      centerZ: (bounds.zMin + bounds.zMax) / 2,
    };
    applyCamera(cam);
  };

  let tipBody = "";
  if (tip && df) {
    const xv = xCol && (xCol.type === "numeric" || xCol.type === "integer") ? xCol.values[tip.i] : "?";
    const yv = yCol && (yCol.type === "numeric" || yCol.type === "integer") ? yCol.values[tip.i] : "?";
    const zv = zCol && (zCol.type === "numeric" || zCol.type === "integer") ? zCol.values[tip.i] : "?";
    tipBody = `row ${tip.i + 1}: ${panel.x}=${xv}, ${panel.y}=${yv}, ${panel.z}=${zv}`;
  }

  return (
    <div className="plot-card" data-tool={activeTool}>
      <div className="plot-head">
        <span className="vars">{isTourActive && tourActiveVars.length > 0 ? `tour: ${tourActiveVars.join(", ")}` : `${panel.x} × ${panel.y} × ${panel.z}`}</span>
        <label className="plot-slider">
          <span>Alpha</span>
          <input
            className="alpha-slider"
            type="range"
            min={0.02}
            max={1}
            step={0.02}
            value={alpha ?? (df && df.nrow > 50000 ? Math.max(0.15, 0.65 * Math.sqrt(50000 / df.nrow)) : 0.65)}
            onChange={(e) => setAlpha(parseFloat(e.target.value))}
            title="point alpha"
            aria-label="point alpha"
          />
        </label>
        <label className="plot-slider">
          <span>Size</span>
          <input
            className="point-size-slider"
            type="range"
            min={1}
            max={8}
            step={0.5}
            value={pointSize}
            onChange={(e) => setPointSize(parseFloat(e.target.value))}
            title="point size"
            aria-label="point size"
          />
        </label>
        <label className="plot-slider">
          <span>Depth</span>
          <select
            aria-label="depth cue mode"
            value={panel.depthCue}
            onChange={(e) => setScatter3DDepthCue(panel.id, e.target.value as "none" | "alpha" | "size")}
          >
            <option value="none">none</option>
            <option value="alpha">alpha</option>
            <option value="size">size</option>
          </select>
        </label>
        <div className="plot-view-controls" aria-label="3D viewport controls">
          <button type="button" aria-label="reset camera" title="reset camera" onClick={resetCamera}>
            Reset
          </button>
        </div>
        <button
          className="close"
          aria-label={`remove plot ${panel.id}`}
          onClick={() => removePanel(panel.id)}
        >
          ×
        </button>
      </div>
      <div className="plot-body" ref={bodyRef}>
      {webglFailed ? (
        <div className="plot-webgl-fallback">
          WebGL is not available in this browser. 3D scatter requires WebGL support.
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onWheel={onWheel}
            onContextMenu={(e) => e.preventDefault()}
            style={{ cursor: activeTool === "identify" ? "pointer" : activeTool === "brush" ? "crosshair" : "grab" }}
          />
          {tip && (
            <div className="plot-tooltip" style={{ left: tip.px, top: tip.py }}>
              {tipBody}
            </div>
          )}
          {labels.map((label) => (
            <div
              key={label.i}
              className="plot-label"
              style={{ left: label.x, top: label.y }}
            >
              {label.label}
            </div>
          ))}
        </>
      )}
    </div>
    </div>
  );
}

function sameLabels(
  a: ReadonlyArray<{ i: number; x: number; y: number; label: string }>,
  b: ReadonlyArray<{ i: number; x: number; y: number; label: string }>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!; const y = b[i]!;
    if (x.i !== y.i || x.x !== y.x || x.y !== y.y || x.label !== y.label) return false;
  }
  return true;
}

function appendLassoPoint(path: Point2D[], point: Point2D): Point2D[] {
  const last = path[path.length - 1];
  if (last) {
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (dx * dx + dy * dy < 9) return path;
  }
  return [...path, point];
}

function pathBounds(path: ReadonlyArray<Point2D>) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const p of path) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0, y0, x1, y1 };
}
