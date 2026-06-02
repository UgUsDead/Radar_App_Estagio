import { apiBase } from "../constants/api";

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("radar_auth_token") : null;
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {})
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${apiBase}${endpoint}`;
  if (process.env.NODE_ENV === "development") {
    let bodyDebug: unknown = "";
    if (options.body && typeof options.body === "string") {
      try {
        bodyDebug = JSON.parse(options.body);
      } catch {
        bodyDebug = options.body;
      }
    } else if (options.body) {
      bodyDebug = "[Non-string body]";
    }
    console.debug(`[API] ${options.method || "GET"} ${url}`, bodyDebug);
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401) {
    // Optionally redirect to login if unauthorized
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  return response;
}
