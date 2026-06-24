import React, { useEffect, useMemo, useState } from "react";
import { apiFetch, apiGet } from "../lib/api.js";
import ConfirmModal from "./ConfirmModal.jsx";
import DataTable from "./DataTable.jsx";
import TableWrapper from "./TableWrapper.jsx";
import useAuthStatus from "../lib/useAuthStatus.js";

const refTypeOptions = [
  { value: "website", label: "Website" },
  { value: "book", label: "Book" },
  { value: "article", label: "Article" },
  { value: "other", label: "Other" },
];

const formatUpdatedAt = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const emptyForm = {
  ref_type: "website",
  url: "",
  citation: "",
  notes: "",
};

const resolveTypeLabel = (value) =>
  refTypeOptions.find((item) => item.value === value)?.label || value || "—";

export default function ReferencesSection({ entityType, entityId }) {
  const canEdit = useAuthStatus();
  const [references, setReferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReference, setEditingReference] = useState(null);
  const [formValues, setFormValues] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const normalizedEntityId = useMemo(
    () => (entityId ? Number(entityId) : null),
    [entityId]
  );

  const loadReferences = async () => {
    if (!entityType || !normalizedEntityId) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiGet(
        `/references?entity_type=${entityType}&entity_id=${normalizedEntityId}`
      );
      setReferences(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load references.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isActive = true;
    (async () => {
      if (!entityType || !normalizedEntityId) return;
      setLoading(true);
      setError("");
      try {
        const data = await apiGet(
          `/references?entity_type=${entityType}&entity_id=${normalizedEntityId}`
        );
        if (!isActive) return;
        setReferences(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!isActive) return;
        setError(err.message || "Failed to load references.");
      } finally {
        if (isActive) setLoading(false);
      }
    })();
    return () => {
      isActive = false;
    };
  }, [entityType, normalizedEntityId]);

  const openCreate = () => {
    if (!canEdit) return;
    setEditingReference(null);
    setFormValues(emptyForm);
    setSaveError("");
    setIsModalOpen(true);
  };

  const openEdit = (reference) => {
    if (!canEdit) return;
    setEditingReference(reference);
    setFormValues({
      ref_type: reference.ref_type || "website",
      url: reference.url || "",
      citation: reference.citation || "",
      notes: reference.notes || "",
    });
    setSaveError("");
    setIsModalOpen(true);
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    if (formValues.ref_type === "website" && !formValues.url.trim()) {
      return "Website references require a URL.";
    }
    if (
      (formValues.ref_type === "book" || formValues.ref_type === "article") &&
      !formValues.citation.trim()
    ) {
      return "Book and article references require a citation.";
    }
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const message = validateForm();
    if (message) {
      setSaveError(message);
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        ref_type: formValues.ref_type || "other",
        url: formValues.url.trim() || null,
        citation: formValues.citation.trim() || null,
        notes: formValues.notes.trim() || null,
      };
      const response = await apiFetch(
        editingReference
          ? `/references/${editingReference.id}`
          : "/references",
        {
          method: editingReference ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingReference
              ? payload
              : {
                  ...payload,
                  entity_type: entityType,
                  entity_id: normalizedEntityId,
                }
          ),
        }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to save reference.");
      }
      await response.json();
      setIsModalOpen(false);
      await loadReferences();
    } catch (err) {
      setSaveError(err.message || "Failed to save reference.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingReference) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await apiFetch(`/references/${editingReference.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to delete reference.");
      }
      setIsDeleteOpen(false);
      await loadReferences();
    } catch (err) {
      setDeleteError(err.message || "Failed to delete reference.");
    } finally {
      setDeleting(false);
    }
  };

  if (!entityType || !normalizedEntityId) return null;

  return (
    <div className="detail-card" style={{ marginTop: 24 }}>
      <div className="detail-card-header">
        <div>
          <h2>References</h2>
          <p>Sources backing this record.</p>
        </div>
        {canEdit ? (
          <button type="button" className="pill" onClick={openCreate}>
            Add reference
          </button>
        ) : null}
      </div>
      {loading ? (
        <div className="status-card">Loading references…</div>
      ) : error ? (
        <div className="status-card error">{error}</div>
      ) : references.length === 0 ? (
        <div className="status-card">No references recorded yet.</div>
      ) : (
        <TableWrapper>
          <DataTable>
            <thead>
              <tr>
                <th>Type</th>
                <th>Reference</th>
                <th>Notes</th>
                <th>Updated</th>
                {canEdit ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {references.map((reference) => (
                <tr key={reference.id}>
                  <td>{resolveTypeLabel(reference.ref_type)}</td>
                  <td>
                    {reference.ref_type === "website" && reference.url ? (
                      <a href={reference.url} target="_blank" rel="noreferrer">
                        {reference.url}
                      </a>
                    ) : reference.citation ? (
                      reference.citation
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{reference.notes || "—"}</td>
                  <td>{formatUpdatedAt(reference.updated_at)}</td>
                  {canEdit ? (
                    <td>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => openEdit(reference)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setEditingReference(reference);
                          setIsDeleteOpen(true);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableWrapper>
      )}

      {canEdit && isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{editingReference ? "Update reference" : "Add reference"}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label>
                  Type
                  <select
                    name="ref_type"
                    value={formValues.ref_type}
                    onChange={handleFieldChange}
                  >
                    {refTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {formValues.ref_type === "website" && (
                  <label className="form-span">
                    URL
                    <input
                      name="url"
                      value={formValues.url}
                      onChange={handleFieldChange}
                      placeholder="https://"
                    />
                  </label>
                )}
                {(formValues.ref_type === "book" ||
                  formValues.ref_type === "article" ||
                  formValues.ref_type === "other") && (
                  <label className="form-span">
                    Citation
                    <textarea
                      name="citation"
                      value={formValues.citation}
                      onChange={handleFieldChange}
                      rows={3}
                    />
                  </label>
                )}
                <label className="form-span">
                  Notes
                  <textarea
                    name="notes"
                    value={formValues.notes}
                    onChange={handleFieldChange}
                    rows={3}
                  />
                </label>
              </div>
              {saveError && <div className="status-card error">{saveError}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={saving}>
                  {saving ? "Saving…" : "Save reference"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {canEdit ? (
        <ConfirmModal
          isOpen={isDeleteOpen}
          title="Delete reference?"
          message="This will permanently remove the reference record and cannot be undone."
          confirmLabel="Delete reference"
          onConfirm={handleDelete}
          onCancel={() => setIsDeleteOpen(false)}
          isLoading={deleting}
          error={deleteError}
        />
      ) : null}
    </div>
  );
}
