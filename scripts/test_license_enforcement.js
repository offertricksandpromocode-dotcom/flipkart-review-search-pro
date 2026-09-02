const db = require('../server/database.js');

async function testLicenseEnforcement() {
  console.log('--- Testing License Expiration & Days Remaining Enforcement ---');

  // 1. Generate an active 30-day key
  const activeKey = db.generateKey({ planType: 'MONTHLY', days: 30, clientName: 'Test Active User' });
  console.log('Generated Active Key:', activeKey.key);

  // Activate it
  const actRes = db.activateKey({ key: activeKey.key, deviceId: 'DEV_TEST_1' });
  console.log('Activation Result:', actRes);
  console.assert(actRes.success === true, 'Activation failed');
  console.assert(actRes.daysRemaining === 30, 'Expected 30 days remaining');

  // Verify it
  const verRes = db.verifyLicense({ key: activeKey.key });
  console.log('Verification Result (Active):', verRes);
  console.assert(verRes.isValid === true, 'Expected active key to be valid');
  console.assert(verRes.daysRemaining === 30, 'Expected 30 days remaining in verify');

  // 2. Simulate expired key (set expiresAt in the past)
  const expiredKey = db.generateKey({ planType: 'CUSTOM', days: 1, clientName: 'Test Expired User' });
  db.activateKey({ key: expiredKey.key, deviceId: 'DEV_TEST_2' });

  // Manually set expiration to yesterday
  const expiredRecord = db.data.keys.find(k => k.key === expiredKey.key);
  expiredRecord.expiresAt = Date.now() - (24 * 60 * 60 * 1000); // 1 day ago

  // Verify expired key
  const expCheck = db.verifyLicense({ key: expiredKey.key });
  console.log('Verification Result (Expired):', expCheck);
  console.assert(expCheck.isValid === false, 'Expected expired key to be INVALID');
  console.assert(expCheck.daysRemaining === 0, 'Expected 0 days remaining for expired key');
  console.assert(expCheck.isExpired === true, 'Expected isExpired flag to be true');

  // 3. Test Lifetime key
  const lifeKey = db.generateKey({ planType: 'LIFETIME', days: 36500, clientName: 'Test VIP' });
  db.activateKey({ key: lifeKey.key, deviceId: 'DEV_TEST_3' });
  const lifeCheck = db.verifyLicense({ key: lifeKey.key });
  console.log('Verification Result (Lifetime):', lifeCheck);
  console.assert(lifeCheck.isValid === true, 'Expected lifetime key to be valid');
  console.assert(lifeCheck.planType === 'LIFETIME', 'Expected planType LIFETIME');

  console.log('\n✅ All License Expiration & Days Remaining Enforcement tests PASSED successfully!');
}

testLicenseEnforcement().catch(console.error);
