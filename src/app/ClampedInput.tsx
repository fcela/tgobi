import { useState, useCallback } from "react";

interface ClampedInputProps {
  value: number;
  min: number;
  max: number;
  ariaLabel: string;
  onChange: (v: number) => void;
}

export function ClampedInput({ value, min, max, ariaLabel, onChange }: ClampedInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(value);

  const commit = useCallback(() => {
    const parsed = parseInt(draft ?? "", 10);
    if (Number.isNaN(parsed)) {
      setDraft(null);
      return;
    }
    const clamped = Math.max(min, Math.min(max, parsed));
    onChange(clamped);
    setDraft(null);
  }, [draft, min, max, onChange]);

  return (
    <input
      type="number"
      min={min}
      max={max}
      value={display}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
    />
  );
}
