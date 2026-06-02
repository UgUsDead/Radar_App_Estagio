from pathlib import Path
p = Path('c:/Users/hugom/Desktop/Estagio/BLE/esp_backups/20260424_105841/esp32_factory_app_0x10000_0x180000.bin')
b = p.read_bytes()
needle = b'mqtt://10.10.128.175:1883'
idxs = []
start = 0
while True:
    i = b.find(needle, start)
    if i < 0:
        break
    idxs.append(i)
    start = i + 1
print(f'COUNT={len(idxs)}')
for i in idxs:
    print(f'OFFSET=0x{i:08x}')
