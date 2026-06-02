import NetInfo from '@react-native-community/netinfo';
import {
  discoverBrokerCandidates,
  discoverBrokerIP,
  extractIPv4,
} from '../src/mqtt/brokerDiscovery';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

const mockedNetInfo = NetInfo as unknown as {fetch: jest.Mock};

describe('brokerDiscovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedNetInfo.fetch.mockResolvedValue({
      details: {
        gateway: '10.10.128.1',
        ipAddress: '10.10.128.205',
      },
    });
  });

  it('validates IPv4 values', () => {
    expect(extractIPv4('10.10.128.175')).toBe('10.10.128.175');
    expect(extractIPv4(' 192.168.1.1 ')).toBe('192.168.1.1');
    expect(extractIPv4('999.1.1.1')).toBeNull();
    expect(extractIPv4('abc')).toBeNull();
    expect(extractIPv4(undefined)).toBeNull();
  });

  it('prioritizes preferred broker ip', async () => {
    const candidates = await discoverBrokerCandidates('10.10.128.175', {
      maxCandidates: 5,
      includeStaticFallbacks: false,
    });

    expect(candidates[0]).toBe('10.10.128.175');
  });

  it('respects maxCandidates limit', async () => {
    const candidates = await discoverBrokerCandidates(undefined, {
      maxCandidates: 3,
      includeStaticFallbacks: true,
    });

    expect(candidates.length).toBeLessThanOrEqual(3);
  });

  it('returns first candidate from discoverBrokerIP and reports progress', async () => {
    const onProgress = jest.fn();

    const brokerIP = await discoverBrokerIP(onProgress, '10.10.128.175');

    expect(brokerIP).toBe('10.10.128.175');
    expect(onProgress).toHaveBeenCalledWith(
      expect.stringContaining('Using broker candidate'),
    );
  });

  it('handles netinfo failure and still returns candidates from manual list', async () => {
    mockedNetInfo.fetch.mockRejectedValue(new Error('offline'));

    const candidates = await discoverBrokerCandidates(undefined, {
      maxCandidates: 4,
      includeStaticFallbacks: false,
    });

    expect(candidates.length).toBeGreaterThan(0);
  });
});
