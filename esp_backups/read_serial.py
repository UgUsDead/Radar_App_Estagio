import serial, time
ser = serial.Serial('COM3', 115200, timeout=0.5)
end = time.time() + 12
print('--- serial capture start ---')
while time.time() < end:
    line = ser.readline()
    if line:
        try:
            print(line.decode('utf-8', 'ignore').rstrip())
        except Exception:
            print(repr(line))
print('--- serial capture end ---')
ser.close()
