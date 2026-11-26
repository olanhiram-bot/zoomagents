import { useEffect } from "react";
import type { Message, Participant } from "../../shared/types";
import { AgentFace } from "./AgentFace";
import { CloseIcon, MicIcon, MicOffIcon } from "./Icons";

export function AgentPanel({
  participant,
  messages,
  onClose,
  onToggleMute,
}: {
  participant: Participant | null;
  messages: Message[];
  onClose: () => void;
  onToggleMute: (muted: boolean) => void;
}) {
  useEffect(() => {
    if (!participant) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [participant, onClose]);

  if (!participant) return null;

  const mine = messages.filter((message) => message.speakerId === participant.id).slice(-12).reverse();

  return (
    <div className="overlay" onClick={onClose}>
      <aside className="panel" onClick={(event) => event.stopPropagation()}>
        <header className="panel-head">
          <div className="panel-identity">
            <span className="avatar avatar-sm face-avatar">
              <AgentFace
                seed={participant.avatarSeed}
                name={participant.name}
                role={participant.role}
                size={34}
              />
            </span>
            <div>
              <h2>
                {participant.name} <span className="name-role">({participant.role})</span>
              </h2>
              <p>
                {participant.provider} · {participant.model}
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar panel">
            <CloseIcon />
          </button>
        </header>

        <div className="panel-actions">
          <button
            type="button"
            className={`ghost-btn ${participant.muted ? "is-warn" : ""}`}
            onClick={() => onToggleMute(!participant.muted)}
          >
            {participant.muted ? <MicOffIcon size={15} /> : <MicIcon size={15} />}
            {participant.muted ? "Silenciado — activar" : "Silenciar en la sala"}
          </button>
        </div>

        <div className="panel-body">
          <h3>Intervenciones</h3>
          {mine.length ? (
            <ul className="panel-messages">
              {mine.map((message) => (
                <li key={message.id}>
                  <span className="panel-time">
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <p>{message.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-empty">Todavía no ha hablado en esta reunión.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
