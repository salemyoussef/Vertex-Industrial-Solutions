const http = require('http');

const data = JSON.stringify({
  username: 'admin',
  password: 'adminpassword'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log('Login Response:', body);
    const parsed = JSON.parse(body);
    const token = parsed.token;
    
    if (token) {
      // Now try to create a manager
      const mgrData = JSON.stringify({
        username: 'test_manager',
        password: 'ChangeMe123!',
        site_id: 2,
        email: 'manager@smartfactory.local'
      });
      
      const mgrOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/users/manager',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': mgrData.length,
          'Authorization': 'Bearer ' + token
        }
      };
      
      const req2 = http.request(mgrOptions, res2 => {
        let body2 = '';
        res2.on('data', d => body2 += d);
        res2.on('end', () => {
          console.log('Create Manager Response:', body2);
        });
      });
      req2.write(mgrData);
      req2.end();
    }
  });
});

req.write(data);
req.end();
