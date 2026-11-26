import { useEffect, useRef, useState } from "react";
import type { ProjectSelection } from "../../shared/types";
import { getProjectFolders, type FolderListing } from "../api";

export function projectName(path: string) {
  return path.split("/").filter(Boolean).at(-1) || path;
}

export function ProjectsDialog({
  initial, onClose, onSave,
}: {
  initial: ProjectSelection | null;
  onClose: () => void;
  onSave: (projects: ProjectSelection) => void | Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const browseRequest = useRef<AbortController | null>(null);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [path, setPath] = useState(initial?.workspace ?? "");
  const [projects, setProjects] = useState<ProjectSelection>(initial ?? { workspace: "", references: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function browse(destination: string) {
    browseRequest.current?.abort();
    const request = new AbortController();
    browseRequest.current = request;
    setError("");
    setLoading(true);
    try {
      const result = await getProjectFolders(destination, request.signal);
      if (request.signal.aborted) return;
      setListing(result);
      setPath(result.current);
    } catch (error) {
      if (!request.signal.aborted) setError((error as Error).message);
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    void browse(initial?.workspace ?? "");
    return () => {
      browseRequest.current?.abort();
      element?.close();
    };
  }, [initial?.workspace]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave(projects);
      onClose();
    } catch (error) {
      setError((error as Error).message);
      setSaving(false);
    }
  }

  const current = listing?.current ?? "";
  const isPrimary = current === projects.workspace;
  const isReference = projects.references.includes(current);

  return (
    <dialog
      ref={dialog}
      className="modal projects-dialog"
      aria-labelledby="projects-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <header className="modal-head">
        <div>
          <h2 id="projects-title">Archivos del proyecto</h2>
          <p>El principal es la carpeta de trabajo. Los agentes reciben los nombres de los archivos de primer nivel y fragmentos de README.md y CONTEXT.md si existen.</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose} disabled={saving}>Cerrar</button>
      </header>

      <form className="projects-path" onSubmit={(event) => { event.preventDefault(); void browse(path.trim()); }}>
        <label className="field">
          <span>Ruta de la carpeta</span>
          <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/home/usuario/proyectos" />
        </label>
        <button type="submit" className="ghost-btn" disabled={saving}>Abrir</button>
      </form>

      <div className="projects-nav">
        <button type="button" className="ghost-btn" disabled={!listing?.home || saving} onClick={() => { if (listing) void browse(listing.home); }}>Inicio</button>
        <button type="button" className="ghost-btn" disabled={!listing?.parent || saving} onClick={() => { if (listing?.parent) void browse(listing.parent); }}>Subir carpeta</button>
      </div>
      <p className="projects-location">{current}</p>
      <div className="projects-folders" aria-label="Subcarpetas" aria-busy={loading}>
        {loading ? <p>Cargando carpetas…</p> : listing?.folders.length
          ? listing.folders.map((folder) => (
              <button key={folder.path} type="button" className="ghost-btn" disabled={saving} onClick={() => void browse(folder.path)}>
                {folder.name}
              </button>
            ))
          : <p>Sin subcarpetas visibles.</p>}
      </div>

      <div className="projects-nav">
        <button type="button" className="ghost-btn" disabled={!current || isPrimary || loading || saving} onClick={() =>
          setProjects((prev) => ({ workspace: current, references: prev.references.filter((item) => item !== current) }))
        }>Usar como principal</button>
        <button type="button" className="ghost-btn" disabled={!current || isPrimary || isReference || projects.references.length >= 4 || loading || saving} onClick={() =>
          setProjects((prev) => ({ workspace: prev.workspace, references: [...prev.references, current] }))
        }>Agregar como referencia</button>
      </div>
      <dl className="projects-selection">
        <dt>Proyecto principal</dt>
        <dd>{projects.workspace || "Elige una carpeta"}</dd>
        <dt>Referencias ({projects.references.length}/4)</dt>
        {projects.references.length ? projects.references.map((item) => (
          <dd key={item}>
            <span>{item}</span>
            <button type="button" className="ghost-btn" disabled={saving} aria-label={`Quitar ${item}`} onClick={() =>
              setProjects((prev) => ({ ...prev, references: prev.references.filter((reference) => reference !== item) }))
            }>Quitar</button>
          </dd>
        )) : <dd>Sin referencias</dd>}
      </dl>
      {error && <p className="error-note" role="alert">{error}</p>}
      <footer className="modal-actions">
        <button type="button" className="primary-btn" disabled={!projects.workspace || saving} onClick={() => void save()}>
          {saving ? "Guardando…" : "Guardar proyectos"}
        </button>
      </footer>
    </dialog>
  );
}
