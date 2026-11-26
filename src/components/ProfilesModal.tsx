import { useEffect, useState } from "react";
import type {
  Library,
  ModelCatalog,
  Profile,
  ProfileInput,
  ProviderId,
} from "../../shared/types";
import {
  createProfile,
  getLibrary,
  getProfileMemory,
  getProfilePrompt,
  getModels,
  getProfiles,
  removeProfile,
  saveProfile,
  saveProfileMemory,
  seedProfiles,
} from "../api";
import { seedForAgent } from "../../shared/avatar";
import { AgentFace } from "./AgentFace";
import { CloseIcon, MicIcon, SlidersIcon } from "./Icons";

type Draft = {
  name: string;
  role: string;
  roleId: string | null;
  skillIds: string[];
  provider: ProviderId;
  model: string;
  soul: string;
  avatarSeed: number;
};

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "opencode", label: "OpenCode" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google" },
];

export function ProfilesModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [memory, setMemory] = useState({ user: "", memory: "" });
  const [observations, setObservations] = useState<Record<string, unknown>[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalog>({});
  const [library, setLibrary] = useState<Library>({ skills: [], roles: [] });
  const [tab, setTab] = useState<"knowledge" | "user" | "history">("knowledge");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [promptPreview, setPromptPreview] = useState<string | null>(null);

  const load = async (preferred?: string | null) => {
    const list = await getProfiles();
    setProfiles(list);
    const nextId =
      preferred === null ? list[0]?.id ?? null : preferred ?? selectedId ?? list[0]?.id ?? null;
    setSelectedId(nextId);
    const profile = list.find((item) => item.id === nextId);
    if (profile) await select(profile, false);
    else {
      setDraft(null);
      setMemory({ user: "", memory: "" });
      setObservations([]);
    }
  };

  const select = async (profile: Profile, clearNote = true) => {
    setPromptPreview(null);
    setSelectedId(profile.id);
    setDraft({
      name: profile.name,
      role: profile.role,
      roleId: profile.roleId ?? null,
      skillIds: profile.skillIds ?? [],
      provider: profile.provider,
      model: profile.model,
      soul: profile.soul,
      avatarSeed: profile.avatarSeed,
    });
    if (clearNote) setNote(null);
    try {
      const data = await getProfileMemory(profile.id);
      setMemory(data.docs);
      setObservations(data.observations.slice(-12).reverse());
    } catch {
      setMemory({ user: profile.memory.user, memory: profile.memory.memory });
      setObservations([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    setNote(null);
    setTab("knowledge");
    load().catch(() => setNote("No se pudo cargar la biblioteca de agentes."));
    getModels().then(setCatalog).catch(() => undefined);
    getLibrary().then(setLibrary).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const run = async (action: () => Promise<void>, message?: string) => {
    setBusy(true);
    setNote(null);
    try {
      await action();
      if (message) setNote(message);
      onChanged();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Algo falló.");
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const general = library.roles.find((role) => role.id === "general");
      // OpenCode is the default gateway: one login, many models.
      const profile = await createProfile({
        name: "Nuevo agente",
        role: general?.name ?? "General",
        roleId: general?.id ?? null,
        skillIds: general?.skillIds ?? [],
        provider: "opencode",
        model:
          catalog.opencode?.find((model) => model.id)?.id ?? "opencode/big-pickle",
        soul: "",
      });
      await load(profile.id);
    }, "Agente creado.");

  const seed = () =>
    run(async () => {
      await seedProfiles();
      await load();
    }, "Equipo de ejemplo creado.");

  const save = () =>
    run(async () => {
      if (!selectedId || !draft) return;
      await saveProfile(selectedId, draft as ProfileInput);
      await saveProfileMemory(selectedId, memory);
      await load(selectedId);
    }, "Guardado: alma y memoria actualizadas.");

  const destroy = () => {
    if (!selectedId || !draft) return;
    if (!window.confirm(`¿Borrar a ${draft.name}? Se pierde su alma y su memoria.`)) return;
    void run(async () => {
      await removeProfile(selectedId);
      setSelectedId(null);
      await load(null);
    }, "Agente borrado.");
  };

  const withNameRole = (patch: Partial<Draft>) => {
    if (!draft) return;
    const follows = draft.avatarSeed === seedForAgent(draft.name, draft.role);
    const next = { ...draft, ...patch };
    setDraft({
      ...next,
      avatarSeed: follows ? seedForAgent(next.name, next.role) : next.avatarSeed,
    });
  };

  const changeProvider = (provider: ProviderId) => {
    const first = catalog[provider]?.find((model) => model.id)?.id ?? "";
    setDraft((prev) => (prev ? { ...prev, provider, model: first } : prev));
  };

  const observationsList = observations
    .map((item) => {
      const title = typeof item.title === "string" ? item.title : "Reunión";
      const summary = typeof item.summary === "string" ? item.summary : "";
      const at = typeof item.at === "number" ? new Date(item.at) : null;
      return { title, summary, at };
    })
    .filter((item) => item.summary);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-wide profiles-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>Agentes</h2>
            <p>
              Cada agente tiene su propia alma y memoria. Se cargan en cada turno, como el
              SOUL.md y los recuerdos de Hermes.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </header>

        <div className="profiles-layout">
          <aside className="profiles-list">
            <button type="button" className="primary-btn" onClick={create} disabled={busy}>
              + Crear agente
            </button>

            {profiles.length === 0 ? (
              <div className="profiles-empty">
                <p>Todavía no hay agentes.</p>
                <button type="button" className="ghost-btn" onClick={create} disabled={busy}>
                  Crear el primero
                </button>
                <button type="button" className="ghost-btn" onClick={seed} disabled={busy}>
                  Crear equipo de ejemplo
                </button>
              </div>
            ) : (
              <ul>
                {profiles.map((profile) => (
                  <li key={profile.id}>
                    <button
                      type="button"
                      className={`profile-row ${profile.id === selectedId ? "is-selected" : ""}`}
                      onClick={() => select(profile)}
                    >
                      <span className="avatar avatar-sm face-avatar">
                        <AgentFace
                          seed={profile.avatarSeed}
                          name={profile.name}
                          role={profile.role}
                          size={30}
                        />
                      </span>
                      <span className="profile-row-info">
                        <strong>{profile.name}</strong>
                        <span>{profile.role}</span>
                      </span>
                      <span className="profile-badge">{profile.memory.observations}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="profiles-editor">
            {!draft ? (
              <div className="profiles-empty big">
                <p>Elige un agente o crea uno nuevo.</p>
                <button type="button" className="ghost-btn" onClick={seed} disabled={busy}>
                  Crear equipo de ejemplo
                </button>
              </div>
            ) : (
              <>
                <div className="face-editor">
                  <span className="avatar face-avatar face-preview">
                    <AgentFace
                      seed={draft.avatarSeed}
                      name={draft.name}
                      role={draft.role}
                      size={84}
                    />
                  </span>
                  <div className="face-editor-info">
                    <strong>{draft.name || "Nuevo agente"}</strong>
                    <p className="muted-note">
                      Cara generada a partir del nombre, con ojos blancos. Cambia la variante si
                      quieres otra.
                    </p>
                    <button
                      type="button"
                      className="ghost-btn small"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          avatarSeed: Math.floor(Math.random() * 4294967295),
                        })
                      }
                    >
                      Cambiar cara
                    </button>
                  </div>
                </div>

                <div className="editor-grid">
                  <label className="field">
                    <span>Nombre</span>
                    <input
                      value={draft.name}
                      maxLength={40}
                      onChange={(event) => withNameRole({ name: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Rol</span>
                    <input
                      value={draft.role}
                      maxLength={40}
                      onChange={(event) => withNameRole({ role: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Rol de la biblioteca</span>
                    <select
                      value={draft.roleId ?? ""}
                      onChange={(event) => {
                        const roleId = event.target.value;
                        const role = library.roles.find((item) => item.id === roleId);
                        withNameRole({
                          roleId: role?.id ?? null,
                          role: role?.name ?? draft.role,
                          skillIds: role ? role.skillIds : draft.skillIds,
                        });
                      }}
                    >
                      <option value="">Personalizado</option>
                      {library.roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Proveedor</span>
                    <select
                      value={draft.provider}
                      onChange={(event) => changeProvider(event.target.value as ProviderId)}
                    >
                      {PROVIDERS.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Modelo</span>
                    <input
                      list={`models-${draft.provider}`}
                      value={draft.model}
                      placeholder="modelo del CLI"
                      onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                    />
                    <datalist id={`models-${draft.provider}`}>
                      {(catalog[draft.provider] ?? []).map((model) => (
                        <option key={model.id || "default"} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </datalist>
                  </label>
                </div>

                <div className="skills-block">
                  <div className="skills-head">
                    <span>Skills activas ({draft.skillIds.length})</span>
                    <span className="muted-note">
                      {library.roles.find((role) => role.id === draft.roleId)?.description ??
                        "Instrucciones extra que el agente recibe en cada turno."}
                    </span>
                  </div>
                  <div className="skill-chips">
                    {library.skills.length ? (
                      library.skills.map((skill) => {
                        const active = draft.skillIds.includes(skill.id);
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            className={`skill-chip ${active ? "is-on" : ""}`}
                            title={skill.description}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                skillIds: active
                                  ? draft.skillIds.filter((id) => id !== skill.id)
                                  : [...draft.skillIds, skill.id],
                              })
                            }
                          >
                            {skill.name}
                          </button>
                        );
                      })
                    ) : (
                      <span className="muted-note">No hay skills en la biblioteca.</span>
                    )}
                  </div>
                </div>

                <label className="field">
                  <span>Alma (SOUL.md)</span>
                  <textarea
                    className="soul-editor"
                    value={draft.soul}
                    onChange={(event) => setDraft({ ...draft, soul: event.target.value })}
                    spellCheck={false}
                  />
                </label>

                <div className="memory-head">
                  <div className="memory-tabs">
                    <button
                      type="button"
                      className={`mode-btn ${tab === "knowledge" ? "is-selected" : ""}`}
                      onClick={() => setTab("knowledge")}
                    >
                      Conocimiento
                    </button>
                    <button
                      type="button"
                      className={`mode-btn ${tab === "user" ? "is-selected" : ""}`}
                      onClick={() => setTab("user")}
                    >
                      Sobre el humano
                    </button>
                    <button
                      type="button"
                      className={`mode-btn ${tab === "history" ? "is-selected" : ""}`}
                      onClick={() => setTab("history")}
                    >
                      Historial ({observationsList.length})
                    </button>
                  </div>
                  <span className="memory-meta">
                    <MicIcon size={12} /> memoria persistente
                  </span>
                </div>

                {tab === "history" ? (
                  observationsList.length ? (
                    <ul className="observation-list">
                      {observationsList.map((item, index) => (
                        <li key={index}>
                          <span className="observation-time">
                            {item.at
                              ? item.at.toLocaleString([], {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : ""}
                          </span>
                          <strong>{item.title}</strong>
                          <p>{item.summary}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="picker-empty">
                      Sin historial todavía. Se llena al terminar cada reunión.
                    </p>
                  )
                ) : (
                  <textarea
                    className="memory-editor"
                    value={tab === "user" ? memory.user : memory.memory}
                    placeholder={
                      tab === "user"
                        ? "Hechos estables sobre el humano: cómo trabaja, qué prefiere, qué objetivos tiene."
                        : "Decisiones, convenciones y riesgos que este agente debe recordar."
                    }
                    onChange={(event) =>
                      setMemory((prev) =>
                        tab === "user"
                          ? { ...prev, user: event.target.value }
                          : { ...prev, memory: event.target.value },
                      )
                    }
                    spellCheck={false}
                  />
                )}

                {note && <p className="editor-note">{note}</p>}

                {promptPreview !== null && (
                  <pre className="prompt-preview">{promptPreview}</pre>
                )}

                <footer className="editor-foot">
                  <button type="button" className="danger-btn" onClick={destroy} disabled={busy}>
                    Borrar
                  </button>
                  <button
                    type="button"
                    className="ghost-btn small"
                    onClick={async () => {
                      if (promptPreview !== null) {
                        setPromptPreview(null);
                        return;
                      }
                      if (!selectedId) return;
                      try {
                        const data = await getProfilePrompt(selectedId);
                        setPromptPreview(data.prompt);
                      } catch {
                        setNote("No se pudo componer el prompt.");
                      }
                    }}
                  >
                    {promptPreview === null ? "Ver prompt" : "Ocultar prompt"}
                  </button>
                  <span className="memory-meta">
                    <SlidersIcon size={12} /> {draft.provider} / {draft.model || "CLI default"}
                  </span>
                  <button type="button" className="primary-btn" onClick={save} disabled={busy}>
                    {busy ? "Guardando…" : "Guardar"}
                  </button>
                </footer>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
