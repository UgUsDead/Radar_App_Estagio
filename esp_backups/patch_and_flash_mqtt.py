from pathlib import Path
import hashlib
import subprocess
import sys

base = Path('c:/Users/hugom/Desktop/Estagio/BLE/esp_backups/20260424_105841')
app_in = base / 'esp32_factory_app_0x10000_0x180000.bin'
app_out = base / 'esp32_factory_app_mqtt_192_168_1_205.bin'
old = b'mqtt://10.10.128.175:1883'
new = b'mqtt://192.168.1.205:1883'

if len(old) != len(new):
    raise SystemExit(f'Length mismatch old={len(old)} new={len(new)}; refusing to patch')

img = bytearray(app_in.read_bytes())
count = img.count(old)
if count != 1:
    raise SystemExit(f'Expected exactly 1 occurrence, found {count}')
idx = img.find(old)
img[idx:idx+len(old)] = new

if img[0] != 0xE9:
    raise SystemExit('Not a valid ESP image (bad magic)')
segment_count = img[1]

off = 24
cs = 0xEF
for _ in range(segment_count):
    if off + 8 > len(img):
        raise SystemExit('Corrupt image while parsing segment headers')
    seg_len = int.from_bytes(img[off+4:off+8], 'little')
    off += 8
    if off + seg_len > len(img):
        raise SystemExit('Corrupt image while parsing segment data')
    for b in img[off:off+seg_len]:
        cs ^= b
    off += seg_len

checksum_off = (off + 15) & ~15
if checksum_off >= len(img):
    raise SystemExit('Checksum offset beyond image length')
img[checksum_off] = cs

hash_appended = img[23] == 1
if hash_appended:
    digest_off = checksum_off + 1
    if digest_off + 32 <= len(img):
        digest = hashlib.sha256(bytes(img[:checksum_off+1])).digest()
        img[digest_off:digest_off+32] = digest
    else:
        raise SystemExit('Header indicates hash appended but digest area missing')

app_out.write_bytes(img)
print(f'PATCHED_FILE={app_out}')
print(f'PATCH_OFFSET=0x{idx:08x}')
print(f'NEW_URI={new.decode()}')
print(f'CHECKSUM_OFFSET=0x{checksum_off:08x}')
print(f'HASH_APPENDED={hash_appended}')

cmd = [sys.executable, '-m', 'esptool', '--port', 'COM3', '--baud', '460800', 'write_flash', '0x10000', str(app_out)]
print('FLASH_CMD=' + ' '.join(cmd))
subprocess.check_call(cmd)
print('FLASH_DONE=1')
