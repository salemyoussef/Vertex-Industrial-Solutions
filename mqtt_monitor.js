// Quick test: subscribe to all factory topics and print anything received
require('dotenv').config();
const mqtt = require('mqtt');

const client = mqtt.connect('mqtt://localhost:1884', {
  username: 'internal_ingestion',
  password: process.env.MQTT_INTERNAL_SECRET
});

client.on('connect', () => {
  console.log('✅ Monitor connected. Listening on factory/# ...\n');
  client.subscribe('factory/#');
  client.subscribe('#'); // listen to everything
});

client.on('message', (topic, payload) => {
  console.log(`📨 Message received!`);
  console.log(`   Topic   : ${topic}`);
  console.log(`   Payload : ${payload.toString()}`);
  console.log('');
});

setTimeout(() => {
  console.log('⏱️  30 seconds elapsed - no messages received on factory/#');
  console.log('   → CODESYS is NOT reaching the broker.');
  process.exit();
}, 30000);
