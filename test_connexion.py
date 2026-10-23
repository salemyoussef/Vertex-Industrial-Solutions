"""
SMART FACTORY — TEST DE CONNEXION SIMPLE
=========================================
1 variable publiée  → Temperature (affiche sur le Display)
1 bouton reçu      → StartMachine (affiche dans le terminal)
1 slider reçu      → TempSetpoint (affiche dans le terminal)

SETUP:
  pip install paho-mqtt

CONFIGURER (3 lignes à changer):
  BROKER_HOST, MQTT_USERNAME, MQTT_PASSWORD, TOPIC_BASE
"""

import paho.mqtt.client as mqtt
import time
import math

# ═══════════════════════════════════════════
#  CONFIGURATION  ← changer ces 4 valeurs
BROKER_HOST   = "localhost"             # ou IP de votre broker MQTT
BROKER_PORT   = 1884
MQTT_USERNAME = "YOUR_PLC_USERNAME"     # Depuis le dashboard
MQTT_PASSWORD = "YOUR_PLC_PASSWORD"     # Depuis le dashboard
TOPIC_BASE    = "YOUR_BASE_TOPIC"       # Ex: company1/zone1/plc01
# ═══════════════════════════════════════════

tick = 0

def on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code == 0:
        print(f"\n✅  Connecté au broker  {BROKER_HOST}:{BROKER_PORT}")
        # S'abonner aux commandes du dashboard
        client.subscribe(f"{TOPIC_BASE}/command/#")
        print(f"📡  En écoute sur : {TOPIC_BASE}/command/#\n")
    else:
        print(f"❌  Connexion refusée (code {reason_code})")

def on_message(client, userdata, msg):
    topic   = msg.topic
    payload = msg.payload.decode()
    key     = topic.split("/command/")[-1]

    print(f"\n  📥  Commande reçue !")
    print(f"      Variable : {key}")
    print(f"      Valeur   : {payload}\n")

def on_disconnect(client, userdata, flags, reason_code, properties=None):
    print("⚠️  Déconnecté du broker.")

# ─── Setup client ────────────────────────────────────────────
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
client.on_connect    = on_connect
client.on_message    = on_message
client.on_disconnect = on_disconnect

print("🔌  Connexion au broker...")
try:
    client.connect(BROKER_HOST, BROKER_PORT, keepalive=60)
except Exception as e:
    print(f"❌  Impossible de se connecter : {e}")
    exit(1)

client.loop_start()
time.sleep(1.5)  # Attendre la connexion

print("📤  Publication toutes les 2 secondes...\n")

# ─── Boucle principale ───────────────────────────────────────
while True:
    tick += 1

    # Simulation température sinusoïdale simple
    temperature = 25.0 + 5.0 * math.sin(tick * 0.1)

    topic   = f"{TOPIC_BASE}/telemetry/Temperature"
    payload = f"{temperature:.2f}"

    client.publish(topic, payload, qos=1)
    print(f"  📤  Temperature = {payload} °C")

    time.sleep(2)
