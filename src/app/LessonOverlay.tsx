import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import { LESSONS } from "@/lib/lessons/definitions";

function executeAction(action: string) {
  const s = useAppStore.getState();
  const df = s.df;
  if (!df) return;

  const numCols = df.columns.filter((c) => c.type === "numeric" || c.type === "integer").map((c) => c.name);
  const catCols = df.columns.filter((c) => c.type === "categorical").map((c) => c.name);

  switch (action) {
    case "add-scatter": {
      if (numCols.length >= 2) {
        s.clearPanels();
        s.addScatter(numCols[0]!, numCols[1]!);
      }
      break;
    }
    case "color-by-species":
    case "color-by-region": {
      const varName = catCols.find((c) => c === "species" || c === "Region");
      if (varName) s.setColorEncoding({ kind: "byVar", var: varName, scale: "categorical" });
      break;
    }
    case "set-persistent-brush": {
      s.setBrushMode("persistent");
      break;
    }
    case "start-grand-tour": {
      const panel = s.plots.panels.find((p) => p.kind === "scatter");
      if (panel && numCols.length >= 2) {
        s.setTourActiveVars(numCols.slice(0, 6));
        s.startTour(panel.id, "2d", numCols.slice(0, 6));
      }
      break;
    }
    case "switch-pp-lda": {
      s.setTourMode("pp");
      s.setTourPpIndex("lda");
      const catVar = catCols.find((c) => c === "species" || c === "Region");
      if (catVar) s.setPpClassSource(catVar);
      break;
    }
    case "start-lda-tour-olive": {
      const panel = s.plots.panels.find((p) => p.kind === "scatter");
      const oliveNums = numCols.filter((n) => n !== "id");
      if (panel && oliveNums.length >= 2) {
        s.setTourActiveVars(oliveNums.slice(0, 8));
        s.startTour(panel.id, "2d", oliveNums.slice(0, 8));
        s.setTourMode("pp");
        s.setTourPpIndex("lda");
        const regionVar = catCols.find((c) => c === "Region");
        if (regionVar) s.setPpClassSource(regionVar);
      }
      break;
    }
    case "run-knn-olive": {
      const oliveNums = numCols.filter((n) => n !== "id");
      const regionVar = catCols.find((c) => c === "Region");
      if (oliveNums.length >= 2 && regionVar) {
        s.setClassificationMethod("knn");
        s.setClassificationVariables(oliveNums);
        s.setClassificationClassSource(regionVar);
        s.setClassificationKnnK(5);
        s.runClassification();
      }
      break;
    }
    case "add-missing-pattern": {
      s.addMissingPattern();
      break;
    }
    case "add-parcoords-missing": {
      if (numCols.length >= 2) s.addParcoords(numCols);
      break;
    }
    case "run-scag-synthetic": {
      const synNums = numCols.filter((n) => n.startsWith("x"));
      if (synNums.length >= 2) {
        s.setScagnosticsVariables(synNums);
        s.runScagnostics();
      }
      break;
    }
    case "run-kmeans-synthetic": {
      const synNums = numCols.filter((n) => n.startsWith("x"));
      if (synNums.length >= 2) {
        s.setClusteringMethod("kmeans");
        s.setClusteringVariables(synNums);
        s.setClusteringK(4);
        s.runClustering();
      }
      break;
    }
  }
}

export function LessonOverlay() {
  const activeId = useAppStore((s) => s.lessons.activeLessonId);
  const activeStep = useAppStore((s) => s.lessons.activeStep);
  const nextStep = useAppStore((s) => s.nextLessonStep);
  const prevStep = useAppStore((s) => s.prevLessonStep);
  const endLesson = useAppStore((s) => s.endLesson);
  const lastStep = useRef(-1);

  useEffect(() => {
    if (!activeId) { lastStep.current = -1; return; }
    if (activeStep === lastStep.current) return;
    lastStep.current = activeStep;
    const lesson = LESSONS.find((l) => l.id === activeId);
    if (!lesson) return;
    const step = lesson.steps[activeStep];
    if (step?.action) executeAction(step.action);
  }, [activeId, activeStep]);

  if (!activeId) return null;
  const lesson = LESSONS.find((l) => l.id === activeId);
  if (!lesson) return null;
  const step = lesson.steps[activeStep];
  if (!step) return null;
  const isFirst = activeStep === 0;
  const isLast = activeStep === lesson.steps.length - 1;

  return (
    <div className="lesson-overlay">
      <div className="lesson-card">
        <div className="lesson-header">
          <span className="lesson-badge">Lesson</span>
          <span className="lesson-title">{lesson.title}</span>
          <span className="lesson-step-num">Step {activeStep + 1}/{lesson.steps.length}</span>
          <button className="lesson-close" onClick={endLesson} aria-label="close lesson">x</button>
        </div>
        <div className="lesson-progress">
          <div className="lesson-progress-bar" style={{ width: `${((activeStep + 1) / lesson.steps.length) * 100}%` }} />
        </div>
        <h3 className="lesson-step-title">{step.title}</h3>
        <div className="lesson-step-body">
          {typeof step.body === "string"
            ? step.body.split("\n\n").map((p, i) => <p key={i}>{p}</p>)
            : step.body}
        </div>
        <div className="lesson-nav">
          <button disabled={isFirst} onClick={prevStep}>Back</button>
          {isLast ? (
            <button className="lesson-finish" onClick={endLesson}>Finish</button>
          ) : (
            <button className="lesson-next" onClick={nextStep}>Next</button>
          )}
        </div>
      </div>
    </div>
  );
}
