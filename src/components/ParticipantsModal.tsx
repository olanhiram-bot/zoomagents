import type { Session } from "../../shared/types";
import { AgentFace } from "./AgentFace";
import { CloseIcon, MicIcon, MicOffIcon } from "./Icons";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "T"
  );
}

export function ParticipantsModal({
  open,
  session,
  humanName,
  onClose,
  onOpenAgent,
}: {
  open: boolean;
  session: Session;
  humanName: string;
  onClose: () => void;
  onOpenAgent: (id: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal participants-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>Participantes ({session.participants.length + 1})</h2>
            <p>Toca un agente para ver su rol, su modelo y sus intervenciones.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </header>

        <ul className="participant-list">
          <li className="participant-row">
            <span className="chat-human avatar avatar-xs">{initials(humanName || "Tú")}</span>
            <span className="participant-info">
              <strong>{humanName || "Tú"}</strong>
              <span>Anfitrión</span>
            </span>
            <span className="participant-mic is-on">
              <MicIcon size={14} />
            </span>
          </li>

          {session.participants.map((participant) => (
            <li key={participant.id} className="participant-row">
              <button type="button" onClick={() => onOpenAgent(participant.id)}>
                <span className="avatar avatar-xs face-avatar">
                  <AgentFace
                    seed={participant.avatarSeed}
                    name={participant.name}
                    role={participant.role}
                    size={24}
                  />
                </span>
                <span className="participant-info">
                  <strong>{participant.name}</strong>
                  <span>{participant.role}</span>
                </span>
                <span className={`participant-mic ${participant.muted ? "is-off" : "is-on"}`}>
                  {participant.muted ? <MicOffIcon size={14} /> : <MicIcon size={14} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
