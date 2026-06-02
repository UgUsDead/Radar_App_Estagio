/**
 * brokerDiscovery.ts — Stable broker resolution for mobile provisioning.
 *
 * Previous probe-based discovery created many short-lived native MQTT clients
 * and could crash on some devices. This resolver is deterministic and avoids
 * native probe client creation entirely.
 */

import NetInfo from '@react-native-community/netinfo';
import {STATIC_SUBNETS} from '../constants';

export interface BrokerDiscoveryOptions {
  maxCandidates?: number;
  includeStaticFallbacks?: boolean;
}

export function extractIPv4(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) return null;
  const parts = candidate.split('.').map(Number);
  if (parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return candidate;
}

function addUnique(list: string[], value: string | null | undefined): void {
  if (!value) return;
  if (!list.includes(value)) list.push(value);
}

function subnet(ip: string): string {
  return ip.split('.').slice(0, 3).join('.');
}

function buildCandidates(
  preferredIP?: string,
  gatewayIP?: string,
  localIP?: string,
  options?: BrokerDiscoveryOptions,
): string[] {
  const candidates: string[] = [];
  const includeStaticFallbacks = options?.includeStaticFallbacks ?? false;
  const maxCandidates = Math.max(1, Math.min(20, options?.maxCandidates ?? 8));

  addUnique(candidates, extractIPv4(preferredIP));

  const dynamicSubnets: string[] = [];
  if (gatewayIP) dynamicSubnets.push(subnet(gatewayIP));
  if (localIP) dynamicSubnets.push(subnet(localIP));
  if (preferredIP && extractIPv4(preferredIP)) dynamicSubnets.push(subnet(preferredIP));

  const allSubnets = includeStaticFallbacks
    ? [...dynamicSubnets, ...STATIC_SUBNETS]
    : dynamicSubnets;

  for (const base of allSubnets) {
    addUnique(candidates, `${base}.175`);
    addUnique(candidates, `${base}.100`);
    addUnique(candidates, `${base}.1`);
    addUnique(candidates, `${base}.2`);
  }

  return candidates.slice(0, maxCandidates);
}

export async function discoverBrokerIP(
  onProgress?: (msg: string) => void,
  preferredIP?: string,
): Promise<string | null> {
  const candidates = await discoverBrokerCandidates(preferredIP, {
    maxCandidates: 6,
    includeStaticFallbacks: false,
  });
  if (!candidates.length) {
    onProgress?.('No broker candidates available.');
    return null;
  }

  const selected = candidates[0];
  onProgress?.(`Using broker candidate ${selected}`);
  return selected;
}

export async function discoverBrokerCandidates(
  preferredIP?: string,
  options?: BrokerDiscoveryOptions,
): Promise<string[]> {
  const preferred = extractIPv4(preferredIP);

  let gatewayIP: string | null = null;
  let localIP: string | null = null;
  try {
    const state = await NetInfo.fetch();
    const details = (state as any)?.details || {};
    gatewayIP = extractIPv4(details.gateway);
    localIP = extractIPv4(details.ipAddress);
  } catch {
    gatewayIP = null;
    localIP = null;
  }

  const candidates = buildCandidates(
    preferred || undefined,
    gatewayIP || undefined,
    localIP || undefined,
    options,
  );
  return candidates;
}
