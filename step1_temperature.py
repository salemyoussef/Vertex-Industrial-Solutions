"""
STEP 1 — Envoyer la température au Smart Factory
=================================================
C'est tout ce que ce script fait.
"""

import paho.mqtt.client as mqtt
import time
import math
import json
import datetime

# ══════════════════════════════════════════
#  À CONFIGURER
# ══════════════════════════════════════════
BROKER_HOST   = "localhost"
BROKER_PORT   = 1884
MQTT_USERNAME = "YOUR_PLC_USERNAME"
MQTT_PASSWORD = "YOUR_PLC_PASSWORD"
TOPIC_BASE    = "YOUR_BASE_TOPIC"
# ══════════════════════════════════════════

def on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code == 0:
        print("✅  Connecté !")
    else:
        print(f"❌  Erreur connexion : {reason_code}")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
client.on_connect = on_connect

client.connect(BROKER_HOST, BROKER_PORT)
client.loop_start()
time.sleep(1)

tick = 0
while True:
    tick += 1
    temperature = 25.0 + 5.0 * math.sin(tick * 0.1)
    topic   = f"{TOPIC_BASE}/telemetry/Temperature"
    ts = datetime.datetime.utcnow().isoformat() + "Z"
    payload = json.dumps({"value": round(temperature, 2), "ts": ts})
    client.publish(topic, payload)
    print(f"  Envoi → Temperature = {payload}")
    time.sleep(2)
