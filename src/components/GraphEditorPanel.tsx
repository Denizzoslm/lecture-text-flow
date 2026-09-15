import { graphLabel, type GraphCurve, type GraphSpec } from "@/lib/markdown";

const TYPES: Array<[NonNullable<GraphCurve["type"]>, string]> = [
  ["fonction", "Fonction (équation)"],
  ["droite", "Droite par 2 points"],
  ["segments", "Segments entre les points"],
  ["courbe", "Courbe lissée"],
  ["parabole", "Parabole par 3 points"],
  ["nuage", "Nuage de points"],
];

export function GraphEditorPanel({ spec, onChange }: { spec: GraphSpec; onChange: (value: GraphSpec) => void }) {
  const curves = spec.courbes ?? [];
  const patchCurve = (index: number, patch: Partial<GraphCurve>) =>
    onChange({ ...spec, courbes: curves.map((curve, i) => (i === index ? { ...curve, ...patch } : curve)) });
  const removeCurve = (index: number) => onChange({ ...spec, courbes: curves.filter((_, i) => i !== index) });

  return (
    <div className="graph-editor-panel">
      <div className="graph-editor-grid">
        <label>Titre<input value={spec.titre ?? ""} onChange={(e) => onChange({ ...spec, titre: e.target.value })} /></label>
        <label>Axe horizontal<input value={spec.xlabel ?? ""} onChange={(e) => onChange({ ...spec, xlabel: e.target.value })} /></label>
        <label>Axe vertical<input value={spec.ylabel ?? ""} onChange={(e) => onChange({ ...spec, ylabel: e.target.value })} /></label>
      </div>
      <div className="graph-editor-grid graph-bounds">
        {(["xmin", "xmax", "ymin", "ymax"] as const).map((key) => (
          <label key={key}>{key}<input type="number" step="any" value={spec[key] ?? ""} onChange={(e) => onChange({ ...spec, [key]: Number(e.target.value) })} /></label>
        ))}
      </div>
      <fieldset className="graph-legend-position">
        <legend>Position de la légende sur le graphique</legend>
        <label>Horizontal<input type="range" min="0" max="100" value={spec.legende?.x ?? 3} onChange={(e) => onChange({ ...spec, legende: { x: Number(e.target.value), y: spec.legende?.y ?? 3 } })} /></label>
        <label>Vertical<input type="range" min="0" max="100" value={spec.legende?.y ?? 3} onChange={(e) => onChange({ ...spec, legende: { x: spec.legende?.x ?? 3, y: Number(e.target.value) } })} /></label>
      </fieldset>
      <div className="graph-series-list">
        {curves.map((curve, index) => (
          <section key={index} className="graph-series-card">
            <div className="graph-series-heading"><strong>Ligne {index + 1}</strong><button type="button" onClick={() => removeCurve(index)}>Supprimer</button></div>
            <div className="graph-editor-grid">
              <label>Texte de légende<input value={graphLabel(curve.label)} onChange={(e) => patchCurve(index, { label: e.target.value })} /></label>
              <label>Type<select value={curve.type ?? "fonction"} onChange={(e) => patchCurve(index, { type: e.target.value as GraphCurve["type"] })}>{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Couleur<input type="color" value={curve.couleur ?? ["#1f77b4", "#d62728", "#2ca02c", "#ff7f0e"][index % 4]} onChange={(e) => patchCurve(index, { couleur: e.target.value })} /></label>
            </div>
            {(curve.type ?? "fonction") === "fonction" ? (
              <label>Équation en x<input value={curve.expr ?? ""} placeholder="x^2, sin(x), 2*x+1…" onChange={(e) => patchCurve(index, { expr: e.target.value })} /></label>
            ) : (
              <PointFields points={curve.points ?? []} onChange={(points) => patchCurve(index, { points })} />
            )}
          </section>
        ))}
      </div>
      <button type="button" className="graph-add-series" onClick={() => onChange({ ...spec, courbes: [...curves, { type: "droite", label: `Ligne ${curves.length + 1}`, couleur: ["#1f77b4", "#d62728", "#2ca02c", "#ff7f0e"][curves.length % 4], points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] })}>+ Ajouter une ligne</button>
    </div>
  );
}

function PointFields({ points, onChange }: { points: Array<{ x: number; y: number }>; onChange: (points: Array<{ x: number; y: number }>) => void }) {
  return <div className="graph-points"><span>Points de passage</span>{points.map((point, index) => <div key={index}><input aria-label={`Point ${index + 1} x`} type="number" step="any" value={point.x} onChange={(e) => onChange(points.map((p, i) => i === index ? { ...p, x: Number(e.target.value) } : p))} /><input aria-label={`Point ${index + 1} y`} type="number" step="any" value={point.y} onChange={(e) => onChange(points.map((p, i) => i === index ? { ...p, y: Number(e.target.value) } : p))} /><button type="button" onClick={() => onChange(points.filter((_, i) => i !== index))}>×</button></div>)}<button type="button" onClick={() => onChange([...points, { x: 0, y: 0 }])}>+ point</button></div>;
}
