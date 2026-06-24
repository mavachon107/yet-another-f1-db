import React, { createContext, useContext, useEffect, useState } from "react";
import { apiFetch, readErrorMessage } from "../lib/api.js";
import {
  clearAuthTokens,
  getRefreshToken,
  isAuthenticated,
  onAuthChanged,
  onAuthExpired,
  setAuthTokens,
} from "../lib/auth.js";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
];

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(isAuthenticated());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authModalMode, setAuthModalMode] = useState("manual");
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileIdentity, setProfileIdentity] = useState({ email: "", role: "" });
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordStatus, setChangePasswordStatus] = useState("");
  const [changePasswordError, setChangePasswordError] = useState("");
  const [changePasswordForm, setChangePasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const loadProfile = async () => {
    if (!isAuthenticated()) return;
    setProfileLoading(true);
    setProfileError("");
    try {
      const response = await apiFetch("/api/admin/users/me/profile", { method: "GET" });
      if (!response.ok) {
        const message = await readErrorMessage(response, "Failed to load profile.");
        throw new Error(message);
      }
      const data = await response.json();
      setProfileIdentity({ email: data.email || "", role: data.role || "" });
      setPreferredLanguage(data.preferred_language || "en");
    } catch (err) {
      setProfileError(err.message || "Failed to load profile.");
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    return onAuthChanged(() => {
      setIsLoggedIn(isAuthenticated());
    });
  }, []);

  useEffect(() => {
    return onAuthExpired((event) => {
      const reason = event?.detail?.reason || "token_expired";
      setIsProfileModalOpen(false);
      setAuthLoading(false);
      setAuthPassword("");
      setAuthModalMode("expired");
      setAuthError(
        reason === "token_expired"
          ? "Your session has expired. Please log in again."
          : "Your session is no longer valid. Please log in again."
      );
      setIsAuthModalOpen(true);
    });
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = preferredLanguage || "en";
    }
  }, [preferredLanguage]);

  useEffect(() => {
    if (!isLoggedIn) {
      setIsProfileModalOpen(false);
      setProfileIdentity({ email: "", role: "" });
      setPreferredLanguage("en");
      setProfileStatus("");
      setProfileError("");
      setChangePasswordStatus("");
      setChangePasswordError("");
      setChangePasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      return;
    }
    loadProfile();
  }, [isLoggedIn]);

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    setAuthModalMode("manual");
    setAuthError("");
    setAuthPassword("");
  };

  const openLoginModal = () => {
    setAuthModalMode("manual");
    setAuthError("");
    setIsAuthModalOpen(true);
  };

  const openAuthRequiredModal = () => {
    setAuthModalMode("required");
    setAuthError("Login required for create/update actions.");
    setIsAuthModalOpen(true);
  };

  const openProfileModal = async () => {
    setIsProfileModalOpen(true);
    setProfileStatus("");
    setChangePasswordStatus("");
    setChangePasswordError("");
    await loadProfile();
  };

  const closeProfileModal = () => {
    setIsProfileModalOpen(false);
    setProfileStatus("");
    setProfileError("");
    setChangePasswordStatus("");
    setChangePasswordError("");
    setChangePasswordForm({ current_password: "", new_password: "", confirm_password: "" });
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const response = await apiFetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
      });
      if (!response.ok) {
        const message = await readErrorMessage(response, "Login failed.");
        throw new Error(message);
      }
      const data = await response.json();
      setAuthTokens({ accessToken: data.access_token || "", refreshToken: data.refresh_token || "" });
      setAuthModalMode("manual");
      closeAuthModal();
    } catch (err) {
      setAuthError(err.message || "Login failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        await apiFetch("/api/admin/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      }
    } catch {
      // No-op: clearing local tokens is enough for client-side access control.
    } finally {
      clearAuthTokens();
      setIsProfileModalOpen(false);
    }
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileStatus("");
    setProfileError("");
    try {
      const response = await apiFetch("/api/admin/users/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferred_language: preferredLanguage }),
      });
      if (!response.ok) {
        const message = await readErrorMessage(response, "Failed to update profile.");
        throw new Error(message);
      }
      const data = await response.json();
      setPreferredLanguage(data.preferred_language || preferredLanguage);
      setProfileIdentity({
        email: data.email || profileIdentity.email,
        role: data.role || profileIdentity.role,
      });
      setProfileStatus("Preferred language saved.");
    } catch (err) {
      setProfileError(err.message || "Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePasswordSubmit = async (event) => {
    event.preventDefault();
    setChangePasswordLoading(true);
    setChangePasswordStatus("");
    setChangePasswordError("");
    if (changePasswordForm.new_password !== changePasswordForm.confirm_password) {
      setChangePasswordError("New password and confirmation do not match.");
      setChangePasswordLoading(false);
      return;
    }
    try {
      const response = await apiFetch("/api/admin/users/me/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: changePasswordForm.current_password,
          new_password: changePasswordForm.new_password,
        }),
      });
      if (!response.ok) {
        const message = await readErrorMessage(response, "Failed to change password.");
        throw new Error(message);
      }
      setChangePasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setChangePasswordStatus("Password updated.");
    } catch (err) {
      setChangePasswordError(err.message || "Failed to change password.");
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const profileInitial =
    ((profileIdentity.email || authEmail || "").trim().charAt(0) || "U").toUpperCase();

  return (
    <AuthContext.Provider
      value={{ isLoggedIn, openLoginModal, openProfileModal, handleLogout, profileIdentity, profileInitial, openAuthRequiredModal }}
    >
      {children}

      {isProfileModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>User profile</h3>
              <button
                type="button"
                className="icon-button"
                onClick={closeProfileModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleProfileSubmit}>
              <div className="form-grid">
                <label className="form-span">
                  Email
                  <input value={profileIdentity.email} disabled />
                </label>
                <label>
                  Role
                  <input value={profileIdentity.role} disabled />
                </label>
                <label>
                  Preferred language
                  <select
                    value={preferredLanguage}
                    onChange={(event) => setPreferredLanguage(event.target.value)}
                    disabled={profileLoading}
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {profileLoading && <div className="status-card">Loading profile…</div>}
              {profileError && <div className="status-card error">{profileError}</div>}
              {profileStatus && <div className="status-card success">{profileStatus}</div>}
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={closeProfileModal}>
                  Close
                </button>
                <button type="submit" className="pill" disabled={profileLoading || profileSaving}>
                  {profileSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
            <form className="modal-form" onSubmit={handleChangePasswordSubmit}>
              <div className="form-grid">
                <label className="form-span">
                  Current password
                  <input
                    type="password"
                    value={changePasswordForm.current_password}
                    onChange={(event) =>
                      setChangePasswordForm((prev) => ({ ...prev, current_password: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="form-span">
                  New password
                  <input
                    type="password"
                    value={changePasswordForm.new_password}
                    onChange={(event) =>
                      setChangePasswordForm((prev) => ({ ...prev, new_password: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="form-span">
                  Confirm new password
                  <input
                    type="password"
                    value={changePasswordForm.confirm_password}
                    onChange={(event) =>
                      setChangePasswordForm((prev) => ({ ...prev, confirm_password: event.target.value }))
                    }
                    required
                  />
                </label>
              </div>
              {changePasswordError && (
                <div className="status-card error">{changePasswordError}</div>
              )}
              {changePasswordStatus && (
                <div className="status-card success">{changePasswordStatus}</div>
              )}
              <div className="modal-actions">
                <button type="submit" className="pill" disabled={changePasswordLoading}>
                  {changePasswordLoading ? "Updating…" : "Change password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAuthModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{authModalMode === "expired" ? "Session expired" : "Login"}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={closeAuthModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {authModalMode === "expired" ? (
              <p className="modal-subtle-copy">
                Your token expired. Please log in again to continue.
              </p>
            ) : null}
            <form className="modal-form" onSubmit={handleLogin}>
              <div className="form-grid">
                <label className="form-span">
                  Email
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    required
                  />
                </label>
                <label className="form-span">
                  Password
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    required
                  />
                </label>
              </div>
              {authError && <div className="status-card error">{authError}</div>}
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={closeAuthModal}>
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={authLoading}>
                  {authLoading ? "Signing in…" : "Login"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}
