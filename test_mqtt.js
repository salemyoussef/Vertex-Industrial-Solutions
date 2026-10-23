const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://127.0.0.1:1884', {
  clientId: 'PLC_Test_Client',
  username: process.env.PLC_USERNAME || 'YOUR_PLC_USERNAME',
  password: process.env.PLC_PASSWORD || 'YOUR_PLC_PASSWORD'
});
client.on('connect', () => {
  console.log('Test Client Connected Successfully!');
  client.publish('factory/site_1/device_id/temperature', '28.5', () => {
    console.log('Test message published');
    client.end();
  });
});
client.on('error', (err) => {
  console.error('Test Client Error:', err);
  client.end();
});
