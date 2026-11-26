import { useEffect, useMemo, useState } from "react";
import type { Profile, ProjectSelection, ProviderId, ProviderStatus, Session, SpeakingMode } from "../../shared/types";
import {
  createSession,
  getProfiles,
  getProviders,
  getRecentSessions,
  getSession,
  getTools,
  seedProfiles,
  type SessionSummary,
} from "../api";
import { AgentFace } from "./AgentFace";
import { MicIcon, MicOffIcon, SlidersIcon } from "./Icons";
import { LibraryModal } from "./LibraryModal";
import { T3Threads } from "./T3Threads";
import { projectName, ProjectsDialog } from "./ProjectsDialog";
import { ProjectTeam } from "./ProjectTeam";
import { ProfilesModal } from "./ProfilesModal";
import { SettingsModal } from "./SettingsModal";

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  opencode: "OpenCode",
};

const shortModel = (model: string) => {
  if (!model) return "modelo CLI";
  const tail = model.split("/").pop() ?? model;
  return tail.length > 20 ? `${tail.slice(0, 19)}…` : tail;
};

export function Lobby({
  humanName,
  onName,
  onStart,
}: {
  humanName: string;
  onName: (name: string) => void;
  onStart: (session: Session) => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState("Reunión de equipo");
  const [agenda, setAgenda] = useState("");
  const [speakingMode, setSpeakingMode] = useState<SpeakingMode>("auto");
  const [toolsEnabled, setToolsEnabled] = useState(false);
  const [projects, setProjects] = useState<ProjectSelection | null>(null);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [compressTools, setCompressTools] = useState(true);
  const [rtk, setRtk] = useState<{ installed: boolean; version: string | null } | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [masked, setMasked] = useState<Record<string, string | null>>({});
  const [mode, setMode] = useState<"auto" | "cli" | "api">("auto");
  const [recent, setRecent] = useState<SessionSummary[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfiles = async () => {
    const list = await getProfiles();
    setProfiles(list);
    setSelected((prev) => {
      const available = new Set(list.map((profile) => profile.id));
      const kept = [...prev].filter((id) => available.has(id));
      return new Set(kept.length ? kept : list.map((profile) => profile.id));
    });
  };

  const loadProviders = () => {
    getProviders()
      .then((data) => {
        setProviders(data.providers);
        setMasked(data.masked);
        setMode(data.mode);
      })
      .catch(() => setError("No se pudo hablar con el servidor. ¿Está corriendo `npm run dev`?"));
  };

  useEffect(() => {
    loadProfiles().catch(() => setError("No se pudo cargar la biblioteca de agentes."));
    loadProviders();
    getTools()
      .then((status) => setRtk(status.rtk))
      .catch(() => undefined);
    getRecentSessions().then(setRecent).catch(() => undefined);
  }, []);

  const selectedProfiles = useMemo(
    () => profiles.filter((profile) => selected.has(profile.id)),
    [profiles, selected],
  );

  const configuredCount = providers.filter((provider) => provider.configured).length;
  const offlineAgents = selectedProfiles.filter((profile) => {
    const status = providers.find((provider) => provider.id === profile.provider);
    return status ? !status.configured : false;
  }).length;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createSampleTeam = async () => {
    try {
      await seedProfiles();
      await loadProfiles();
    } catch {
      setError("No se pudo crear el equipo de ejemplo.");
    }
  };

  const start = async () => {
    if (!projects || generating) return;
    if (!selectedProfiles.length) {
      setError("Selecciona al menos un agente.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      localStorage.setItem("za:name", humanName);
      const session = await createSession({
        title: title.trim() || "Reunión sin título",
        agenda,
        speakingMode,
        profileIds: selectedProfiles.map((profile) => profile.id),
        muted,
        toolsEnabled,
        projects,
        compressTools: toolsEnabled && compressTools,
      });
      onStart(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo crear la sala.");
    } finally {
      setStarting(false);
    }
  };

  const joinRecent = async (id: string) => {
    try {
      onStart(await getSession(id));
    } catch {
      setError("Esa reunión ya no existe.");
    }
  };

  return (
    <div className="lobby">
      <header className="lobby-top">
        <div className="brand">
          <span className="brand-mark">
            <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
              <g stroke="#3ddc97" strokeWidth="5" strokeLinecap="round">
                {[0, 45, 90, 135].map((angle) => (
                  <line key={angle} x1="32" y1="9" x2="32" y2="20" transform={`rotate(${angle} 32 32)`} />
                ))}
              </g>
              <circle cx="32" cy="32" r="5" fill="#3ddc97" />
            </svg>
          </span>
          <span>ZoomAgents</span>
        </div>
        <div className="lobby-actions">
          <button type="button" className="ghost-btn" onClick={() => setLibraryOpen(true)}>
            Roles y skills
          </button>
          <button type="button" className="ghost-btn" onClick={() => setProfilesOpen(true)}>
            <SlidersIcon size={16} /> Agentes
          </button>
          <button type="button" className="ghost-btn" onClick={() => setSettingsOpen(true)}>
            {configuredCount ? `${configuredCount} proveedor${configuredCount > 1 ? "es" : ""}` : "Configurar keys"}
          </button>
        </div>
      </header>

      <section className="hero">
        <h1>Abre un proyecto</h1>
        <p>Elige la carpeta de trabajo. Puedes generar un equipo a partir de su estructura o usar tus agentes existentes.</p>
      </section>

      <section className="setup-card" aria-label="Proyecto de la reunión">
        <div className="setup-head">
          <div>
            <h2>{projects ? projectName(projects.workspace) : "Proyecto principal"}</h2>
            {projects && <span className="muted-note project-workspace">{projects.workspace}{projects.references.length ? ` · ${projects.references.length} de referencia` : ""}</span>}
          </div>
          <div className="lobby-actions">
          <button type="button" className={projects ? "ghost-btn" : "primary-btn"} disabled={generating} onClick={() => setProjectsOpen(true)}>
            {projects ? "Cambiar proyecto" : "Abrir proyecto"}
          </button>
            {projects && <button type="button" className="ghost-btn" onClick={() => setThreadsOpen(true)}>Hilos de trabajo</button>}
          </div>
        </div>
        {projects && (
          <ProjectTeam
            key={projects.workspace}
            workspace={projects.workspace}
            providers={providers}
            onGenerating={setGenerating}
            onCreated={(created) => {
              setProfiles((previous) => [...previous, ...created.filter((profile) => !previous.some((item) => item.id === profile.id))]);
              setSelected((previous) => new Set([
                ...(hasGenerated ? previous : []),
                ...created.map(({ id }) => id),
              ]));
              setHasGenerated(true);
            }}
          />
        )}
      </section>

      <section className="lobby-grid">
        <div className="setup-card">
          <div className="setup-head">
            <h2>Tu equipo</h2>
            <span className="muted-note">
              {profiles.length ? `${selectedProfiles.length} de ${profiles.length} en la sala` : "Sin agentes"}
            </span>
          </div>

          {profiles.length === 0 ? (
            <div className="empty-team">
              <p>
                Todavía no hay agentes. Crea el primero con su alma y su modelo, o genera un equipo
                de ejemplo editable.
              </p>
              <div className="empty-actions">
                <button type="button" className="primary-btn" onClick={() => setProfilesOpen(true)}>
                  Crear agente
                </button>
                <button type="button" className="ghost-btn" onClick={createSampleTeam}>
                  Crear equipo de ejemplo
                </button>
              </div>
            </div>
          ) : (
            <div className="agent-grid">
              {profiles.map((profile) => {
                const isSelected = selected.has(profile.id);
                const isMuted = Boolean(muted[profile.id]);
                const status = providers.find((provider) => provider.id === profile.provider);
                const missing = status && !status.configured;
                return (
                  <article
                    key={profile.id}
                    className={`agent-card ${isSelected ? "is-selected" : ""} ${
                      isMuted ? "is-muted" : ""
                    }`}
                  >
                    <button type="button" className="agent-main" onClick={() => toggle(profile.id)}>
                      <span className="avatar avatar-sm face-avatar">
                        <AgentFace
                          seed={profile.avatarSeed}
                          name={profile.name}
                          role={profile.role}
                          size={30}
                        />
                      </span>
                      <span className="agent-info">
                        <strong>{profile.name}</strong>
                        <span>{profile.role}</span>
                      </span>
                      <span className={`agent-check ${isSelected ? "is-on" : ""}`}>
                        {isSelected ? "✓" : ""}
                      </span>
                    </button>
                    <div className="agent-meta">
                      <span className={`provider-tag ${missing ? "is-warning" : ""}`}>
                        {missing ? "sin conexión" : PROVIDER_LABELS[profile.provider]}
                      </span>
                      <span className="person-model" title={profile.model}>
                        {shortModel(profile.model)}
                      </span>
                      <span className="agent-memory" title="Recuerdos guardados">
                        {profile.memory.observations}
                      </span>
                      <button
                        type="button"
                        className={`mini-toggle ${isMuted ? "is-off" : ""}`}
                        onClick={() =>
                          setMuted((prev) => ({ ...prev, [profile.id]: !isMuted }))
                        }
                        title={isMuted ? "Darle voz" : "Silenciar en esta sala"}
                        aria-label={isMuted ? `Darle voz a ${profile.name}` : `Silenciar a ${profile.name}`}
                      >
                        {isMuted ? <MicOffIcon size={14} /> : <MicIcon size={14} />}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <p className="legal-note">
            El alma y la memoria viven en data/profiles. Se cargan en cada turno y se actualizan al
            terminar la reunión.
          </p>
        </div>

        <div className="setup-card setup-room">
          <div className="setup-head">
            <h2>La reunión</h2>
          </div>

          <div className="speaking-toggle" role="radiogroup" aria-label="Quién habla">
            <button
              type="button"
              role="radio"
              aria-checked={speakingMode === "auto"}
              className={`mode-btn ${speakingMode === "auto" ? "is-selected" : ""}`}
              onClick={() => setSpeakingMode("auto")}
            >
              Automático
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={speakingMode === "all"}
              className={`mode-btn ${speakingMode === "all" ? "is-selected" : ""}`}
              onClick={() => setSpeakingMode("all")}
            >
              Todos
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={speakingMode === "moderated"}
              className={`mode-btn ${speakingMode === "moderated" ? "is-selected" : ""}`}
              onClick={() => setSpeakingMode("moderated")}
            >
              Moderador
            </button>
          </div>
          <p className="mode-hint">
            {speakingMode === "auto"
              ? "Responde primero a quien menciones por su rol (ej. Backend Dev) o quien tenga algo nuevo. No hablan todos."
              : speakingMode === "all"
                ? `Cada agente con voz responderá en cada turno (${selectedProfiles.length}).`
                : "El moderador elige hasta tres agentes por turno."}
          </p>
          <p className="muted-note">
            Para dirigirte a alguien, menciona su rol: “Backend Dev, ¿qué opinas?”. Varios
            agentes comparten nombre, el rol es el identificador.
          </p>

          <label className="field">
            <span>Tu nombre</span>
            <input
              value={humanName}
              placeholder="Robel"
              onChange={(event) => onName(event.target.value)}
              maxLength={32}
            />
          </label>

          <label className="field">
            <span>Título</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
          </label>

          <label className="field">
            <span>Agenda</span>
            <textarea
              value={agenda}
              onChange={(event) => setAgenda(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Qué hay que decidir hoy"
            />
          </label>

          <div className="tools-toggle">
            <label className="remember-row">
              <input
                type="checkbox"
                checked={toolsEnabled}
                onChange={(event) => setToolsEnabled(event.target.checked)}
              />
              Acceso a terminal
            </label>

          </div>
          {toolsEnabled && (
            <>
              <label className="remember-row">
                <input
                  type="checkbox"
                  checked={compressTools && Boolean(rtk?.installed)}
                  disabled={!rtk?.installed}
                  onChange={(event) => setCompressTools(event.target.checked)}
                />
                Comprimir salida de terminal con RTK
                <span className={`tool-status ${rtk?.installed ? "is-on" : ""}`}>
                  {rtk?.installed ? (rtk.version ?? "instalado") : "no instalado"}
                </span>
              </label>
              {!rtk?.installed && (
                <p className="muted-note">
                  RTK reduce tests, logs y `git status` antes de que el agente los lea.
                  Instálalo con <code>brew install rtk</code> o{" "}
                  <code>curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/master/install.sh | sh</code>.
                </p>
              )}
              <p className="warn-note">
                Los agentes podrán ejecutar comandos en tu máquina con tus permisos. Cada comando
                sudo te pide aprobación y la contraseña no se guarda en disco.
              </p>
            </>
          )}

          <div className="provider-strip">
            {providers.map((provider) => (
              <span key={provider.id} className="provider-chip" title={provider.hint}>
                <span className={`status-dot ${provider.configured ? "is-on" : ""}`} />
                {provider.label}
                <em className={provider.cli?.authenticated ? "is-cli" : provider.apiConfigured ? "is-api" : ""}>
                  {provider.cli?.authenticated ? "CLI" : provider.apiConfigured ? "API" : "—"}
                </em>
                {masked[provider.id] && !provider.cli?.authenticated ? <em>{masked[provider.id]}</em> : null}
              </span>
            ))}
            <span className="provider-chip mode-chip">
              <em>{mode === "auto" ? "AUTO" : mode === "cli" ? "CLI" : "API"}</em>
              {mode === "auto" ? "automático" : mode === "cli" ? "suscripción" : "por clave"}
            </span>
          </div>

          {offlineAgents > 0 && (
            <p className="warn-note">
              {offlineAgents} agente{offlineAgents > 1 ? "s" : ""} sin conexión (CLI o API key):
              no podrá responder hasta que conectes su proveedor.
              <button type="button" className="link-btn" onClick={() => setSettingsOpen(true)}>
                Configurar
              </button>
            </p>
          )}

          {error && <p className="error-note">{error}</p>}

          <button
            type="button"
            className="primary-btn big"
            onClick={start}
            disabled={!projects || generating || starting || !selectedProfiles.length}
          >
            {!projects
              ? "Abre un proyecto para entrar"
              : starting
              ? "Abriendo la sala…"
              : `Entrar con ${selectedProfiles.length} agente${selectedProfiles.length === 1 ? "" : "s"}`}
          </button>
          <p className="legal-note">
            Micrófono y cámara son locales. Nada se publica fuera de tu máquina sin una API key propia.
          </p>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="recent">
          <h2>Reuniones anteriores</h2>
          <ul>
            {recent.slice(0, 4).map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => joinRecent(item.id)}>
                  <span className="recent-title">{item.title}</span>
                  <span className="recent-meta">
                    {new Date(item.createdAt).toLocaleString([], {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {item.participants} agentes · {item.phase === "ended" ? "terminada" : "abierta"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="lobby-foot">
        <span>Un alma, una memoria y una silla en la sala.</span>
      </footer>

      <ProfilesModal
        open={profilesOpen}
        onClose={() => setProfilesOpen(false)}
        onChanged={() => {
          loadProfiles().catch(() => undefined);
        }}
      />
      <LibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onChanged={() => {
          loadProfiles().catch(() => undefined);
        }}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={loadProviders} />
      {threadsOpen && projects?.workspace && <T3Threads workspace={projects?.workspace} onClose={() => setThreadsOpen(false)} />}
      {projectsOpen && <ProjectsDialog initial={projects} onClose={() => setProjectsOpen(false)} onSave={(next) => {
        if (next.workspace !== projects?.workspace) setHasGenerated(false);
        setProjects(next);
      }} />}
    </div>
  );
}
