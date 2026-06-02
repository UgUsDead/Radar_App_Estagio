
import { normalizeBase } from './backend';
import { loadAuthToken } from '../services/settingsStorage';

export async function submitIncidentResponse(apiBase: string, eventId: string, action: 'ack' | 'arrived' | 'resolve' | 'escalate', notes?: string) {
  const base = normalizeBase(apiBase);
  try {
    const token = await loadAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`${base}/events/${eventId}/${action === 'escalate' ? 'escalate' : action}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ actor: "mobile_rapid_response", action_taken: action, notes })
    });
    return res.ok;
  } catch (e) {
    // Queue locally if offline (Feature 14)
    console.log("Network error, queuing offline action (mock)");
    return false;
  }
}
