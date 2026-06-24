import {
  clearAuthTokens,
  getAccessToken,
  isAccessTokenExpired,
  notifyAuthExpired,
} from "./auth.js";

const DEFAULT_API_BASE = (() => {
  if (typeof window === "undefined") return "";
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8000`;
})();

const API_BASE = import.meta.env.VITE_API_BASE;

export function apiUrl(path) {
  if (!API_BASE) return path;
  return `${API_BASE}${path}`;
}

const apiCache = new Map();
const CACHE_TTL_MS = 60_000;

export function clearApiCache(pathPrefix) {
  if (!pathPrefix) {
    apiCache.clear();
    return;
  }
  for (const key of apiCache.keys()) {
    if (key.includes(pathPrefix)) {
      apiCache.delete(key);
    }
  }
}

export async function readErrorMessage(response, fallback) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json();
      if (typeof payload?.detail === "string") return payload.detail;
      if (payload?.detail) return JSON.stringify(payload.detail);
    } catch {
      // Fallback to plain text below.
    }
  }
  const message = await response.text();
  return message || fallback;
}

export async function apiGet(path) {
  const url = apiUrl(normalizePath(path));
  const cached = apiCache.get(url);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  const response = await fetch(url);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  const data = await response.json();
  apiCache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

export async function apiFetch(path, options) {
  const requestOptions = options || {};
  const method = String(requestOptions.method || "GET").toUpperCase();
  const headers = new Headers(requestOptions.headers || {});
  const isAuthRoute = path.startsWith("/api/admin/auth/");
  const token = getAccessToken();
  let usingAuthHeader = false;

  if (!isAuthRoute && token && isAccessTokenExpired(token)) {
    clearAuthTokens();
    notifyAuthExpired("token_expired");
    throw new Error("Session expired. Please log in again.");
  }

  if (method !== "GET" && method !== "HEAD" && !isAuthRoute) {
    if (!token) {
      throw new Error("Authentication required. Please log in.");
    }
    headers.set("Authorization", `Bearer ${token}`);
    usingAuthHeader = true;
  } else if (token && path.startsWith("/api/admin/")) {
    headers.set("Authorization", `Bearer ${token}`);
    usingAuthHeader = true;
  }

  const mergedOptions = { ...requestOptions, method, headers };
  const normalizedPath = normalizePath(path);
  const processAuthFailure = (response) => {
    if (!isAuthRoute && usingAuthHeader && response.status === 401) {
      clearAuthTokens();
      notifyAuthExpired("token_invalid");
    }
    return response;
  };

  if (method === "GET" || method === "HEAD" || isAuthRoute) {
    const response = await fetch(apiUrl(normalizedPath), mergedOptions);
    return processAuthFailure(response);
  }

  const adminPath = normalizedPath.startsWith("/api/admin/")
    ? normalizedPath
    : `/api/admin${normalizedPath}`;
  const adminResponse = await fetch(apiUrl(adminPath), mergedOptions);

  if (adminResponse.status !== 404 || normalizedPath.startsWith("/api/admin/")) {
    return processAuthFailure(adminResponse);
  }

  const fallbackResponse = await fetch(apiUrl(normalizedPath), mergedOptions);
  return processAuthFailure(fallbackResponse);
}

function normalizePath(path) {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

