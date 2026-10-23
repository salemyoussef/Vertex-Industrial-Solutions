(*
╔══════════════════════════════════════════════════════╗
║   SMART FACTORY — STEP 1: Envoi Température          ║
║   Environnement : CODESYS 3.5                        ║
║   Librairie     : CODESYS IoT MQTT (depuis le Store) ║
╚══════════════════════════════════════════════════════╝

AVANT DE COMPILER:
  1. CODESYS Store → chercher "MQTT" → installer "CODESYS IoT MQTT"
  2. References du projet → ajouter "CODESYS IoT MQTT"
  3. Remplir les 4 constantes en bas dans VAR_INPUT / CONFIG
*)

PROGRAM PLC_STEP1
VAR
    // ── CONFIGURATION ─────────────────────────────────
    sBrokerIP       : STRING := '127.0.0.1';
    uiPort          : UINT   := 1884;
    sUsername       : STRING := 'YOUR_PLC_USERNAME';
    sPassword       : STRING := 'YOUR_PLC_PASSWORD';
    sTopicBase      : STRING := 'factory/site_1/device_YOUR_DEVICE_ID';

    // ── BLOCS MQTT ────────────────────────────────────
    fbClient        : MQTT.MqttClient;
    fbPublish       : MQTT.MqttPublish;

    // ── TIMER 2 SECONDES ──────────────────────────────
    tonPublish      : TON;

    // ── SIMULATION TEMPÉRATURE ────────────────────────
    rPhase          : REAL := 0.0;
    rTemperature    : REAL := 0.0;

    // ── VARIABLES INTERNES ────────────────────────────
    sTopicPub       : STRING(128);
    sPayload        : STRING(32);
    xPublish        : BOOL := FALSE;
END_VAR

// ══════════════════════════════════════════════════════
//  1. CONNEXION AU BROKER
// ══════════════════════════════════════════════════════

fbClient(
    xEnable        := TRUE,
    sHostname      := sBrokerIP,
    uiPort         := uiPort,
    sUsername      := sUsername,
    sPassword      := sPassword,
    sClientId      := 'CODESYS_PLC_Step1'
);

// ══════════════════════════════════════════════════════
//  2. CALCUL TEMPÉRATURE (onde sinusoïdale)
// ══════════════════════════════════════════════════════

rPhase := rPhase + 0.01;
IF rPhase > 6.2832 THEN
    rPhase := rPhase - 6.2832;
END_IF

// Température entre 20°C et 30°C
rTemperature := 25.0 + 5.0 * SIN(rPhase);

// ══════════════════════════════════════════════════════
//  3. PUBLICATION TOUTES LES 2 SECONDES
// ══════════════════════════════════════════════════════

tonPublish(IN := NOT tonPublish.Q, PT := T#2S);

IF tonPublish.Q AND fbClient.xConnectedToBroker THEN
    sTopicPub := CONCAT(sTopicBase, '/telemetry/Temperature');
    sPayload  := REAL_TO_STRING(rTemperature);
    xPublish  := TRUE;
END_IF

fbPublish(
    mqttClient      := fbClient,
    wsTopicName     := sTopicPub,
    pbPayload       := ADR(sPayload),
    udiPayloadSize  := TO_UDINT(LEN(sPayload)),
    xExecute        := xPublish
);

IF fbPublish.xDone OR fbPublish.xError THEN
    xPublish := FALSE;
END_IF
