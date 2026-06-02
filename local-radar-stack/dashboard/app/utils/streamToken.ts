import { apiFetch } from "./api";

type StreamTokenResponse = {
  token: string;
  expiresAt?: string;
};

let cachedToken: string | null = null;
let cachedExpiresAt = 0;

export async function getStreamToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedExpiresAt - now > 60_000) {
    return cachedToken;
  }

  try {
    const res = await apiFetch("/auth/stream-token", { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as StreamTokenResponse;
    if (!data.token) return null;

    const parsedExpiry = data.expiresAt ? Date.parse(data.expiresAt) : NaN;
    cachedExpiresAt = Number.isFinite(parsedExpiry) ? parsedExpiry : now + 4 * 60_000;
    cachedToken = data.token;
    return cachedToken;
  } catch {
    return null;
  }
}

export function clearStreamTokenCache(): void {
  cachedToken = null;
  cachedExpiresAt = 0;
}
