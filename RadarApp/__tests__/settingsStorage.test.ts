import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadProvisionedRadars,
  loadSettingsForDevice,
  persistProvisionedRadars,
  saveSettingsForDevice,
  upsertProvisionedRadar,
} from '../src/services/settingsStorage';

jest.mock(
  '@react-native-async-storage/async-storage',
  () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockedStorage = AsyncStorage as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  clear: jest.Mock;
};

describe('settingsStorage', () => {
  beforeEach(() => {
    mockedStorage.clear();
    jest.clearAllMocks();
  });

  it('saves and loads settings by device id', async () => {
    const settings = {
      speedThreshold: 0.6,
      fallZThreshold: 0.7,
      safeZonePoints: [{x: 1, y: 2}],
      radarHeight: 2.5,
      roomWidth: 6,
      roomDepth: 6,
      wifiSSID: 'TestWiFi',
    };

    await saveSettingsForDevice('radarA', settings);
    const loaded = await loadSettingsForDevice('radarA');
    expect(loaded).toEqual(settings);
    expect(mockedStorage.setItem).toHaveBeenCalled();
  });

  it('persists and loads provisioned radars', async () => {
    const profiles = [
      {
        id: 'r1',
        name: 'Radar 1',
        devicePrefix: 'PROV_',
        wifiSSID: 'WiFi',
        lastBrokerIP: '10.10.128.175',
        lastProvisionedAt: 100,
      },
    ];

    await persistProvisionedRadars(profiles);

    const loaded = await loadProvisionedRadars();
    expect(loaded).toEqual(profiles);
  });

  it('upserts profile and keeps newest first', () => {
    const existing = [
      {
        id: 'r1',
        name: 'Radar 1',
        devicePrefix: 'PROV_',
        wifiSSID: 'WiFi-1',
        lastBrokerIP: '10.10.128.175',
        lastProvisionedAt: 100,
      },
      {
        id: 'r2',
        name: 'Radar 2',
        devicePrefix: 'PROV_',
        wifiSSID: 'WiFi-2',
        lastBrokerIP: '10.10.128.176',
        lastProvisionedAt: 50,
      },
    ];

    const updatedR1 = {
      id: 'r1',
      name: 'Radar 1',
      devicePrefix: 'PROV_',
      wifiSSID: 'WiFi-1-new',
      lastBrokerIP: '10.10.128.200',
      lastProvisionedAt: 200,
    };

    const result = upsertProvisionedRadar(existing, updatedR1);

    expect(result[0]).toEqual(updatedR1);
    expect(result).toHaveLength(2);
    expect(result.find(profile => profile.id === 'r1')?.lastBrokerIP).toBe(
      '10.10.128.200',
    );
  });
});
