import { useEffect, useState } from "react";
import type { Library, Role, Skill } from "../../shared/types";
import {
  createRole,
  createSkill,
  getLibrary,
  removeRole,
  removeSkill,
  saveRole,
  saveSkill,
} from "../api";
import { CloseIcon } from "./Icons";

type SkillDraft = { name: string; description: string; instructions: string };
type RoleDraft = { name: string; description: string; prompt: string; skillIds: string[] };

export function LibraryModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [library, setLibrary] = useState<Library>({ skills: [], roles: [] });
  const [tab, setTab] = useState<"skills" | "roles">("skills");
  const [skillId, setSkillId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [skillDraft, setSkillDraft] = useState<SkillDraft | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = async (preferredSkill?: string | null, preferredRole?: string | null) => {
    const data = await getLibrary();
    setLibrary(data);

    const nextSkillId =
      preferredSkill === null
        ? data.skills[0]?.id ?? null
        : preferredSkill ?? skillId ?? data.skills[0]?.id ?? null;
    const nextRoleId =
      preferredRole === null
        ? data.roles[0]?.id ?? null
        : preferredRole ?? roleId ?? data.roles[0]?.id ?? null;

    setSkillId(nextSkillId);
    setRoleId(nextRoleId);

    const skill = data.skills.find((item) => item.id === nextSkillId);
    const role = data.roles.find((item) => item.id === nextRoleId);
    setSkillDraft(
      skill
        ? { name: skill.name, description: skill.description, instructions: skill.instructions }
        : null,
    );
    setRoleDraft(
      role
        ? {
            name: role.name,
            description: role.description,
            prompt: role.prompt,
            skillIds: role.skillIds,
          }
        : null,
    );
  };

  useEffect(() => {
    if (!open) return;
    setNote(null);
    setTab("skills");
    load().catch(() => setNote("No se pudo cargar la biblioteca."));
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

  const selectSkill = (skill: Skill) => {
    setSkillId(skill.id);
    setSkillDraft({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
    });
    setNote(null);
  };

  const selectRole = (role: Role) => {
    setRoleId(role.id);
    setRoleDraft({
      name: role.name,
      description: role.description,
      prompt: role.prompt,
      skillIds: role.skillIds,
    });
    setNote(null);
  };

  const newSkill = () =>
    run(async () => {
      const skill = await createSkill({
        name: "Nueva skill",
        description: "",
        instructions: "",
      });
      await load(skill.id, undefined);
      setTab("skills");
    }, "Skill creada.");

  const newRole = () =>
    run(async () => {
      const role = await createRole({
        name: "Nuevo rol",
        description: "",
        prompt: "",
        skillIds: [],
      });
      await load(undefined, role.id);
      setTab("roles");
    }, "Rol creado.");

  const persistSkill = () =>
    run(async () => {
      if (!skillId || !skillDraft) return;
      await saveSkill(skillId, skillDraft);
      await load(skillId, undefined);
    }, "Skill guardada.");

  const persistRole = () =>
    run(async () => {
      if (!roleId || !roleDraft) return;
      await saveRole(roleId, roleDraft);
      await load(undefined, roleId);
    }, "Rol guardado.");

  const dropSkill = () => {
    if (!skillId || !skillDraft) return;
    if (!window.confirm(`¿Borrar la skill "${skillDraft.name}"? Se quita de todos los roles.`)) return;
    void run(async () => {
      await removeSkill(skillId);
      await load(null, undefined);
    }, "Skill borrada.");
  };

  const dropRole = () => {
    if (!roleId || !roleDraft) return;
    if (!window.confirm(`¿Borrar el rol "${roleDraft.name}"? Los agentes que lo usan quedan sin rol.`))
      return;
    void run(async () => {
      await removeRole(roleId);
      await load(undefined, null);
    }, "Rol borrado.");
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-wide profiles-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>Roles y skills</h2>
            <p>
              Los roles definen la misión del asiento; las skills son instrucciones reutilizables que
              se cargan en cada turno. Se guardan como Markdown en data/library.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </header>

        <div className="picker-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "skills"}
            className={`mode-btn ${tab === "skills" ? "is-selected" : ""}`}
            onClick={() => setTab("skills")}
          >
            Skills
            <span className="tab-count">{library.skills.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "roles"}
            className={`mode-btn ${tab === "roles" ? "is-selected" : ""}`}
            onClick={() => setTab("roles")}
          >
            Roles
            <span className="tab-count">{library.roles.length}</span>
          </button>
        </div>

        <div className="profiles-layout">
          <aside className="profiles-list">
            <button
              type="button"
              className="primary-btn"
              onClick={tab === "skills" ? newSkill : newRole}
              disabled={busy}
            >
              + {tab === "skills" ? "Crear skill" : "Crear rol"}
            </button>

            {tab === "skills" ? (
              <ul>
                {library.skills.map((skill) => (
                  <li key={skill.id}>
                    <button
                      type="button"
                      className={`profile-row ${skill.id === skillId ? "is-selected" : ""}`}
                      onClick={() => selectSkill(skill)}
                    >
                      <span className="profile-row-info">
                        <strong>{skill.name}</strong>
                        <span>{skill.description || "Sin descripción"}</span>
                      </span>
                      {skill.builtin && <span className="profile-badge">base</span>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul>
                {library.roles.map((role) => (
                  <li key={role.id}>
                    <button
                      type="button"
                      className={`profile-row ${role.id === roleId ? "is-selected" : ""}`}
                      onClick={() => selectRole(role)}
                    >
                      <span className="profile-row-info">
                        <strong>{role.name}</strong>
                        <span>{role.description || "Sin descripción"}</span>
                      </span>
                      <span className="profile-badge">{role.skillIds.length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="profiles-editor">
            {tab === "skills" ? (
              !skillDraft ? (
                <div className="profiles-empty big">
                  <p>Elige una skill o crea una nueva.</p>
                </div>
              ) : (
                <>
                  <div className="editor-grid">
                    <label className="field">
                      <span>Nombre</span>
                      <input
                        value={skillDraft.name}
                        maxLength={60}
                        onChange={(event) =>
                          setSkillDraft({ ...skillDraft, name: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Descripción</span>
                      <input
                        value={skillDraft.description}
                        maxLength={200}
                        onChange={(event) =>
                          setSkillDraft({ ...skillDraft, description: event.target.value })
                        }
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>Instrucciones (qué hace y cómo)</span>
                    <textarea
                      className="soul-editor"
                      value={skillDraft.instructions}
                      placeholder="Procedimiento, checklist, criterios y formato de salida."
                      spellCheck={false}
                      onChange={(event) =>
                        setSkillDraft({ ...skillDraft, instructions: event.target.value })
                      }
                    />
                  </label>

                  {note && <p className="editor-note">{note}</p>}

                  <footer className="editor-foot">
                    <button type="button" className="danger-btn" onClick={dropSkill} disabled={busy}>
                      Borrar
                    </button>
                    <span className="memory-meta">Se inyecta al prompt del agente</span>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={persistSkill}
                      disabled={busy}
                    >
                      {busy ? "Guardando…" : "Guardar skill"}
                    </button>
                  </footer>
                </>
              )
            ) : !roleDraft ? (
              <div className="profiles-empty big">
                <p>Elige un rol o crea uno nuevo.</p>
              </div>
            ) : (
              <>
                <div className="editor-grid">
                  <label className="field">
                    <span>Nombre</span>
                    <input
                      value={roleDraft.name}
                      maxLength={60}
                      onChange={(event) => setRoleDraft({ ...roleDraft, name: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Descripción</span>
                    <input
                      value={roleDraft.description}
                      maxLength={200}
                      onChange={(event) =>
                        setRoleDraft({ ...roleDraft, description: event.target.value })
                      }
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Misión del rol (se suma al alma del agente)</span>
                  <textarea
                    className="soul-editor"
                    value={roleDraft.prompt}
                    placeholder="Qué optimiza este asiento, cómo decide y qué rechaza."
                    spellCheck={false}
                    onChange={(event) => setRoleDraft({ ...roleDraft, prompt: event.target.value })}
                  />
                </label>

                <div className="skills-block">
                  <div className="skills-head">
                    <span>Skills del rol ({roleDraft.skillIds.length})</span>
                    <span className="muted-note">
                      Se aplican al elegir este rol, y luego puedes ajustarlas por agente.
                    </span>
                  </div>
                  <div className="skill-chips">
                    {library.skills.map((skill) => {
                      const active = roleDraft.skillIds.includes(skill.id);
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          className={`skill-chip ${active ? "is-on" : ""}`}
                          title={skill.description}
                          onClick={() =>
                            setRoleDraft({
                              ...roleDraft,
                              skillIds: active
                                ? roleDraft.skillIds.filter((id) => id !== skill.id)
                                : [...roleDraft.skillIds, skill.id],
                            })
                          }
                        >
                          {skill.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {note && <p className="editor-note">{note}</p>}

                <footer className="editor-foot">
                  <button type="button" className="danger-btn" onClick={dropRole} disabled={busy}>
                    Borrar
                  </button>
                  <span className="memory-meta">{roleDraft.skillIds.length} skills asignadas</span>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={persistRole}
                    disabled={busy}
                  >
                    {busy ? "Guardando…" : "Guardar rol"}
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
