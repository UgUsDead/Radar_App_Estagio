import {RoomRow, Patient, EventRow, ZoneConfig, ZoneRoomModel} from '../types';
import { loadAuthToken } from '../services/settingsStorage';

const defaultBase = 'http://localhost:4000';

export type Radar = { id: string; status: string; room_id: number | null; room_name?: string | null };

async function request<T>(baseUrl: string, path: string, init?: RequestInit, authToken?: string | null): Promise<T> {
  const token = authToken ?? await loadAuthToken();
  const baseHeaders = (init?.headers as Record<string, string>) || {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...baseHeaders,
  };
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request failed (${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

export function normalizeBase(baseUrl?: string): string {
  const url = (baseUrl || defaultBase).trim().replace(/\/$/, '');
  return url.length ? url : defaultBase;
}

export async function login(baseUrl: string, username: string, password: string) {
  return request<{ token: string; user: { id: number; username: string; role: string; permissions: string[] } }>(
    normalizeBase(baseUrl),
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    },
    null
  );
}

export async function fetchRooms(baseUrl: string) {
  return request<RoomRow[]>(normalizeBase(baseUrl), '/rooms');
}

export async function createRoom(baseUrl: string, payload: { name: string; floor: number; notes?: string | null }) {
  return request<RoomRow>(normalizeBase(baseUrl), '/rooms', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchPatients(baseUrl: string) {
  return request<Patient[]>(normalizeBase(baseUrl), '/patients');
}

export async function createPatient(baseUrl: string, payload: { name: string; roomId: number | null; metadata?: Record<string, unknown> }) {
  return request<Patient>(normalizeBase(baseUrl), '/patients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchUnassignedRadars(baseUrl: string) {
  const base = normalizeBase(baseUrl);
  try {
    return await request<Radar[]>(base, '/radars/unassigned');
  } catch (err: any) {
    // Fallback for servers that expose unassigned radars via query param
    if (String(err?.message || '').includes('404')) {
      return await request<Radar[]>(base, '/radars?unassigned=true');
    }
    throw err;
  }
}

export async function assignRadar(baseUrl: string, radarId: string, roomId: number | null) {
  await request(normalizeBase(baseUrl), '/radars/assign', {
    method: 'POST',
    body: JSON.stringify({ radarId, roomId }),
  });
}

export async function claimRadar(baseUrl: string, radarId: string) {
  await request(normalizeBase(baseUrl), '/radars/claim', {
    method: 'POST',
    body: JSON.stringify({ radarId }),
  });
}

export async function fetchZones(baseUrl: string, radarId: string) {
  return request<{zones: ZoneConfig[], roomModel?: ZoneRoomModel}>(normalizeBase(baseUrl), `/radars/${radarId}/zones`);
}

export async function fetchEvents(baseUrl: string, limit = 50) {
  return request<EventRow[]>(normalizeBase(baseUrl), `/events?limit=${limit}`);
}
