import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store";
import type { DeriveSpec } from "@/lib/data/types";
import type { ScalingMode } from "@/types";
import { variableMissingSummaries, rowMissingCounts } from "@/lib/data/missingness";
import { HelpPopover } from "@/app/HelpPopover";

type TransformKind = DeriveSpec["kind"];

const TRANSFORMS: Array<{ kind: TransformKind; label: string }> = [
  { kind: "log", label: "log" },
  { kind: "sqrt", label: "sqrt" },
  { kind: "standardize", label: "standardize" },
  { kind: "rank", label: "rank" },
  { kind: "negate", label: "negate" },
  { kind: "power", label: "power" },
  { kind: "jitter", label: "jitter" },
  { kind: "missingIndicator", label: "miss_ind" },
  { kind: "imputeFixed", label: "impute_fixed" },
  { kind: "imputeRandom", label: "impute_rand" },
  { kind: "imputeConditional", label: "impute_cond" },
];

const SCALING_OPTIONS: Array<{ value: ScalingMode; label: string }> = [
  { value: "range", label: "0–1" },
  { value: "standardize", label: "z-score" },
  { value: "robust", label: "robust" },
];

export function VariablePanel() {
  const spec = useAppStore((s) => s.spec);
  const setIncluded = useAppStore((s) => s.setIncluded);
  const setScaling = useAppStore((s) => s.setScaling);
  const setGroup = useAppStore((s) => s.setGroup);
  const setGroupScaling = useAppStore((s) => s.setGroupScaling);
  const deriveColumn = useAppStore((s) => s.deriveColumn);
  const deriveSphere = useAppStore((s) => s.deriveSphere);
  const df = useAppStore((s) => s.df);
  const imputation = useAppStore((s) => s.missing.imputation);
  const setImputationMethod = useAppStore((s) => s.setImputationMethod);
  const setImputationFixedValue = useAppStore((s) => s.setImputationFixedValue);
  const setImputationSeed = useAppStore((s) => s.setImputationSeed);
  const setImputationCondVar = useAppStore((s) => s.setImputationCondVar);
  const setShowMarginals = useAppStore((s) => s.setShowMarginals);
  const showMarginals = useAppStore((s) => s.missing.showMarginals);
  const imputationSets = useAppStore((s) => s.missing.imputationSets);
  const imputationIndex = useAppStore((s) => s.missing.imputationIndex);
  const setImputationSets = useAppStore((s) => s.setImputationSets);
  const cycleImputation = useAppStore((s) => s.cycleImputation);

  const missingSummaries = useMemo(() => {
    if (!df) return [];
    return variableMissingSummaries(df);
  }, [df]);

  const totalMissingRows = useMemo(() => {
    if (!df) return 0;
    const rowMiss = rowMissingCounts(df);
    return rowMiss.filter((r) => r.missing > 0).length;
  }, [df]);

  const varsMissing = missingSummaries.filter((v) => v.missing > 0);

  const transformSourceVars = useMemo(
    () => spec.filter((v) => v.type === "numeric" || v.type === "integer").map((v) => v.name),
    [spec],
  );
  const anySourceVars = useMemo(
    () => spec.map((v) => v.name),
    [spec],
  );
  const jitterSourceVars = useMemo(
    () => spec.filter((v) => v.type === "numeric" || v.type === "integer" || v.type === "categorical").map((v) => v.name),
    [spec],
  );
  const categoricalVars = useMemo(
    () => spec.filter((v) => v.type === "categorical").map((v) => v.name),
    [spec],
  );
  const existingNames = useMemo(() => new Set(spec.map((v) => v.name)), [spec]);
  const [source, setSource] = useState("");
  const [kind, setKind] = useState<TransformKind>("log");
  const [exponent, setExponent] = useState(2);
  const [jitterAmplitude, setJitterAmplitude] = useState(0.25);
  const [jitterSeed, setJitterSeed] = useState(1);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [spherePrefix, setSpherePrefix] = useState("sphere");
  const [sphereVars, setSphereVars] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");
  const [imputationFixedValue, setLocalImputationFixedValue] = useState(0);
  const [imputationSeed, setLocalImputationSeed] = useState(0);
  const [imputationCondVar, setImputationCondVarLocal] = useState<string>("");
  const effectiveKind: TransformKind =
    transformSourceVars.length === 0 && jitterSourceVars.length > 0 ? "jitter" : kind;
  const isMissingTransform = effectiveKind === "missingIndicator" || effectiveKind === "imputeFixed" || effectiveKind === "imputeRandom" || effectiveKind === "imputeConditional";
  const sourceVars = effectiveKind === "jitter" ? jitterSourceVars : isMissingTransform ? anySourceVars : transformSourceVars;
  const availableTransforms = transformSourceVars.length > 0
    ? TRANSFORMS
    : TRANSFORMS.filter((t) => t.kind === "jitter" || t.kind === "missingIndicator" || t.kind === "imputeFixed" || t.kind === "imputeRandom" || t.kind === "imputeConditional");

  useEffect(() => {
    if (source && sourceVars.includes(source)) return;
    setSource(sourceVars[0] ?? "");
    setNameEdited(false);
  }, [sourceVars, source]);

  useEffect(() => {
    if (!source || nameEdited) return;
    setName(defaultDerivedName(effectiveKind, source, exponent, existingNames));
  }, [effectiveKind, source, exponent, jitterAmplitude, jitterSeed, existingNames, nameEdited]);

  useEffect(() => {
    setSphereVars(new Set(transformSourceVars.slice(0, Math.min(3, transformSourceVars.length))));
  }, [transformSourceVars]);

  if (spec.length === 0) return <div className="empty-vars">No variables loaded.</div>;

  const addDerived = () => {
    if (!source || !name.trim()) return;
    const deriveSpec: DeriveSpec =
      effectiveKind === "power"
        ? { kind: effectiveKind, source, exponent }
        : effectiveKind === "jitter"
        ? { kind: effectiveKind, source, amplitude: jitterAmplitude, seed: jitterSeed }
        : effectiveKind === "imputeFixed"
        ? { kind: effectiveKind, source, value: imputationFixedValue }
        : effectiveKind === "imputeRandom"
        ? { kind: effectiveKind, source, seed: imputationSeed }
        : effectiveKind === "imputeConditional"
        ? { kind: effectiveKind, source, condVar: imputationCondVar ?? "", seed: imputationSeed }
        : { kind: effectiveKind, source } as DeriveSpec;
    try {
      deriveColumn(name, deriveSpec);
      setError(null);
      setNameEdited(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const sphereSources = transformSourceVars.filter((v) => sphereVars.has(v));
  const addSphere = () => {
    if (sphereSources.length < 2) return;
    try {
      deriveSphere(spherePrefix, sphereSources);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      {sourceVars.length > 0 && (
        <div className="var-transform" aria-label="derive variable">
          <HelpPopover content={<><p className="help-title">Derive New Variables</p><p>Create new columns from existing ones using transformations. This is essential for data preparation — many visualization and analysis methods work better with properly transformed data.</p><div className="help-measures"><span className="mname">log</span><span className="mdesc">Natural logarithm. Compresses large values, expands small ones. Use when data spans orders of magnitude (e.g. income, population). Only for positive values.</span><span className="mname">sqrt</span><span className="mdesc">Square root. Milder than log — stabilizes variance for count data. Only for non-negative values.</span><span className="mname">standardize</span><span className="mdesc">z-score: subtract mean, divide by SD. Makes variables comparable across different scales. Essential before clustering or PCA if variables have different units.</span><span className="mname">rank</span><span className="mdesc">Replace values with their rank order (1, 2, 3...). Completely removes distribution shape — only the ordering matters. Robust to outliers.</span><span className="mname">negate</span><span className="mdesc">Multiply by -1. Flips the direction of a variable. Useful when a negative correlation is easier to interpret as a positive one.</span><span className="mname">power</span><span className="mdesc">Raise to a custom exponent. x² emphasizes large values; x^0.5 is like sqrt; x^3 for cubic scaling.</span><span className="mname">jitter</span><span className="mdesc">Add small random noise. Breaks ties in discrete data so points don't overlap exactly. Essential for dotplots of integer data.</span><span className="mname">miss_ind</span><span className="mdesc">Binary indicator: 1 if missing, 0 if observed. Lets you color or brush by missingness pattern.</span><span className="mname">impute_fixed</span><span className="mdesc">Replace missing values with a constant you choose (e.g. 0, mean). Simple but may distort analysis.</span><span className="mname">impute_rand</span><span className="mdesc">Replace missing values with a randomly chosen observed value. Better than fixed for preserving distribution shape.</span><span className="mname">impute_cond</span><span className="mdesc">Impute randomly within strata of a conditioning variable. E.g. impute within each category. Preserves group differences.</span></div><p><b>Warning:</b> Imputed values are not real observations. They are guesses. Cycling through multiple imputations shows how much your results depend on the guess.</p></>} />
          <select
            aria-label="transform source"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setNameEdited(false);
            }}
          >
            {sourceVars.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            aria-label="transform kind"
            value={effectiveKind}
            onChange={(e) => {
              setKind(e.target.value as TransformKind);
              setNameEdited(false);
            }}
          >
            {availableTransforms.map((t) => <option key={t.kind} value={t.kind}>{t.label}</option>)}
          </select>
          {effectiveKind === "power" && (
            <input
              aria-label="power exponent"
              type="number"
              step={0.25}
              value={exponent}
              onChange={(e) => {
                setExponent(parseFloat(e.target.value));
                setNameEdited(false);
              }}
            />
          )}
          {effectiveKind === "jitter" && (
            <>
              <input
                aria-label="jitter amplitude"
                type="number"
                min={0}
                step={0.05}
                value={jitterAmplitude}
                onChange={(e) => {
                  setJitterAmplitude(parseFloat(e.target.value));
                  setNameEdited(false);
                }}
              />
              <input
                aria-label="jitter seed"
                type="number"
                step={1}
                value={jitterSeed}
                onChange={(e) => setJitterSeed(parseFloat(e.target.value))}
              />
            </>
          )}
          {effectiveKind === "imputeFixed" && (
            <input
              aria-label="imputation value"
              type="number"
              step="any"
              value={imputationFixedValue}
              onChange={(e) => {
                setLocalImputationFixedValue(parseFloat(e.target.value) ?? 0);
                setNameEdited(false);
              }}
            />
          )}
          {(effectiveKind === "imputeRandom" || effectiveKind === "imputeConditional") && (
            <input
              aria-label="imputation seed"
              type="number"
              step={1}
              value={imputationSeed}
              onChange={(e) => setLocalImputationSeed(parseInt(e.target.value, 10) ?? 0)}
            />
          )}
          {effectiveKind === "imputeConditional" && (
            <select
              aria-label="conditioning variable for imputation"
              value={imputationCondVar}
              onChange={(e) => {
                setImputationCondVarLocal(e.target.value);
                setNameEdited(false);
              }}
            >
              <option value="">(none)</option>
              {categoricalVars.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          <input
            aria-label="derived column name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameEdited(true);
            }}
          />
          <button
            type="button"
            aria-label="add derived variable"
            disabled={
              !source ||
              !name.trim() ||
              existingNames.has(name.trim()) ||
              (effectiveKind === "power" && !Number.isFinite(exponent)) ||
              (effectiveKind === "jitter" && (!Number.isFinite(jitterAmplitude) || jitterAmplitude < 0 || !Number.isFinite(jitterSeed)))
            }
            onClick={addDerived}
          >
            Add
          </button>
          {error && <div className="var-transform-error" role="alert">{error}</div>}
        </div>
      )}
      {transformSourceVars.length >= 2 && (
        <div className="var-sphere" aria-label="sphere variables">
          <HelpPopover content={<><p className="help-title">Sphering (Whitening)</p><p>Decorrelates and standardizes a set of variables so they have identity covariance — no correlation between them, and each has unit variance.</p><p><b>When to use:</b> Before running methods that assume uncorrelated inputs (e.g. tour, PCA). When variables are highly correlated and you want to see independent directions of variation.</p><p><b>How it works:</b> Computes the covariance matrix, then transforms so the result has covariance = identity. The sphered variables are added as new columns with your chosen prefix.</p></>} />
          <input
            aria-label="sphere prefix"
            value={spherePrefix}
            onChange={(e) => setSpherePrefix(e.target.value)}
          />
          <div className="var-sphere-list">
            {transformSourceVars.map((v) => (
              <label key={v} className="inline-check">
                <input
                  type="checkbox"
                  aria-label={`sphere variable ${v}`}
                  checked={sphereVars.has(v)}
                  onChange={(e) => {
                    setSphereVars((current) => {
                      const next = new Set(current);
                      if (e.target.checked) next.add(v);
                      else next.delete(v);
                      return next;
                    });
                  }}
                />
                <span>{v}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            aria-label="add sphered variables"
            disabled={sphereSources.length < 2 || !spherePrefix.trim()}
            onClick={addSphere}
          >
            Sphere
          </button>
        </div>
      )}
      {(() => {
        const groups = new Map<string, { members: string[]; scaling: ScalingMode | undefined }>();
        for (const v of spec) {
          if (!v.group) continue;
          let g = groups.get(v.group);
          if (!g) { g = { members: [], scaling: v.scaling }; groups.set(v.group, g); }
          g.members.push(v.name);
        }
        if (groups.size > 0) {
          return (
            <div className="var-groups" aria-label="variable groups">
              <HelpPopover content={<><p className="help-title">Variable Groups</p><p>Variables in the same group share a common scaling. This ensures they are displayed on the same range, making them directly comparable in linked plots.</p><p><b>When to use:</b> Group variables that measure the same thing on different scales (e.g. test scores in different subjects). The shared scaling means a value of 0.5 means the same relative position for all variables in the group.</p></>} />
              {Array.from(groups.entries()).map(([name, g]) => (
                <div key={name} className="var-group-row">
                  <span className="group-name">{name}</span>
                  <span className="group-members">{g.members.join(", ")}</span>
                  <select
                    className="scaling-select"
                    aria-label={`scaling for group ${name}`}
                    value={g.scaling ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setGroupScaling(name, val === "" ? undefined : (val as ScalingMode));
                    }}
                  >
                    <option value="">raw</option>
                    {SCALING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          );
        }
        return null;
      })()}
      {varsMissing.length > 0 && (
        <div className="var-missing" aria-label="missing data summary">
          <HelpPopover content={<><p className="help-title">Missing Data</p><p>Missing values affect every analysis: they reduce sample size, can bias results, and may carry information themselves (e.g. people who skip a survey question may differ systematically from those who answer).</p><p><b>What to do:</b></p><p><b>Visualize first</b>: Check the marginals box to see missingness marks on plots. Are missing values random or clustered?</p><p><b>Create indicators</b>: Use miss_ind to create a binary "is this missing?" column. Color by it — if missingness correlates with other variables, the data is "missing not at random" (MNAR), which is a serious issue.</p><p><b>Impute cautiously</b>: Replacing missing values with guesses lets you use all rows, but the guesses are not real data. Cycle through multiple imputation sets to see how sensitive your results are to the imputation.</p><p><b>Warning:</b> Imputation is not observation. An imputed value is a statistical guess, not a measurement. Never treat imputed data as if it were fully observed.</p></>} />
          <div className="missing-summary-row">
            <span>{totalMissingRows} rows with missing values across {varsMissing.length} variables</span>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={showMarginals}
                onChange={(e) => setShowMarginals(e.target.checked)}
              />
              <span>marginals</span>
            </label>
          </div>
          <div className="missing-impute" aria-label="imputation controls">
            <select
              aria-label="imputation method"
              value={imputation.method}
              onChange={(e) => setImputationMethod(e.target.value as "none" | "fixed" | "random" | "conditional")}
            >
              <option value="none">no imputation</option>
              <option value="fixed">fixed value</option>
              <option value="random">random observed</option>
              <option value="conditional">conditional random</option>
            </select>
            {imputation.method === "fixed" && (
              <input
                aria-label="imputation fixed value"
                type="number"
                step="any"
                value={imputation.fixedValue}
                onChange={(e) => setImputationFixedValue(parseFloat(e.target.value) ?? 0)}
              />
            )}
            {(imputation.method === "random" || imputation.method === "conditional") && (
              <input
                aria-label="imputation seed"
                type="number"
                step={1}
                value={imputation.seed}
                onChange={(e) => setImputationSeed(parseInt(e.target.value, 10) ?? 0)}
              />
            )}
            {imputation.method === "conditional" && (
              <select
                aria-label="conditioning variable"
                value={imputation.condVar ?? ""}
                onChange={(e) => setImputationCondVar(e.target.value || null)}
              >
                <option value="">(none)</option>
                {spec.filter((v) => v.type === "categorical").map((v) => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
            )}
            {(imputation.method === "random" || imputation.method === "conditional") && (
              <div className="imputation-cycle">
                <HelpPopover content={<><p className="help-title">Multiple Imputation Cycling</p><p>Generate several different imputation datasets by varying the random seed. Cycle through them to see how your plots and analyses change with different imputations.</p><p><b>If results are stable</b> across imputations: your conclusions are robust to the missing data mechanism.</p><p><b>If results change a lot</b>: the missing data is influential. Be cautious — your findings may depend on assumptions about missingness.</p></>} />
                <label>
                  sets
                  <input
                    aria-label="number of imputation sets"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={imputationSets}
                    onChange={(e) => setImputationSets(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                </label>
                <button
                  type="button"
                  className="cycle-btn"
                  onClick={cycleImputation}
                  title={`Cycle to imputation ${((imputationIndex + 1) % imputationSets) + 1} of ${imputationSets}`}
                >
                  cycle ({imputationIndex + 1}/{imputationSets})
                </button>
              </div>
            )}
          </div>
          <div className="missing-var-list">
            {varsMissing.map((v) => (
              <div key={v.name} className="missing-var-row">
                <span className="missing-var-name">{v.name}</span>
                <span className="missing-var-count">{v.missing}/{v.total} ({v.percent.toFixed(1)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="var-list" data-testid="variable-list">
        <HelpPopover content={<><p className="help-title">Variable List</p><p>All variables in your dataset, with controls for scaling, grouping, and inclusion.</p><div className="help-measures"><span className="mname">raw</span><span className="mdesc">Original values, no transformation. Use when data is already on a comparable scale.</span><span className="mname">0-1</span><span className="mdesc">Min-max normalization to [0,1]. Stretches each variable to fill the full range. Sensitive to outliers.</span><span className="mname">z-score</span><span className="mdesc">Subtract mean, divide by standard deviation. Centered at 0, unit scale. The standard choice for methods that assume comparable scales (clustering, PCA, classification).</span><span className="mname">robust</span><span className="mdesc">Subtract median, divide by MAD (median absolute deviation). Like z-score but resistant to outliers. Use when data has extreme values that distort the mean/SD.</span><span className="mname">group</span><span className="mdesc">Type a group name to share scaling with other variables in that group. Useful for comparing variables measured in different units.</span><span className="mname">● / ○</span><span className="mdesc">Include/exclude toggle. Excluded variables are hidden from plots and analyses but still in the dataset.</span></div><p><b>Tip:</b> Before clustering or tours, set all numeric variables to z-score or robust scaling so variables with larger ranges don't dominate the analysis.</p></>} />
        {spec.map((v) => {
          const isNumeric = v.type === "numeric" || v.type === "integer";
          return (
            <div key={v.name} className={`var-row${v.included ? "" : " excluded"}`}>
              <span className="name">{v.name}</span>
              <span className="type">{v.derived ? `${v.type} / ${v.derived.kind}` : v.type}</span>
              {isNumeric && (
                <select
                  className="scaling-select"
                  aria-label={`scaling mode for ${v.name}`}
                  value={v.scaling ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    const mode = val === "" ? undefined : (val as ScalingMode);
                    if (v.group) {
                      setGroupScaling(v.group, mode);
                    } else {
                      setScaling(v.name, mode);
                    }
                  }}
                >
                  <option value="">raw</option>
                  {SCALING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
              <input
                className="group-input"
                aria-label={`group for ${v.name}`}
                value={v.group ?? ""}
                placeholder="group"
                onChange={(e) => setGroup(v.name, e.target.value || undefined)}
              />
              <button
                className="toggle"
                aria-label={v.included ? `exclude ${v.name}` : `include ${v.name}`}
                onClick={() => setIncluded(v.name, !v.included)}
              >
                {v.included ? "●" : "○"}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function defaultDerivedName(
  kind: TransformKind,
  source: string,
  exponent: number,
  existingNames: ReadonlySet<string>,
): string {
  const prefix = kind === "standardize"
    ? "z"
    : kind === "power"
    ? `pow${formatExponent(exponent)}`
    : kind;
  const base = `${prefix}_${source}`;
  if (!existingNames.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}_${i}`;
    if (!existingNames.has(candidate)) return candidate;
  }
}

function formatExponent(value: number): string {
  if (!Number.isFinite(value)) return "x";
  return String(value).replace("-", "neg").replace(".", "p");
}
