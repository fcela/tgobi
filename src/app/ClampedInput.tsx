import { useState, useCallback } from "react";

interface ClampedInputProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  ariaLabel: string;
  onChange: (v: number) => void;
}

export function ClampedInput({ value, min, max, step = 1, ariaLabel, onChange }: ClampedInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(value);

  const commit = useCallback(() => {
    const parsed = parseFloat(draft ?? "");
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
      step={step}
      value={display}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
    />
  );
}
