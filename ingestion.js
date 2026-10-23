require('dotenv').config();
const mqtt = require('mqtt');
const { Pool } = require('pg');

// 1. Database Connection Pool
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: 5432,
});

if (!process.env.MQTT_INTERNAL_SECRET) {
    throw new Error('MQTT_INTERNAL_SECRET environment variable is required');
}

const mqttClient = mqtt.connect(process.env.MQTT_BROKER || 'mqtt://localhost:1883', {
    username: 'internal_ingestion',
    password: process.env.MQTT_INTERNAL_SECRET
});

let deviceCache = {};

// 2. Load allowed devices into memory (Firewall Rules)
async function loadDeviceCache() {
    try {
        const res = await pool.query('SELECT id, mqtt_topic_base FROM devices');
        res.rows.forEach(row => {
            deviceCache[row.mqtt_topic_base.trim()] = row.id;
        });
        console.log('✅ Device cache loaded:', res.rows.length, 'devices authorized.');
    } catch (err) {
        console.error('❌ Failed to load cache:', err.message);
    }
}

// 3. Register MQTT handlers IMMEDIATELY (before any async work)
// This prevents a race condition where 'connect' fires before the handler is registered
mqttClient.on('connect', () => {
    mqttClient.subscribe('factory/#');
    console.log('📡 Listening on factory/#');
});

mqttClient.on('error', (err) => {
    console.error('❌ MQTT Connection Error:', err.message);
});

mqttClient.on('reconnect', () => {
    console.log('🔄 Reconnecting to broker...');
});

// 4. Main Ingestion Logic
async function startIngestion() {
    await loadDeviceCache();

    mqttClient.on('message', async (topic, message) => {
        try {
            const topicParts = topic.split('/');
            const feature = topicParts.pop(); 
            
            // Remove 'telemetry' from the path if present so baseTopic matches the DB
            if (topicParts[topicParts.length - 1] === 'telemetry') {
                topicParts.pop();
            }
            
            const baseTopic = topicParts.join('/'); 

            let deviceId = deviceCache[baseTopic];
            
            // Firewall: Check if device was recently added by a Manager
            if (!deviceId) {
                try {
                    const checkRes = await pool.query('SELECT id FROM devices WHERE mqtt_topic_base = $1', [baseTopic]);
                    if (checkRes.rows.length > 0) {
                        deviceId = checkRes.rows[0].id;
                        deviceCache[baseTopic] = deviceId;
                        console.log(`✅ New device detected & cached: ${baseTopic} -> ID ${deviceId}`);
                    }
                } catch (dbErr) {
                    console.error('Database query failed during firewall check', dbErr);
                }
            }

            // Final Firewall rejection
            if (!deviceId) {
                console.log(`🚫 Firewall blocked: ${baseTopic}`);
                return;
            }

            // Parsing: Handle both raw numbers (99.5) and JSON
            let value, timestamp;
            const msgStr = message.toString();
            
            try {
                const parsed = JSON.parse(msgStr);
                // If it's a raw number or string-number
                if (typeof parsed === 'number' || !isNaN(parseFloat(msgStr))) {
                    value = parseFloat(msgStr);
                    timestamp = new Date().toISOString();
                } 
                // If it's an object {"value": 99.5, "ts": "..."}
                else if (parsed.value !== undefined) {
                    value = parseFloat(parsed.value);
                    timestamp = parsed.ts || new Date().toISOString();
                }
            } catch (e) {
                // Fallback
                value = parseFloat(msgStr);
                timestamp = new Date().toISOString();
            }

            if (isNaN(value)) return;

            // Database Insertion
            await pool.query(
                `INSERT INTO telemetry (time, device_id, feature, value) VALUES ($1, $2, $3, $4)`, 
                [timestamp, deviceId, feature, value]
            );
            
            console.log(`💾 Saved: Device ${deviceId} | ${feature} = ${value}`);
        } catch (err) {
            console.error('❌ Ingestion Error:', err.message);
        }
    });
}

startIngestion();