import { useEffect, useRef, useState } from "react";
import type { Message, Participant, Session } from "../../shared/types";
import { AgentFace } from "./AgentFace";
import { CloseIcon, SendIcon } from "./Icons";

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

function timeOf(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChatPanel({
  session,
  humanName,
  live,
  activeSpeakerId,
  disabled,
  includesScreen,
  onSend,
  onClose,
}: {
  session: Session;
  humanName: string;
  live: Record<string, string>;
  activeSpeakerId: string | null;
  disabled: boolean;
  includesScreen: boolean;
  onSend: (text: string) => boolean;
  onClose: () => void;
}) {
  const logRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);
  const [value, setValue] = useState("");
  const messages = session.transcript;
  const active = session.participants.find((participant) => participant.id === activeSpeakerId);
  const activeText = activeSpeakerId ? live[activeSpeakerId] ?? "" : "";

  useEffect(() => {
    const element = logRef.current;
    if (!element || !pinned) return;
    element.scrollTop = element.scrollHeight;
  }, [messages.length, activeText, pinned]);

  const onScroll = () => {
    const element = logRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    setPinned(distance < 90);
  };

  return (
    <aside className="chat-panel" aria-label="Chat de la reunión">
      <header className="chat-head">
        <div>
          <h2>Chat de la reunión</h2>
          <p>
            {messages.length} intervenciones · {session.participants.length + 1} responsables
          </p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar chat">
          <CloseIcon />
        </button>
      </header>

      <div className="chat-roster-label">Responsables</div>
      <div className="chat-roster" title="Todos los responsables de la sala">
        <span className="roster-chip">
          <span className="chat-human avatar avatar-xs">{initials(humanName || "Tú")}</span>
          <span>{humanName || "Tú"}</span>
        </span>
        {session.participants.map((participant) => (
          <span
            key={participant.id}
            className={`roster-chip ${participant.muted ? "is-muted" : ""}`}
            title={`${participant.name} (${participant.role})${participant.muted ? " · silenciado" : ""}`}
          >
            <span className="avatar avatar-xs face-avatar">
              <AgentFace
                seed={participant.avatarSeed}
                name={participant.name}
                role={participant.role}
                size={22}
              />
            </span>
            <span>{participant.name}</span>
          </span>
        ))}
      </div>

      <div className="chat-log" ref={logRef} onScroll={onScroll}>
        {messages.length === 0 && !activeText && (
          <p className="chat-empty">
            La conversación aparecerá aquí, con el nombre y el rol de quien habla.
          </p>
        )}

        {messages.map((message) => (
          <ChatRow
            key={message.id}
            message={message}
            participant={session.participants.find((item) => item.id === message.speakerId)}
            humanName={humanName}
          />
        ))}

        {active && activeText && (
          <div className="chat-row is-live">
            <span className="avatar avatar-xs face-avatar">
              <AgentFace
                seed={active.avatarSeed}
                name={active.name}
                role={active.role}
                size={22}
              />
            </span>
            <div className="chat-body">
              <div className="chat-meta">
                <strong>{active.name}</strong>
                <span>({active.role})</span>
                <em>hablando…</em>
              </div>
              <p className="chat-text">
                {activeText}
                <span className="caret" aria-hidden="true" />
              </p>
            </div>
          </div>
        )}
      </div>

      {!pinned && (
        <button
          type="button"
          className="chat-jump"
          onClick={() => {
            setPinned(true);
            const element = logRef.current;
            if (element) element.scrollTop = element.scrollHeight;
          }}
        >
          Ir al final
        </button>
      )}

      <form
        className="chat-compose"
        onSubmit={(event) => {
          event.preventDefault();
          const text = value.trim();
          if (!text || disabled) return;
          if (onSend(text)) setValue("");
        }}
      >
        <input
          value={value}
          disabled={disabled}
          placeholder={
            disabled ? "La sala está hablando…" : includesScreen ? "Mensaje con captura…" : "Escribe o menciona un rol (Backend Dev)…"
          }
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" disabled={disabled || !value.trim()} aria-label="Enviar">
          <SendIcon size={16} />
        </button>
      </form>
    </aside>
  );
}

function ChatRow({
  message,
  participant,
  humanName,
}: {
  message: Message;
  participant?: Participant;
  humanName: string;
}) {
  const human = message.kind === "human";
  return (
    <div className={`chat-row ${human ? "is-human" : ""}`}>
      {human ? (
        <span className="chat-human avatar avatar-xs">{initials(humanName || "Tú")}</span>
      ) : (
        <span className="avatar avatar-xs face-avatar">
          <AgentFace
            seed={participant?.avatarSeed}
            name={participant?.name ?? message.speakerName}
            role={participant?.role ?? ""}
            size={22}
          />
        </span>
      )}
      <div className="chat-body">
        <div className="chat-meta">
          <strong>{human ? humanName || "Tú" : participant?.name ?? message.speakerName}</strong>
          {!human && participant && <span>({participant.role})</span>}
          {human && <span className="chat-badge">humano</span>}
          {message.to?.length ? (
            <span className="chat-to">→ {message.to.join(", ")}</span>
          ) : null}
          <time>{timeOf(message.createdAt)}</time>
        </div>
        <p className="chat-text">{message.text}</p>
      </div>
    </div>
  );
}
