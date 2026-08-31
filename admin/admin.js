/**
 * Admin Panel Controller
 * Handles authentication, license generation, 1-click memberships, and key history.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const loginSection = document.getElementById('loginSection');
  const dashboardSection = document.getElementById('dashboardSection');
  const adminPinInput = document.getElementById('adminPinInput');
  const btnLogin = document.getElementById('btnLogin');
  const loginAlert = document.getElementById('loginAlert');
  const authStatusBadge = document.getElementById('authStatusBadge');

  // Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Tab 1: Key Generator
  const planSelect = document.getElementById('planSelect');
  const customDaysGroup = document.getElementById('customDaysGroup');
  const customDaysInput = document.getElementById('customDaysInput');
  const clientNameInput = document.getElementById('clientNameInput');
  const btnGenerateKey = document.getElementById('btnGenerateKey');
  const generatedKeyBox = document.getElementById('generatedKeyBox');
  const generatedKeyOutput = document.getElementById('generatedKeyOutput');
  const btnCopyKey = document.getElementById('btnCopyKey');
  const keyMetaInfo = document.getElementById('keyMetaInfo');

  // Tab 2: Direct Grant
  const grantCards = document.querySelectorAll('.btn-grant-card');
  const customDirectDays = document.getElementById('customDirectDays');
  const btnGrantCustomDirect = document.getElementById('btnGrantCustomDirect');
  const btnRevokeDirect = document.getElementById('btnRevokeDirect');

  // Tab 3: Active Status
  const statusActivePill = document.getElementById('statusActivePill');
  const statusPlanText = document.getElementById('statusPlanText');
  const statusDaysRemaining = document.getElementById('statusDaysRemaining');
  const statusExpiryDate = document.getElementById('statusExpiryDate');
  const deviceIdText = document.getElementById('deviceIdText');

  // Tab 4: Key History
  const keysTableBody = document.getElementById('keysTableBody');
  const btnClearKeyHistory = document.getElementById('btnClearKeyHistory');

  // Tab 5: Security
  const currentPinInput = document.getElementById('currentPinInput');
  const newPinInput = document.getElementById('newPinInput');
  const btnChangePin = document.getElementById('btnChangePin');
  const pinAlert = document.getElementById('pinAlert');
  const toastNotification = document.getElementById('toastNotification');

  // Initialize events
  bindAdminEvents();

  /**
   * Bind event listeners
   */
  function bindAdminEvents() {
    btnLogin.addEventListener('click', handleAdminLogin);
    adminPinInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAdminLogin();
    });

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');

        if (targetId === 'activeStatusTab') refreshStatusTab();
        if (targetId === 'keyHistoryTab') loadKeyHistoryTable();
      });
    });

    planSelect.addEventListener('change', () => {
      customDaysGroup.classList.toggle('hidden', planSelect.value !== 'CUSTOM');
    });

    btnGenerateKey.addEventListener('click', handleGenerateLicenseKey);
    btnCopyKey.addEventListener('click', () => {
      navigator.clipboard.writeText(generatedKeyOutput.value).then(() => {
        showToast('License Key copied to clipboard!');
      });
    });

    grantCards.forEach(card => {
      card.addEventListener('click', async () => {
        const plan = card.getAttribute('data-plan');
        const days = parseInt(card.getAttribute('data-days'), 10);
        await LicenseEngine.grantMembership(plan, days, 'Admin Direct');
        showToast(`✅ Granted ${plan} membership (${days === 36500 ? 'Lifetime' : days + ' Days'}) to this browser!`);
        refreshStatusTab();
      });
    });

    btnGrantCustomDirect.addEventListener('click', async () => {
      const days = parseInt(customDirectDays.value, 10);
      if (isNaN(days) || days <= 0) {
        showToast('Please enter a valid number of days.');
        return;
      }
      await LicenseEngine.grantMembership('CUSTOM', days, 'Admin Direct');
      showToast(`✅ Granted Custom ${days} Days membership to this browser!`);
      refreshStatusTab();
    });

    btnRevokeDirect.addEventListener('click', async () => {
      if (confirm('Are you sure you want to revoke membership on this browser?')) {
        await LicenseEngine.revokeMembership();
        showToast('Membership revoked.');
        refreshStatusTab();
      }
    });

    btnClearKeyHistory.addEventListener('click', () => {
      if (confirm('Clear key generation history?')) {
        chrome.storage.local.set({ generatedKeysHistory: [] }, () => {
          loadKeyHistoryTable();
          showToast('History cleared.');
        });
      }
    });

    btnChangePin.addEventListener('click', handleChangeAdminPin);
  }

  /**
   * Handle Admin Login with PIN
   */
  async function handleAdminLogin() {
    const inputPin = adminPinInput.value.trim();
    const storedPin = await getStoredAdminPin();

    if (inputPin === storedPin) {
      loginSection.classList.add('hidden');
      dashboardSection.classList.remove('hidden');
      authStatusBadge.textContent = '🔓 Unlocked (Admin)';
      authStatusBadge.className = 'auth-badge unlocked';
      loginAlert.classList.add('hidden');
      
      refreshStatusTab();
      loadKeyHistoryTable();
    } else {
      loginAlert.textContent = 'Incorrect PIN. Default is admin123';
      loginAlert.classList.remove('hidden');
      adminPinInput.focus();
    }
  }

  /**
   * Get stored admin pin from chrome.storage.local or default
   */
  async function getStoredAdminPin() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['adminPin'], (res) => {
          resolve(res.adminPin || 'admin123');
        });
      } else {
        resolve('admin123');
      }
    });
  }

  /**
   * Handle PIN change
   */
  async function handleChangeAdminPin() {
    const currentPin = currentPinInput.value.trim();
    const newPin = newPinInput.value.trim();
    const storedPin = await getStoredAdminPin();

    if (currentPin !== storedPin) {
      pinAlert.textContent = 'Current PIN is incorrect.';
      pinAlert.classList.remove('hidden');
      return;
    }

    if (newPin.length < 4) {
      pinAlert.textContent = 'New PIN must be at least 4 characters.';
      pinAlert.classList.remove('hidden');
      return;
    }

    chrome.storage.local.set({ adminPin: newPin }, () => {
      pinAlert.textContent = '✅ Admin PIN updated successfully!';
      pinAlert.style.color = 'var(--success)';
      pinAlert.classList.remove('hidden');
      currentPinInput.value = '';
      newPinInput.value = '';
      showToast('Admin PIN updated!');
    });
  }

  /**
   * Handle Generate Key
   */
  async function handleGenerateLicenseKey() {
    const planType = planSelect.value;
    let days = 30;

    if (planType === 'MONTHLY') days = 30;
    else if (planType === 'YEARLY') days = 365;
    else if (planType === 'LIFETIME') days = 36500;
    else if (planType === 'CUSTOM') {
      days = parseInt(customDaysInput.value, 10);
      if (isNaN(days) || days <= 0) {
        showToast('Please enter a valid number of days.');
        return;
      }
    }

    const clientName = clientNameInput.value.trim() || 'User';
    const key = LicenseEngine.generateLicenseKey(planType, days, clientName);

    generatedKeyOutput.value = key;
    keyMetaInfo.textContent = `Valid for ${days === 36500 ? 'Lifetime Access' : days + ' Days'} • ${planType} Plan • Client: ${clientName}`;
    generatedKeyBox.classList.remove('hidden');

    // Save to key history
    await saveKeyToHistory({
      key,
      planType,
      days: days === 36500 ? 'Lifetime' : `${days} Days`,
      clientName,
      generatedAt: new Date().toLocaleString()
    });

    showToast('✨ License Key Generated!');
  }

  /**
   * Save Key to History in storage
   */
  async function saveKeyToHistory(keyObj) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['generatedKeysHistory'], (res) => {
          const list = res.generatedKeysHistory || [];
          list.unshift(keyObj);
          chrome.storage.local.set({ generatedKeysHistory: list }, resolve);
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Load Key History Table
   */
  function loadKeyHistoryTable() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['generatedKeysHistory'], (res) => {
        const list = res.generatedKeysHistory || [];
        keysTableBody.innerHTML = '';

        if (list.length === 0) {
          keysTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:18px;">No license keys generated yet.</td></tr>`;
          return;
        }

        list.forEach((item, idx) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td><code>${item.key}</code></td>
            <td><strong>${item.planType}</strong></td>
            <td>${item.days}</td>
            <td>${item.clientName}</td>
            <td>${item.generatedAt}</td>
            <td>
              <button class="btn-primary-sm btn-table-copy" data-key="${item.key}">Copy</button>
            </td>
          `;
          keysTableBody.appendChild(row);
        });

        document.querySelectorAll('.btn-table-copy').forEach(btn => {
          btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-key');
            navigator.clipboard.writeText(key).then(() => showToast('Copied key to clipboard!'));
          });
        });
      });
    }
  }

  /**
   * Refresh Status Tab
   */
  async function refreshStatusTab() {
    const devId = await LicenseEngine.getDeviceId();
    deviceIdText.textContent = devId;

    const membership = await LicenseEngine.checkMembership();

    if (membership.isActive) {
      statusActivePill.textContent = 'Active Pro';
      statusActivePill.className = 'pill-active';
      statusPlanText.textContent = membership.planType;
      statusDaysRemaining.textContent = membership.isLifetime ? 'Lifetime' : `${membership.daysRemaining} days`;
      statusExpiryDate.textContent = membership.expiryDate;
    } else {
      statusActivePill.textContent = 'Expired / None';
      statusActivePill.className = 'pill-expired';
      statusPlanText.textContent = 'None';
      statusDaysRemaining.textContent = '0 days';
      statusExpiryDate.textContent = 'Inactive';
    }
  }

  /**
   * Toast helper
   */
  function showToast(msg) {
    toastNotification.textContent = msg;
    toastNotification.classList.remove('hidden');
    setTimeout(() => {
      toastNotification.classList.add('hidden');
    }, 2800);
  }
});
