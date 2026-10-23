require('dotenv').config();
const { Aedes } = require('aedes');
const pool = require('./db');

const PORT = process.env.MQTT_PORT || 1883;

const MQTT_INTERNAL_SECRET = process.env.MQTT_INTERNAL_SECRET;
if (!MQTT_INTERNAL_SECRET) {
  throw new Error('MQTT_INTERNAL_SECRET environment variable is required');
}

let aedesInstance = null;
let deviceCache = {};       // mqtt_topic_base -> device id
let credentialsCache = {};  // username -> { password, deviceId, topicBase }

// Load BOTH device cache and credentials cache at startup
async function loadCaches() {
  try {
    const res = await pool.query('SELECT id, mqtt_topic_base, mqtt_username, mqtt_password FROM devices');
    res.rows.forEach(row => {
      const topicBase = (row.mqtt_topic_base || '').trim();
      deviceCache[topicBase] = row.id;
      if (row.mqtt_username) {
        credentialsCache[row.mqtt_username.trim()] = {
          password: row.mqtt_password ? row.mqtt_password.trim() : '',
          deviceId: row.id,
          topicBase: topicBase
        };
      }
    });
    console.log(`✅ Device cache loaded: ${res.rows.length} devices authorized.`);
    console.log(`✅ Credentials cache loaded: ${Object.keys(credentialsCache).length} PLC credentials.`);
  } catch (err) {
    console.error('❌ Failed to load caches:', err.message);
  }
}

function processIncomingTelemetry(packet) {
  if (!packet || !packet.topic || !packet.topic.startsWith('factory/')) return;

  const topic = packet.topic;
  const msgStr = packet.payload ? packet.payload.toString() : '';
  console.log(`📨 Telemetry received: ${topic} = ${msgStr}`);

  const topicParts = topic.split('/');
  const feature = topicParts.pop();
  if (topicParts[topicParts.length - 1] === 'telemetry') topicParts.pop();

  const baseTopic = topicParts.join('/');
  let deviceId = deviceCache[baseTopic];

  if (!deviceId) {
    // If exact topic string not found, find the first device matching the base or fallback to first registered device ID
    const keys = Object.keys(deviceCache);
    if (keys.length === 1) {
      deviceId = deviceCache[keys[0]];
    }
  }

  if (!deviceId) {
    console.log(`🚫 Unknown device for topic base: ${baseTopic}`);
    return;
  }

  let value;
  try {
    const parsed = JSON.parse(msgStr);
    value = typeof parsed === 'number' ? parsed
          : parsed.value !== undefined ? parseFloat(parsed.value)
          : parseFloat(msgStr);
  } catch (e) {
    value = parseFloat(msgStr);
  }

  if (isNaN(value)) {
    console.log(`⚠️ Non-numeric value ignored: ${msgStr}`);
    return;
  }

  const timestamp = new Date().toISOString();
  pool.query(
    'INSERT INTO telemetry (time, device_id, feature, value) VALUES ($1, $2, $3, $4)',
    [timestamp, deviceId, feature, value]
  ).then(() => {
    console.log(`💾 Saved to DB: Device ${deviceId} | ${feature} = ${value}`);
  }).catch(err => {
    console.error('❌ DB Ingestion Error:', err.message);
  });
}

async function startBroker() {
  await loadCaches();

  aedesInstance = new Aedes();
  const server = require('net').createServer(aedesInstance.handle);

  // =========================================================================
  // AUTHENTICATION — Synchronous cache lookup
  // =========================================================================
  // aedesInstance.authenticate = function (client, username, password, callback) {
  //  callback(null, true);
  // };

  // =========================================================================
  // AUTHORIZATION (ACL) — Publishing
  // =========================================================================
  aedesInstance.authorizePublish = function (client, packet, callback) {
    if (packet.topic.startsWith('$SYS/') || packet.topic.startsWith('$share/')) {
      return callback(null);
    }

    if (client.role === 'Super Admin' || client.role === 'Internal API') {
      return callback(null);
    }

    // Allow any authenticated PLC to publish to factory/ topics
    if (client.role === 'PLC' && packet.topic.startsWith('factory/')) {
      if (packet.topic.endsWith('/command')) {
        console.log(`🚫 ACL Block: PLC ${client.id} tried to publish to command topic.`);
        return callback(new Error('Unauthorized publish to command topic'));
      }
      return callback(null);
    }

    if (client.topicBase && packet.topic.startsWith(client.topicBase)) {
      if (packet.topic.endsWith('/command')) {
        console.log(`🚫 ACL Block: PLC ${client.id} tried to publish to command topic.`);
        return callback(new Error('Unauthorized publish to command topic'));
      }
      return callback(null);
    }

    console.log(`🚫 ACL Block: ${client.id} tried to publish to '${packet.topic}'`);
    return callback(new Error('Unauthorized topic publish'));
  };

  // =========================================================================
  // AUTHORIZATION (ACL) — Subscribing
  // =========================================================================
  aedesInstance.authorizeSubscribe = function (client, subscription, callback) {
    if (subscription.topic.startsWith('$SYS/') || subscription.topic.startsWith('$share/')) {
      return callback(null, subscription);
    }

    if (client.role === 'Super Admin' || client.role === 'Internal API' || client.role === 'PLC') {
      return callback(null, subscription);
    }

    if (client.topicBase && subscription.topic.startsWith(client.topicBase)) {
      return callback(null, subscription);
    }

    console.log(`🚫 ACL Block: ${client.id} tried to subscribe to ${subscription.topic}`);
    return callback(new Error('Unauthorized topic subscribe'));
  };

  // Error listeners
  aedesInstance.on('clientError', function (client, err) {
    console.log(`⚠️ Client Error (${client ? client.id : 'unknown'}):`, err.message);
  });

  aedesInstance.on('connectionError', function (client, err) {
    console.log(`⚠️ Connection Error (${client ? client.id : 'unknown'}):`, err.message);
  });

  // =========================================================================
  // DIRECT INGESTION — published hook and event listener
  // =========================================================================
  // Removed aedesInstance.published override as it can break Aedes internals

  aedesInstance.on('publish', function (packet, client) {
    if (client) {
      processIncomingTelemetry(packet);
    }
  });

  aedesInstance.on('client', function (client) {
    console.log('new client', client.id);
  });
  aedesInstance.on('clientDisconnect', function (client) {
    console.log('client disconnect', client.id);
  });
  aedesInstance.on('connackSent', function (packet, client) {
    console.log('connack sent to', client.id);
  });
  aedesInstance.on('clientReady', function (client) {
    console.log('client ready', client.id);
  });

  // =========================================================================
  // START LISTENING
  // =========================================================================
  server.listen(PORT, function () {
    console.log(`🔒 Secure Private MQTT Broker started on port ${PORT}`);
    console.log('📡 Ingestion handler active on incoming publishes');
  });
}

// startBroker().catch(console.error); // DISABLED: Using Mosquitto instead

// =========================================================================
// INTERNAL MQTT CLIENT (for sending commands to PLCs)
// =========================================================================
const mqtt = require('mqtt');
let internalClient = null;

function getInternalClient() {
  if (!internalClient) {
    internalClient = mqtt.connect(`mqtt://localhost:${PORT}`, {
      username: 'internal_ingestion',
      password: MQTT_INTERNAL_SECRET,
      clientId: 'internal_command_sender'
    });
    internalClient.on('error', (err) => console.error('Internal MQTT Error:', err.message));
  }
  return internalClient;
}

function publishCommand(topic, payload) {
  return new Promise((resolve, reject) => {
    const client = getInternalClient();
    client.publish(topic, payload, { qos: 1, retain: false }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = { publishCommand };
