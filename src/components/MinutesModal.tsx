import { useEffect, useState } from "react";
import { CopyIcon, DownloadIcon } from "./Icons";

export function MinutesModal({
  open,
  title,
  markdown,
  sessionId,
  onClose,
}: {
  open: boolean;
  title: string;
  markdown: string | null;
  sessionId: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!open) return null;

  const copy = async () => {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown).catch(() => undefined);
    setCopied(true);
  };

  const download = () => {
    const blob = new Blob([markdown ?? ""], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sessionId}-minuta.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>Minuta</h2>
            <p>{title}</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={copy} disabled={!markdown}>
              <CopyIcon size={15} /> {copied ? "Copiado" : "Copiar"}
            </button>
            <button type="button" className="ghost-btn" onClick={download} disabled={!markdown}>
              <DownloadIcon size={15} /> .md
            </button>
            <button type="button" className="ghost-btn" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </header>

        {markdown ? (
          <pre className="minutes">{markdown}</pre>
        ) : (
          <div className="minutes-empty">
            <span className="spinner" />
            Escribiendo la minuta…
          </div>
        )}
      </div>
    </div>
  );
}
