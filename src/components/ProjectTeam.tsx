import { useEffect, useState } from "react";
import type { Profile, ProjectAnalysis, ProviderId, ProviderStatus } from "../../shared/types";
import { createProfile, getProjectAnalysis } from "../api";

export function ProjectTeam({
  workspace, providers, onCreated, onGenerating,
}: {
  workspace: string;
  providers: ProviderStatus[];
  onCreated: (profiles: Profile[]) => void;
  onGenerating: (generating: boolean) => void;
}) {
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<ProviderId>();
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const activeProvider = provider ?? providers.find((item) => item.configured)?.id ?? providers[0]?.id;

  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    void getProjectAnalysis(workspace, request.signal).then((result) => {
      if (request.signal.aborted) return;
      setAnalysis(result);
      setSelected(result.suggestions.map(({ id }) => id));
    }).catch((error: Error) => {
      if (!request.signal.aborted) setError(error.message);
    }).finally(() => {
      if (!request.signal.aborted) setLoading(false);
    });
    return () => request.abort();
  }, [workspace, attempt]);

  const chosen = analysis?.suggestions.filter(({ id }) => selected.includes(id) && !created[id]) ?? [];

  async function generate() {
    if (!activeProvider || !chosen.length || generating || loading) return;
    setGenerating(true);
    onGenerating(true);
    setError("");
    const profiles: Profile[] = [];
    try {
      for (const suggestion of chosen) {
        const profile = await createProfile({
          name: suggestion.role,
          role: suggestion.role,
          provider: activeProvider,
          soul: `Eres especialista en ${suggestion.role} en las reuniones de ZoomAgents.
Tu misión: ${suggestion.task}
Usa el proyecto activo de la reunión. Explica qué verificaste y señala qué falta comprobar.`,
        });
        profiles.push(profile);
        setCreated((previous) => ({ ...previous, [suggestion.id]: profile.id }));
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      if (profiles.length) onCreated(profiles);
      setGenerating(false);
      onGenerating(false);
    }
  }

  return (
    <div className="project-team">
      <div className="setup-head">
        <h3>Agentes sugeridos</h3>
        <button type="button" className="ghost-btn" disabled={loading || generating} onClick={() => setAttempt((value) => value + 1)}>Volver a analizar</button>
      </div>
      {loading && <p role="status">Analizando la estructura del proyecto…</p>}
      {analysis && !loading && (
        <>
          <p className="muted-note">{analysis.files.toLocaleString()} archivos revisados{analysis.incomplete ? " · análisis parcial" : ""}</p>
          <div className="project-suggestions">
            {analysis.suggestions.map((suggestion) => (
              <label className="project-suggestion" key={suggestion.id}>
                <input type="checkbox" checked={Boolean(created[suggestion.id]) || selected.includes(suggestion.id)}
                  disabled={generating || Boolean(created[suggestion.id])}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelected((ids) => checked ? [...ids, suggestion.id] : ids.filter((id) => id !== suggestion.id));
                  }} />
                <span>
                  <strong>{suggestion.role}{created[suggestion.id] ? " · creado" : ""}</strong>
                  <span>{suggestion.task}</span>
                  {suggestion.evidence.length > 0 && <small>{suggestion.evidence.join(" · ")}</small>}
                </span>
              </label>
            ))}
          </div>
          <div className="project-team-actions">
            <label className="field">
              <span>Proveedor de los agentes</span>
              <select value={activeProvider ?? ""} disabled={generating} onChange={(event) => setProvider(event.target.value as ProviderId)}>
                {!providers.length && <option value="">Cargando proveedores…</option>}
                {providers.map((item) => <option key={item.id} value={item.id}>{item.label}{item.configured ? "" : " · sin conexión"}</option>)}
              </select>
            </label>
            <button type="button" className="primary-btn" disabled={!chosen.length || !activeProvider || generating} onClick={() => void generate()}>
              {generating ? "Creando agentes…" : `Generar seleccionados (${chosen.length})`}
            </button>
          </div>
        </>
      )}
      {error && <p className="error-note" role="alert">{error}</p>}
    </div>
  );
}
