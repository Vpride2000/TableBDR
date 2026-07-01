const http = require('http');

const payload = JSON.stringify({
  Лимит: '100',
  БДР25корр: '10',
  БДР26: '20',
  БДР26корр: '30',
});

const req = http.request({
  host: 'localhost',
  port: 4000,
  path: '/api/gn/bdr/1',
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
}, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(`status=${res.statusCode}`);
    console.log(data);
  });
});

req.on('error', (err) => {
  console.error(err);
  process.exit(1);
});

req.write(payload);
req.end();
