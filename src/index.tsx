import { useEffect, type CSSProperties } from "react";
import { App } from "./app/App";
import { useAppStore } from "./store";
import type { DataFrame } from "./lib/data/types";
import "./styles/global.css";

export interface TgobiProps {
  data?: DataFrame | null;
  className?: string;
  style?: CSSProperties;
}

export function Tgobi({ data, className, style }: TgobiProps) {
  const setData = useAppStore((s) => s.setData);
  const setSpec = useAppStore((s) => s.setSpec);

  useEffect(() => {
    if (!data) return;
    setData(data);
    setSpec(data.columns.map((c) => ({ name: c.name, type: c.type, included: true })));
  }, [data, setData, setSpec]);

  return (
    <div className={className ? `tgobi-root ${className}` : "tgobi-root"} style={style}>
      <App />
    </div>
  );
}

export { App };
export type { Column, ColumnType, DataFrame } from "./lib/data/types";
