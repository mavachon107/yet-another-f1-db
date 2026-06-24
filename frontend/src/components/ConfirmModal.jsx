import React from "react";

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Delete",
  loadingLabel = "Deleting…",
  cancelLabel = "Cancel",
  confirmClassName = "danger-button",
  onConfirm,
  onCancel,
  isLoading = false,
  confirmDisabled = false,
  error = "",
  children = null,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="icon-button"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="modal-form">
          {message ? <p>{message}</p> : null}
          {children}
          {error ? <div className="status-card error">{error}</div> : null}
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={confirmClassName}
              onClick={onConfirm}
              disabled={isLoading || confirmDisabled}
            >
              {isLoading ? loadingLabel : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
