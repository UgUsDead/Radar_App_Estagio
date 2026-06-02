from pathlib import Path
p = Path('c:/Users/hugom/Desktop/Estagio/BLE/esp_backups/20260424_105841/esp32_com3_fullflash_4mb.bin')
out = Path('c:/Users/hugom/Desktop/Estagio/BLE/esp_backups/20260424_105841/candidate_strings.txt')
b = p.read_bytes()
keys = ('mqtt','broker','ssid','wifi','tcp://','ssl://',':1883',':8883','.local','password')
res = []
cur = bytearray()
for ch in b:
    if 32 <= ch <= 126:
        cur.append(ch)
    else:
        if len(cur) >= 6:
            s = cur.decode('ascii', 'ignore')
            ls = s.lower()
            if any(k in ls for k in keys):
                res.append(s)
        cur.clear()
if len(cur) >= 6:
    s = cur.decode('ascii', 'ignore')
    ls = s.lower()
    if any(k in ls for k in keys):
        res.append(s)
uniq = []
seen = set()
for s in res:
    if s not in seen:
        seen.add(s)
        uniq.append(s)
out.write_text('\n'.join(uniq), encoding='utf-8')
print(f'WROTE={out}')
print(f'COUNT={len(uniq)}')
for s in uniq[:120]:
    print(s)
