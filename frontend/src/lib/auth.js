const ACCESS_TOKEN_KEY = "f1_admin_access_token";
const REFRESH_TOKEN_KEY = "f1_admin_refresh_token";
const AUTH_CHANGED_EVENT = "auth:changed";
const AUTH_EXPIRED_EVENT = "auth:expired";
let hasPendingExpiredNotification = false;
let expiryTimer = null;

function emitAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

function decodeBase64Url(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  return atob(padded);
}

function parseJwtPayload(token) {
  if (typeof window === "undefined" || !token) return null;
  const segments = String(token).split(".");
  if (segments.length < 2) return null;
  try {
    const payloadText = decodeBase64Url(segments[1]);
    const payload = JSON.parse(payloadText);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

function emitAuthExpired(reason) {
  if (typeof window === "undefined") return;
  if (hasPendingExpiredNotification) return;
  hasPendingExpiredNotification = true;
  window.dispatchEvent(
    new CustomEvent(AUTH_EXPIRED_EVENT, {
      detail: { reason: reason || "token_expired" },
    })
  );
}

export function getAccessToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ACCESS_TOKEN_KEY) || "";
}

export function getRefreshToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(REFRESH_TOKEN_KEY) || "";
}

function scheduleExpiryNotification(accessToken) {
  if (expiryTimer !== null) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  if (!accessToken) return;
  const expiryMs = getAccessTokenExpiryEpochMs(accessToken);
  if (expiryMs === null) return;
  const delay = expiryMs - Date.now();
  if (delay <= 0) return;
  expiryTimer = setTimeout(() => {
    expiryTimer = null;
    clearAuthTokens();
    notifyAuthExpired("token_expired");
  }, delay);
}

export function setAuthTokens({ accessToken = "", refreshToken = "" } = {}) {
  if (typeof window === "undefined") return;
  hasPendingExpiredNotification = false;
  if (accessToken) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
  scheduleExpiryNotification(accessToken);
  emitAuthChanged();
}

export function clearAuthTokens() {
  if (typeof window === "undefined") return;
  if (expiryTimer !== null) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  emitAuthChanged();
}

export function isAuthenticated() {
  const token = getAccessToken();
  return Boolean(token) && !isAccessTokenExpired(token);
}

export function getAccessTokenRole(token = getAccessToken()) {
  const payload = parseJwtPayload(token);
  const role = payload?.role;
  return typeof role === "string" ? role : "";
}

export function onAuthChanged(handler) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AUTH_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, handler);
  };
}

export function getAccessTokenExpiryEpochMs(token = getAccessToken()) {
  const payload = parseJwtPayload(token);
  if (!payload) return null;
  const expRaw = payload.exp;
  if (expRaw === null || expRaw === undefined) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp)) return null;
  return exp * 1000;
}

export function isAccessTokenExpired(token = getAccessToken(), skewSeconds = 5) {
  const expiryMs = getAccessTokenExpiryEpochMs(token);
  if (expiryMs === null) return false;
  return Date.now() >= expiryMs - Math.max(0, skewSeconds) * 1000;
}

export function notifyAuthExpired(reason = "token_expired") {
  emitAuthExpired(reason);
}

export function onAuthExpired(handler) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AUTH_EXPIRED_EVENT, handler);
  return () => {
    window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  };
}

// Bootstrap: re-arm the timer on every page load for tokens already in storage.
scheduleExpiryNotification(getAccessToken());
