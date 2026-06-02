import AsyncStorage from '@react-native-async-storage/async-storage';

const DIAGNOSTICS_KEY = '@radarapp/diagnostics-v1';
const MAX_DIAGNOSTICS = 160;

function ts(): string {
  return new Date().toISOString();
}

export async function loadDiagnostics(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DIAGNOSTICS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export async function appendDiagnostic(message: string): Promise<string[]> {
  const entry = `${ts()} | ${message}`;
  const current = await loadDiagnostics();
  const next = [entry, ...current].slice(0, MAX_DIAGNOSTICS);
  try {
    await AsyncStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export async function clearDiagnostics(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DIAGNOSTICS_KEY);
  } catch {}
}
