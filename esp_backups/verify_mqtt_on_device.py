from pathlib import Path
import subprocess
import sys

out = Path('c:/Users/hugom/Desktop/Estagio/BLE/esp_backups/20260424_105841/verify_app_read.bin')
cmd = [sys.executable, '-m', 'esptool', '--port', 'COM3', '--baud', '460800', 'read_flash', '0x10000', '0x180000', str(out)]
subprocess.check_call(cmd)
b = out.read_bytes()
needle = b'mqtt://192.168.1.205:1883'
print('FOUND_NEW=' + str(needle in b))
print('COUNT_NEW=' + str(b.count(needle)))
old = b'mqtt://10.10.128.175:1883'
print('FOUND_OLD=' + str(old in b))
print('COUNT_OLD=' + str(b.count(old)))
