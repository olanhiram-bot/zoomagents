import { useEffect, useState } from "react";
import type { AuthMode, ProviderStatus } from "../../shared/types";
import {
  getProviders,
  openLoginTerminal,
  refreshAuth,
  saveAuthMode,
  saveKeys,
} from "../api";
import { CheckIcon, CloseIcon } from "./Icons";

const FIELDS = [
  {
    id: "anthropic",
    label: "Anthropic",
    placeholder: "sk-ant-...",
    console: "https://console.anthropic.com/settings/keys",
    action: "Crear key",
  },
  {
    id: "openai",
    label: "OpenAI",
    placeholder: "sk-...",
    console: "https://platform.openai.com/api-keys",
    action: "Crear key",
  },
  {
    id: "google",
    label: "Google",
    placeholder: "AIza...",
    console: "https://aistudio.google.com/apikey",
    action: "Crear key",
  },
] as const;

const MODES: { id: AuthMode; label: string; hint: string }[] = [
  { id: "auto", label: "Automático", hint: "Usa el CLI si hay sesión; si no, la API key." },
  { id: "cli", label: "Suscripción", hint: "Solo CLIs oficiales, con tu login OAuth." },
  { id: "api", label: "API key", hint: "Solo claves de proveedor, facturadas por token." },
];

export function SettingsModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [mode, setMode] = useState<AuthMode>("auto");
  const [masked, setMasked] = useState<Record<string, string | null>>({});
  const [values, setValues] = useState<Record<string, string>>({ anthropic: "", openai: "", google: "" });
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);
  const [terminalNote, setTerminalNote] = useState<string | null>(null);

  const apply = (data: Awaited<ReturnType<typeof getProviders>>) => {
    setProviders(data.providers);
    setMasked(data.masked);
    setMode(data.mode);
  };

  const load = async () => {
    apply(await getProviders());
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    setSaved(false);
    setTerminalNote(null);
    load().catch(() => setError("No se pudo leer el estado de los proveedores."));
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

  const changeMode = async (next: AuthMode) => {
    setMode(next);
    setError(null);
    try {
      apply(await saveAuthMode(next));
      onSaved();
    } catch {
      setError("No se pudo cambiar el modo de conexión.");
    }
  };

  const launchLogin = async (command: string) => {
    setLaunching(command);
    setTerminalNote(null);
    try {
      const result = await openLoginTerminal(command);
      setTerminalNote(
        `Abriendo ${result.terminal} con \`${result.command}\`. Completa el login ahí y pulsa Verificar sesiones.`,
      );
    } catch (caught) {
      setTerminalNote(
        caught instanceof Error ? caught.message : "No se pudo abrir la terminal.",
      );
    } finally {
      setLaunching(null);
    }
  };

  const recheck = async () => {
    setChecking(true);
    setError(null);
    try {
      await refreshAuth();
      await load();
      onSaved();
    } catch {
      setError("No se pudo verificar las sesiones de los CLIs.");
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      apply(await saveKeys(values));
      setValues({ anthropic: "", openai: "", google: "" });
      setSaved(true);
      onSaved();
    } catch {
      setError("No se pudieron guardar las keys.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>Proveedores</h2>
            <p>
              ZoomAgents no guarda tokens. Con «Suscripción» usa la sesión OAuth del CLI oficial de
              cada proveedor; con «API key», una clave propia.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </header>

        <div className="settings-mode">
          <div className="mode-group" role="radiogroup" aria-label="Modo de conexión">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={mode === item.id}
                className={`mode-btn ${mode === item.id ? "is-selected" : ""}`}
                onClick={() => changeMode(item.id)}
                title={item.hint}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" className="ghost-btn" onClick={recheck} disabled={checking}>
            {checking ? "Verificando…" : "Verificar sesiones"}
          </button>
        </div>
        <p className="mode-hint">{MODES.find((item) => item.id === mode)?.hint}</p>

        <div className="settings-list">
          {FIELDS.map((field) => {
            const provider = providers.find((item) => item.id === field.id);
            const cli = provider?.cli;
            return (
              <div key={field.id} className="settings-row">
                <label className="settings-label" htmlFor={`key-${field.id}`}>
                  <span className={`status-dot ${provider?.configured ? "is-on" : ""}`} />
                  {field.label}
                </label>

                <div className="settings-control">
                  <input
                    id={`key-${field.id}`}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={masked[field.id] ?? field.placeholder}
                    value={values[field.id]}
                    onChange={(event) => setValues((prev) => ({ ...prev, [field.id]: event.target.value }))}
                  />

                  <span className="settings-hint">
                    {provider?.hint ?? ""}{" "}
                    <a className="hint-link" href={field.console} target="_blank" rel="noreferrer">
                      {field.action} ↗
                    </a>
                  </span>

                  {cli && (
                    <div className={`cli-card ${cli.authenticated ? "is-on" : ""}`}>
                      <div className="cli-main">
                        <span className={`status-dot ${cli.authenticated ? "is-on" : ""}`} />
                        <strong>{cli.label}</strong>
                        <span className="cli-state">
                          {cli.authenticated
                            ? `Conectado${cli.account ? ` · ${cli.account}` : ""}`
                            : cli.installed
                              ? "Instalado, sin sesión"
                              : "No instalado"}
                        </span>
                        {cli.version && <em className="cli-version">{cli.version}</em>}
                      </div>
                      {!cli.authenticated && (
                        <p className="cli-login">
                          {cli.detail ?? ""} {cli.installed ? "Comando:" : ""}{" "}
                          {cli.installed && <code>{cli.loginCommand}</code>}
                        </p>
                      )}
                      {cli.installed && (
                        <div className="cli-actions">
                          <button
                            type="button"
                            className="ghost-btn small"
                            onClick={() => launchLogin(cli.loginCommand)}
                            disabled={launching === cli.loginCommand}
                          >
                            {launching === cli.loginCommand
                              ? "Abriendo…"
                              : cli.authenticated
                                ? "Reabrir login en terminal"
                                : "Abrir terminal de login"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {terminalNote && <p className="terminal-note">{terminalNote}</p>}
        {error && <p className="error-note settings-error">{error}</p>}

        <footer className="modal-foot">
          <span className="modal-note">
            {saved ? (
              <span className="ok-note">
                <CheckIcon size={14} /> Guardado
              </span>
            ) : (
              "Las keys quedan en data/settings.json (600). Los CLIs usan su propio llavero. También puedes usar .env."
            )}
          </span>
          <button type="button" className="primary-btn" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar keys"}
          </button>
        </footer>
      </div>
    </div>
  );
}
