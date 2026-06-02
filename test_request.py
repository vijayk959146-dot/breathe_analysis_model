import urllib.request
import json

url = "http://10.238.149.66:5000/sensor_data"
data = {"mq2": 2.0, "mq3": 1.5, "mq7": 3.0, "mq135": 4.0}

req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
