import re
from pathlib import Path
p = Path('c:/Users/hugom/Desktop/Estagio/BLE/esp_backups/20260424_105841/esp32_com3_fullflash_4mb.bin')
b = p.read_bytes()
strings = [m.group().decode('ascii', 'ignore') for m in re.finditer(rb'[ -~]{6,}', b)]
keys = ('mqtt', 'broker', 'wifi', 'ssid', 'password', 'home', 'tcp://', 'ssl://', '.local', ':1883', ':8883')
seen = set()
count = 0
for x in strings:
    lx = x.lower()
    if any(k in lx for k in keys):
        if x not in seen:
            seen.add(x)
            print(x)
            count += 1
            if count >= 400:
                break
