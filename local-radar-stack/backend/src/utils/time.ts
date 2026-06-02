export function toIso(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

export function toDay(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}
