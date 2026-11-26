export function MoreMenu({
  open,
  onClose,
  bargeEnabled,
  onToggleBarge,
  sensitivity,
  onSensitivityChange,
  onCompact,
  compactDisabled,
  minutesAvailable,
  onMinutes,
  workspace,
}: {
  open: boolean;
  onClose: () => void;
  bargeEnabled: boolean;
  onToggleBarge: () => void;
  sensitivity: "high" | "medium" | "low";
  onSensitivityChange: (value: "high" | "medium" | "low") => void;
  onCompact: () => void;
  compactDisabled: boolean;
  minutesAvailable: boolean;
  onMinutes: () => void;
  workspace?: string;
}) {
  if (!open) return null;

  return (
    <>
      <div className="more-backdrop" onClick={onClose} />
      <div className="more-menu" role="menu">
        <button type="button" className="more-item" onClick={onToggleBarge}>
          <span>Interrupción por voz</span>
          <em className={bargeEnabled ? "is-on" : ""}>{bargeEnabled ? "Sí" : "No"}</em>
        </button>

        {bargeEnabled && (
          <label className="more-item more-select">
            <span>Sensibilidad</span>
            <select
              value={sensitivity}
              onChange={(event) =>
                onSensitivityChange(event.target.value as "high" | "medium" | "low")
              }
            >
              <option value="high">Sensible</option>
              <option value="medium">Normal</option>
              <option value="low">Estricta</option>
            </select>
          </label>
        )}

        <button
          type="button"
          className="more-item"
          onClick={onCompact}
          disabled={compactDisabled}
        >
          <span>Compactar contexto</span>
          <em>menos tokens</em>
        </button>

        {minutesAvailable && (
          <button type="button" className="more-item" onClick={onMinutes}>
            <span>Ver minuta</span>
            <em>markdown</em>
          </button>
        )}

        {workspace && (
          <p className="more-note" title={workspace}>
            Terminal: {workspace.split("/").filter(Boolean).pop() ?? workspace}
          </p>
        )}
      </div>
    </>
  );
}
