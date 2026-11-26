import { useState } from "react";
import type { ApprovalRequest } from "../../shared/types";

/**
 * The agent's sudo wrapper asks the room for permission. The password never
 * leaves this request: it goes to the server, which writes a 0600 temp file
 * that the wrapper consumes and deletes.
 */
export function ApprovalModal({
  request,
  onDecide,
}: {
  request: ApprovalRequest;
  onDecide: (allow: boolean, password?: string, remember?: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  return (
    <div className="overlay approval-overlay">
      <div className="modal approval-modal" role="dialog" aria-modal="true">
        <header className="modal-head">
          <div>
            <h2>Permiso de terminal</h2>
            <p>
              <strong>{request.agent}</strong> quiere ejecutar un comando con sudo.
            </p>
          </div>
        </header>

        <div className="approval-body">
          <pre className="approval-command">{request.command || "(sin comando)"}</pre>

          <label className="field">
            <span>Contraseña sudo (si el comando la pide)</span>
            <input
              type="password"
              autoComplete="off"
              value={password}
              placeholder="Se usa una vez y no se guarda en disco"
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onDecide(true, password, remember);
              }}
            />
          </label>

          <label className="remember-row">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            Recordar esta contraseña durante la reunión (solo en memoria)
          </label>
        </div>

        <footer className="modal-foot">
          <span className="modal-note">
            Si deniegas, el agente recibe el rechazo y debe buscar otra vía.
          </span>
          <div className="approval-actions">
            <button type="button" className="ghost-btn" onClick={() => onDecide(false)}>
              Denegar
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={() => onDecide(true, password, remember)}
            >
              Aprobar
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
