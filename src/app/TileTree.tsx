import { useCallback, useRef } from "react";
import type { TileNode, TileId } from "@/store/types";
import { useAppStore } from "@/store";
import { TileLeaf } from "./TileLeaf";

interface TileTreeProps {
  node: TileNode;
}

export function TileTree({ node }: TileTreeProps) {
  const resizeSplit = useAppStore((s) => s.resizeSplit);

  const dragRef = useRef<{ tileId: TileId; startPos: number; startRatio: number; direction: "horizontal" | "vertical" } | null>(null);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent, tileId: TileId, direction: "horizontal" | "vertical", ratio: number) => {
      e.preventDefault();
      const startPos = direction === "horizontal" ? e.clientX : e.clientY;
      dragRef.current = { tileId, startPos, startRatio: ratio, direction };

      const onMove = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const parent = (e.target as HTMLElement).parentElement;
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        const size = d.direction === "horizontal" ? rect.width : rect.height;
        if (size <= 0) return;
        const delta = d.direction === "horizontal" ? ev.clientX - d.startPos : ev.clientY - d.startPos;
        const newRatio = d.startRatio + delta / size;
        resizeSplit(d.tileId, newRatio);
      };

      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [resizeSplit],
  );

  if (node.type === "leaf") {
    return <TileLeaf node={node} />;
  }

  const isHorizontal = node.direction === "horizontal";
  const style: React.CSSProperties = {
    display: "flex",
    flexDirection: isHorizontal ? "row" : "column",
    flex: "1 1 0",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  };

  const firstStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    flex: `${node.ratio} 1 0`,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  };

  const secondStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    flex: `${1 - node.ratio} 1 0`,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  };

  const handleStyle: React.CSSProperties = isHorizontal
    ? { width: 4, cursor: "col-resize", background: "var(--border)", flexShrink: 0 }
    : { height: 4, cursor: "row-resize", background: "var(--border)", flexShrink: 0 };

  return (
    <div style={style}>
      <div style={firstStyle}>
        <TileTree node={node.first} />
      </div>
      <div
        style={handleStyle}
        onMouseDown={(e) => onHandleMouseDown(e, node.id, node.direction, node.ratio)}
      />
      <div style={secondStyle}>
        <TileTree node={node.second} />
      </div>
    </div>
  );
}
