import { useState } from "react";
import type { ReactNode } from "react";

export interface LayoutProps {
  toolbar: ReactNode;
  left: ReactNode;
  main: ReactNode;
  right: ReactNode;
  status: ReactNode;
}

export function Layout({ toolbar, left, main, right, status }: LayoutProps) {
  const [leftOpen, setLeftOpen] = useState(false);

  return (
    <div className="app-shell">
      <div className="app-toolbar" role="toolbar">
        {toolbar}
      </div>
      <div className={`app-body${leftOpen ? " left-open" : ""}`}>
        {leftOpen ? (
          <aside className="app-side left" aria-label="variables">
            <button
              className="side-close"
              aria-label="hide variables panel"
              onClick={() => setLeftOpen(false)}
            >
              x
            </button>
            {left}
          </aside>
        ) : (
          <button
            className="side-rail"
            aria-label="show variables panel"
            onClick={() => setLeftOpen(true)}
          >
            Variables
          </button>
        )}
        <main className="app-main">{main}</main>
        <aside className="app-side right" aria-label="tour and views">{right}</aside>
      </div>
      <div className="app-statusbar" role="status">{status}</div>
    </div>
  );
}
