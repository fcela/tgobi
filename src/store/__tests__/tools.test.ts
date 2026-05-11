import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { bitGet } from "@/lib/brush/hitTest";

beforeEach(() => {
  useAppStore.getState().resetIdentifyFor(0);
  useAppStore.getState().setActiveTool("brush");
});

describe("ToolsSlice", () => {
  it("defaults to brush", () => {
    expect(useAppStore.getState().tools.active).toBe("brush");
    expect(useAppStore.getState().tools.hoverRow).toBeNull();
    expect(useAppStore.getState().tools.pinnedRows.length).toBe(0);
  });
  it("setActiveTool to identify", () => {
    useAppStore.getState().setActiveTool("identify");
    expect(useAppStore.getState().tools.active).toBe("identify");
  });

  it("tracks hovered and pinned identified rows", () => {
    useAppStore.getState().resetIdentifyFor(4);
    useAppStore.getState().setIdentifyHover(2);
    useAppStore.getState().togglePinnedIdentify(2);
    expect(useAppStore.getState().tools.hoverRow).toBe(2);
    expect(bitGet(useAppStore.getState().tools.pinnedRows, 2)).toBe(true);

    useAppStore.getState().togglePinnedIdentify(2);
    expect(bitGet(useAppStore.getState().tools.pinnedRows, 2)).toBe(false);
  });

  it("clears pinned rows and label variable", () => {
    useAppStore.getState().resetIdentifyFor(4);
    useAppStore.getState().setIdentifyLabelVar("name");
    useAppStore.getState().togglePinnedIdentify(1);
    useAppStore.getState().clearPinnedIdentify();
    expect(useAppStore.getState().tools.labelVar).toBe("name");
    expect(bitGet(useAppStore.getState().tools.pinnedRows, 1)).toBe(false);

    useAppStore.getState().resetIdentifyFor(2);
    expect(useAppStore.getState().tools.labelVar).toBeNull();
    expect(useAppStore.getState().tools.pinnedRows.length).toBe(1);
  });
});
