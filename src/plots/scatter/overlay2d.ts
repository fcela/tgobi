import type { HullOverlay } from "@/plots/scatter/types";

export function drawHullOverlay(
  ctx: CanvasRenderingContext2D,
  hullOverlay: HullOverlay | null | undefined,
): void {
  if (!hullOverlay || hullOverlay.hulls.length === 0) return;
  ctx.save();
  for (const hull of hullOverlay.hulls) {
    if (hull.points.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(hull.points[0]!.x, hull.points[0]!.y);
    for (let i = 1; i < hull.points.length; i++) {
      ctx.lineTo(hull.points[i]!.x, hull.points[i]!.y);
    }
    ctx.closePath();
    ctx.globalAlpha = Math.min(0.16, hull.alpha * 0.18);
    ctx.fillStyle = hull.fill;
    ctx.fill();
    ctx.globalAlpha = hull.alpha;
    ctx.strokeStyle = hull.stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}
