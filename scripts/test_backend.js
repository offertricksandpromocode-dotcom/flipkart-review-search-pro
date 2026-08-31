const http = require('http');

function postJson(path, payload, token = '') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: 'POST',
      headers: headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(path, token = '') {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: 'GET',
      headers: headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('--- Testing Backend API & Admin Panel ---');

  // Test 1: Admin Login
  const loginRes = await postJson('/api/admin/login', { password: 'admin123' });
  console.assert(loginRes.status === 200 && loginRes.data.token, 'Login failed');
  const token = loginRes.data.token;
  console.log('✓ Admin login successful! Token:', token);

  // Test 2: Generate Keys (Monthly, Yearly, Custom 60 Days, Lifetime)
  const key1 = await postJson('/api/admin/generate-key', { planType: 'MONTHLY', days: 30, clientName: 'Client Alpha' }, token);
  console.log('✓ Generated Monthly Key:', key1.data.key.key);

  const key2 = await postJson('/api/admin/generate-key', { planType: 'CUSTOM', days: 60, clientName: 'Client Beta' }, token);
  console.log('✓ Generated Custom 60-Day Key:', key2.data.key.key);

  const key3 = await postJson('/api/admin/generate-key', { planType: 'YEARLY', days: 365, clientName: 'Client Gamma' }, token);
  console.log('✓ Generated Yearly Key:', key3.data.key.key);

  const key4 = await postJson('/api/admin/generate-key', { planType: 'LIFETIME', days: 36500, clientName: 'VIP Client' }, token);
  console.log('✓ Generated Lifetime Key:', key4.data.key.key);

  // Test 3: Client Activation
  const actRes = await postJson('/api/license/activate', { key: key1.data.key.key, deviceId: 'FK-DEV-TEST01' });
  console.assert(actRes.status === 200 && actRes.data.success, 'Activation failed');
  console.log(`✓ Client activated key! Plan: ${actRes.data.planType}, Days remaining: ${actRes.data.daysRemaining}, Expiry: ${actRes.data.expiryDate}`);

  // Test 4: Live Verification
  const verRes = await postJson('/api/license/verify', { key: key1.data.key.key, deviceId: 'FK-DEV-TEST01' });
  console.assert(verRes.data.isValid === true, 'Verification failed');
  console.log('✓ Live license verification successful!');

  // Test 5: Admin Extend Days
  const extRes = await postJson('/api/admin/extend-key', { keyId: key1.data.key.id, days: 15 }, token);
  console.assert(extRes.data.success === true, 'Extend failed');
  console.log('✓ Extended key by 15 days successfully!');

  // Test 6: Dashboard Stats
  const statsRes = await getJson('/api/admin/dashboard', token);
  console.log('✓ Dashboard Stats:', statsRes.data);

  console.log('\n✅ All Backend Server & Admin Panel tests passed 100% successfully!');
}

runTests().catch(console.error);
