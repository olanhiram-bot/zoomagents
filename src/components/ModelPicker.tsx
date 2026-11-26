import { useEffect, useMemo, useState } from "react";
import type { ModelCatalog, ModelOption, ProviderId } from "../../shared/types";
import { CloseIcon } from "./Icons";

const TABS: { id: ProviderId; label: string }[] = [
  { id: "opencode", label: "OpenCode" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google" },
];

const MAX_ROWS = 150;

export function ModelPicker({
  agentName,
  choice,
  catalog,
  onSelect,
  onClose,
}: {
  agentName: string;
  choice: { provider: ProviderId; model: string };
  catalog: ModelCatalog;
  onSelect: (next: { provider: ProviderId; model: string }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ProviderId>(choice.provider);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    setTab(choice.provider);
    setQuery("");
    setCustom("");
  }, [choice.provider]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const models = catalog[tab] ?? [];

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return models;
    return models.filter(
      (model) =>
        model.id.toLowerCase().includes(keyword) || model.label.toLowerCase().includes(keyword),
    );
  }, [models, query]);

  const visible = filtered.slice(0, MAX_ROWS);
  const families = useMemo(() => {
    const set = new Set<string>();
    for (const model of filtered) if (model.family) set.add(model.family);
    return set;
  }, [filtered]);

  const pick = (model: string) => onSelect({ provider: tab, model });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-wide picker" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>Modelo</h2>
            <p>{agentName} · elige proveedor y modelo para este asiento.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </header>

        <div className="picker-tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`mode-btn ${tab === item.id ? "is-selected" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              {item.id === "opencode" && <span className="tab-count">{catalog.opencode?.length ?? 0}</span>}
            </button>
          ))}
        </div>

        {tab === "opencode" && (
          <div className="picker-tools">
            <input
              className="picker-search"
              placeholder="Buscar modelo (claude, gemini, free…)"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
            <span className="picker-meta">
              {filtered.length} modelo{filtered.length === 1 ? "" : "s"}
              {families.size > 1 ? ` · ${families.size} familias` : ""}
            </span>
          </div>
        )}

        <div className="picker-list">
          {visible.length ? (
            visible.map((model) => (
              <ModelRow
                key={`${tab}:${model.id || "default"}`}
                model={model}
                current={choice.provider === tab && choice.model === model.id}
                onPick={() => pick(model.id)}
              />
            ))
          ) : (
            <p className="picker-empty">
              {tab === "opencode"
                ? "OpenCode no devolvió modelos. Comprueba el CLI con `opencode models`."
                : "Sin modelos para este proveedor."}
            </p>
          )}
          {filtered.length > visible.length && (
            <p className="picker-empty">
              Mostrando {visible.length} de {filtered.length}. Afina la búsqueda.
            </p>
          )}
        </div>

        {tab !== "opencode" && (
          <div className="picker-custom">
            <input
              placeholder="ID de modelo personalizado (opcional)"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
            />
            <button
              type="button"
              className="ghost-btn"
              disabled={!custom.trim()}
              onClick={() => pick(custom.trim())}
            >
              Usar
            </button>
          </div>
        )}

        <footer className="modal-foot">
          <span className="modal-note">
            {tab === "opencode"
              ? "OpenCode enruta al proveedor dueño del modelo. Si es de pago, usa tu saldo o integración de OpenCode."
              : "Vacío = modelo del CLI. Si el CLI no reconoce el id, usa su modelo por defecto."}
          </span>
        </footer>
      </div>
    </div>
  );
}

function ModelRow({
  model,
  current,
  onPick,
}: {
  model: ModelOption;
  current: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      className={`picker-row ${current ? "is-current" : ""}`}
      onClick={onPick}
      title={model.hint ?? model.id}
    >
      <span className="picker-label">{model.label || "Modelo del CLI"}</span>
      {model.family && <span className="picker-family">{model.family}</span>}
      {model.id.includes("-free") && <span className="picker-free">free</span>}
      {current && <span className="picker-check">actual</span>}
    </button>
  );
}
