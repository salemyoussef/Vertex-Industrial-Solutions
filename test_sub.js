require('dotenv').config();
const mqtt = require('mqtt');

const client = mqtt.connect('mqtt://localhost:1884', {
  username: 'internal_ingestion',
  password: process.env.MQTT_INTERNAL_SECRET
});

client.on('connect', () => {
  console.log('✅ Test client connected! Listening for ALL messages on factory/#');
  client.subscribe('factory/#');
});

client.on('message', (topic, message) => {
  console.log(`📨 Message received! Topic: ${topic} | Value: ${message.toString()}`);
});

client.on('error', (err) => {
  console.error('❌ Error:', err.message);
});

setTimeout(() => {
  console.log('⏰ 30 seconds passed. No messages received.');
}, 30000);
