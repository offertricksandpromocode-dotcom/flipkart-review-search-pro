const LicenseEngine = require('./license.js');

async function testLicenseSystem() {
  console.log('--- Testing License & Membership Engine ---');

  // Test 1: Generate Monthly Key
  const monthlyKey = LicenseEngine.generateLicenseKey('MONTHLY', 30, 'Rohan');
  console.log('Generated Monthly Key (30 Days):', monthlyKey);
  const verifyMonthly = LicenseEngine.verifyLicenseKey(monthlyKey, 'Rohan');
  console.assert(verifyMonthly.isValid && verifyMonthly.days === 30, 'Monthly key verification failed');
  console.log('✓ Monthly Key verified successfully:', verifyMonthly);

  // Test 2: Generate Yearly Key
  const yearlyKey = LicenseEngine.generateLicenseKey('YEARLY', 365, 'Company XYZ');
  console.log('Generated Yearly Key (365 Days):', yearlyKey);
  const verifyYearly = LicenseEngine.verifyLicenseKey(yearlyKey, 'Company XYZ');
  console.assert(verifyYearly.isValid && verifyYearly.days === 365, 'Yearly key verification failed');
  console.log('✓ Yearly Key verified successfully:', verifyYearly);

  // Test 3: Generate Custom Days Key (e.g. 45 Days)
  const customKey = LicenseEngine.generateLicenseKey('CUSTOM', 45, 'Tester');
  console.log('Generated Custom Key (45 Days):', customKey);
  const verifyCustom = LicenseEngine.verifyLicenseKey(customKey, 'Tester');
  console.assert(verifyCustom.isValid && verifyCustom.days === 45, 'Custom 45-day key verification failed');
  console.log('✓ Custom 45-Day Key verified successfully:', verifyCustom);

  // Test 4: Generate Lifetime Key
  const lifetimeKey = LicenseEngine.generateLicenseKey('LIFETIME', 36500, 'VIP User');
  console.log('Generated Lifetime Key:', lifetimeKey);
  const verifyLifetime = LicenseEngine.verifyLicenseKey(lifetimeKey, 'VIP User');
  console.assert(verifyLifetime.isValid && verifyLifetime.planType === 'LIFETIME', 'Lifetime key verification failed');
  console.log('✓ Lifetime Key verified successfully:', verifyLifetime);

  // Test 5: Tamper detection
  const tamperedKey = monthlyKey.slice(0, -2) + 'ZZ';
  const verifyTampered = LicenseEngine.verifyLicenseKey(tamperedKey, 'Rohan');
  console.assert(!verifyTampered.isValid, 'Tamper detection failed');
  console.log('✓ Tampered key successfully rejected:', verifyTampered.error);

  console.log('\n✅ All License & Membership tests passed successfully!');
}

testLicenseSystem().catch(console.error);
