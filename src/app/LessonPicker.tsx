import { LESSONS } from "@/lib/lessons/definitions";
import { useAppStore } from "@/store";
import { loadDatasetUrl, type LoadedData } from "@/app/loadFile";

export function LessonPicker() {
  const startLesson = useAppStore((s) => s.startLesson);
  const setData = useAppStore((s) => s.setData);
  const setSpec = useAppStore((s) => s.setSpec);
  const setEdgesLayer = useAppStore((s) => s.setEdgesLayer);

  const handleStart = async (lessonId: string) => {
    const lesson = LESSONS.find((l) => l.id === lessonId);
    if (!lesson) return;
    try {
      const loaded: LoadedData = await loadDatasetUrl(lesson.dataset);
      setData(loaded.df);
      if (loaded.edges) setEdgesLayer(loaded.edges, "custom");
      setSpec(loaded.df.columns.map((c) => ({ name: c.name, type: c.type, included: true })));
      startLesson(lessonId);
    } catch (e) {
      console.error("Failed to load lesson dataset:", e);
    }
  };

  return (
    <div className="lesson-picker">
      <span style={{ color: "var(--text-dim)", fontSize: 12, alignSelf: "center" }}>
        Guided lessons:
      </span>
      {LESSONS.map((l) => (
        <button
          key={l.id}
          className="lesson-picker-btn"
          onClick={() => void handleStart(l.id)}
          title={l.description}
        >
          {l.title}
        </button>
      ))}
    </div>
  );
}
