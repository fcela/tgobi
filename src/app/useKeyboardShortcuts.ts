import { useEffect } from "react";
import { useAppStore } from "@/store";
import { bitGet, bitSet } from "@/lib/brush/hitTest";

export const SHORTCUTS: Record<string, string> = {
  b: "Brush tool",
  i: "Identify tool",
  t: "Toggle transient / persistent",
  e: "Exclude selected",
  r: "Restore all rows",
  "Space": "Play / pause tour",
  "Esc": "Clear selection / stop tour",
};

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const store = useAppStore.getState();
      const key = e.key.toLowerCase();

      switch (key) {
        case "b":
          store.setActiveTool("brush");
          break;
        case "i":
          store.setActiveTool("identify");
          break;
        case "t":
          store.setBrushMode(store.brush.mode === "transient" ? "persistent" : "transient");
          break;
        case "e":
          if (!store.df) break;
          {
            const sh = new Uint8Array(store.selection.shadow);
            for (let r = 0; r < store.df.nrow; r++) {
              if (bitGet(store.selection.mask, r)) bitSet(sh, r);
            }
            store.setSelectionShadow(sh);
          }
          break;
        case "r":
          store.setSelectionShadow(new Uint8Array(store.selection.shadow.length));
          break;
        case " ":
          e.preventDefault();
          if (store.tour.isPlaying) store.pauseTour();
          else if (store.tour.activePanelId != null) store.resumeTour();
          break;
        case "escape":
          if (store.tour.isPlaying) {
            store.stopTour();
          } else if (store.df) {
            store.setSelectionMask(new Uint8Array(Math.ceil(store.df.nrow / 8)));
          }
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
