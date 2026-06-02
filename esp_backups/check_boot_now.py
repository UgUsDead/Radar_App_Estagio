import serial, time
ser = serial.Serial('COM3', 115200, timeout=0.4)
end = time.time() + 12
print('---boot-capture-start---')
while time.time() < end:
    data = ser.readline()
    if data:
        print(data.decode('utf-8','ignore').rstrip())
print('---boot-capture-end---')
ser.close()
