import serial, time
ser = serial.Serial('COM3', 115200, timeout=0.5)
end = time.time() + 12
print('---boot-check-start---')
while time.time() < end:
    line = ser.readline()
    if line:
        print(line.decode('utf-8', 'ignore').rstrip())
print('---boot-check-end---')
ser.close()
