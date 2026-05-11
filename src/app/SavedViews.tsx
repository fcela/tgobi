import { useAppStore } from "@/store";

export function SavedViews() {
  const views = useAppStore((s) => s.tour.savedViews);
  const restoreView = useAppStore((s) => s.restoreView);
  const removeView = useAppStore((s) => s.removeView);

  if (views.length === 0) return <div className="saved-views empty">no saved views</div>;
  return (
    <div className="saved-views">
      <header>Saved views</header>
      {views.map((v) => (
        <div key={v.id} className="row">
          <span className="name">{v.name}</span>
          <span className="meta">{v.shape} · {v.vars.length}v</span>
          <button aria-label={`restore ${v.name}`} onClick={() => restoreView(v.id)}>↩</button>
          <button aria-label={`remove ${v.name}`} onClick={() => removeView(v.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
