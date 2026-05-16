import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface HelpPopoverProps {
  content: React.ReactNode;
}

export function HelpPopover({ content }: HelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const pw = 280;
      const gap = 6;
      let left = rect.left + rect.width / 2 - pw / 2;
      left = Math.max(4, Math.min(left, window.innerWidth - pw - 4));
      setPos({ left, top: rect.bottom + gap });
    };
    update();
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <span className="help-popover-wrap">
      <button
        type="button"
        className="help-popover-trigger"
        aria-label="help"
        ref={triggerRef}
        onClick={handleClick}
      >
        ?
      </button>
      {open && pos && createPortal(
        <div
          className="help-popover help-popover-portal"
          ref={popoverRef}
          role="tooltip"
          style={{ left: pos.left, top: pos.top }}
        >
          {content}
        </div>,
        document.body,
      )}
    </span>
  );
}
