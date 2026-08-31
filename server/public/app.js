/**
 * Backend Admin Dashboard Application Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  let authToken = sessionStorage.getItem('fk_admin_token') || '';
  let allKeysCache = [];

  // DOM Elements
  const loginScreen = document.getElementById('loginScreen');
  const adminApp = document.getElementById('adminApp');
  const loginForm = document.getElementById('loginForm');
  const adminPasswordInput = document.getElementById('adminPassword');
  const loginError = document.getElementById('loginError');
  const btnLogout = document.getElementById('btnLogout');

  // Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const viewPanes = document.querySelectorAll('.view-pane');
  const viewHeading = document.getElementById('viewHeading');
  const viewSubheading = document.getElementById('viewSubheading');
  const btnQuickNewKey = document.getElementById('btnQuickNewKey');
  const btnViewAllKeys = document.getElementById('btnViewAllKeys');

  // Stats
  const statTotalKeys = document.getElementById('statTotalKeys');
  const statActiveKeys = document.getElementById('statActiveKeys');
  const statDevices = document.getElementById('statDevices');
  const statExpiredKeys = document.getElementById('statExpiredKeys');
  const recentKeysTableBody = document.getElementById('recentKeysTableBody');

  // Key Generator
  const keyGeneratorForm = document.getElementById('keyGeneratorForm');
  const genPlanSelect = document.getElementById('genPlanSelect');
  const genCustomDaysGroup = document.getElementById('genCustomDaysGroup');
  const genCustomDays = document.getElementById('genCustomDays');
  const genClientName = document.getElementById('genClientName');
  const genMaxDevices = document.getElementById('genMaxDevices');
  const generatedBanner = document.getElementById('generatedBanner');
  const newGeneratedKeyCode = document.getElementById('newGeneratedKeyCode');
  const newGeneratedKeyDetails = document.getElementById('newGeneratedKeyDetails');
  const btnCopyGeneratedKey = document.getElementById('btnCopyGeneratedKey');

  // All Keys View
  const allKeysTableBody = document.getElementById('allKeysTableBody');
  const keysSearchInput = document.getElementById('keysSearchInput');
  const statusFilterSelect = document.getElementById('statusFilterSelect');

  // Audit Logs
  const activityLogsTableBody = document.getElementById('activityLogsTableBody');

  // Security
  const changePasswordForm = document.getElementById('changePasswordForm');
  const oldPasswordInput = document.getElementById('oldPasswordInput');
  const newPasswordInput = document.getElementById('newPasswordInput');
  const passwordAlert = document.getElementById('passwordAlert');

  // Extend Modal
  const extendModal = document.getElementById('extendModal');
  const btnCloseExtendModal = document.getElementById('btnCloseExtendModal');
  const extendTargetKeyId = document.getElementById('extendTargetKeyId');
  const extraDaysInput = document.getElementById('extraDaysInput');
  const btnConfirmExtend = document.getElementById('btnConfirmExtend');

  const toast = document.getElementById('toast');

  // Initialize
  initAuth();
  bindEvents();

  /**
   * Initialize Authentication state
   */
  function initAuth() {
    if (authToken) {
      showDashboard();
    } else {
      showLogin();
    }
  }

  function showLogin() {
    loginScreen.classList.remove('hidden');
    adminApp.classList.add('hidden');
    adminPasswordInput.focus();
  }

  function showDashboard() {
    loginScreen.classList.add('hidden');
    adminApp.classList.remove('hidden');
    loadDashboardData();
  }

  /**
   * Bind event handlers
   */
  function bindEvents() {
    // Login
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.classList.add('hidden');
      const password = adminPasswordInput.value.trim();

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success && data.token) {
          authToken = data.token;
          sessionStorage.setItem('fk_admin_token', authToken);
          adminPasswordInput.value = '';
          showDashboard();
          showToast('Welcome to Admin Portal!');
        } else {
          loginError.textContent = data.error || 'Invalid password.';
          loginError.classList.remove('hidden');
        }
      } catch (err) {
        loginError.textContent = 'Failed to connect to backend server.';
        loginError.classList.remove('hidden');
      }
    });

    // Logout
    btnLogout.addEventListener('click', () => {
      authToken = '';
      sessionStorage.removeItem('fk_admin_token');
      showLogin();
      showToast('Logged out.');
    });

    // Navigation
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetView = item.getAttribute('data-view');
        switchView(targetView);
      });
    });

    btnQuickNewKey.addEventListener('click', () => switchView('generatorView'));
    if (btnViewAllKeys) {
      btnViewAllKeys.addEventListener('click', () => switchView('keysView'));
    }

    // Generator Form
    genPlanSelect.addEventListener('change', () => {
      genCustomDaysGroup.classList.toggle('hidden', genPlanSelect.value !== 'CUSTOM');
    });

    keyGeneratorForm.addEventListener('submit', handleGenerateKey);
    btnCopyGeneratedKey.addEventListener('click', () => {
      navigator.clipboard.writeText(newGeneratedKeyCode.textContent).then(() => {
        showToast('License Key copied to clipboard!');
      });
    });

    // Search and Filters in Keys Table
    keysSearchInput.addEventListener('input', filterAndRenderKeysTable);
    statusFilterSelect.addEventListener('change', filterAndRenderKeysTable);

    // Change Password
    changePasswordForm.addEventListener('submit', handleChangePassword);

    // Extend Modal
    btnCloseExtendModal.addEventListener('click', () => extendModal.classList.add('hidden'));
    btnConfirmExtend.addEventListener('click', handleConfirmExtend);
  }

  /**
   * Switch View Pane
   */
  function switchView(viewId) {
    navItems.forEach(n => n.classList.toggle('active', n.getAttribute('data-view') === viewId));
    viewPanes.forEach(p => p.classList.toggle('active', p.id === viewId));

    const titles = {
      dashboardView: { h: 'Dashboard Overview', s: 'Manage licenses, memberships, and client activations' },
      generatorView: { h: 'Generate License Key', s: 'Create new access keys for monthly, yearly, custom, or lifetime plans' },
      keysView: { h: 'License Keys Database', s: 'Search, extend, revoke, or delete issued keys' },
      activityView: { h: 'Audit Logs', s: 'Live records of all activations and administrative changes' },
      settingsView: { h: 'Admin Security', s: 'Change master admin password' }
    };

    if (titles[viewId]) {
      viewHeading.textContent = titles[viewId].h;
      viewSubheading.textContent = titles[viewId].s;
    }

    if (viewId === 'dashboardView') loadDashboardData();
    if (viewId === 'keysView') loadAllKeys();
    if (viewId === 'activityView') loadAuditLogs();
  }

  /**
   * Helper API Fetch with Authorization
   */
  async function apiFetch(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...(options.headers || {})
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      showToast('Session expired. Please log in again.');
      authToken = '';
      sessionStorage.removeItem('fk_admin_token');
      showLogin();
      throw new Error('Unauthorized');
    }
    return res.json();
  }

  /**
   * Load Dashboard Stats
   */
  async function loadDashboardData() {
    try {
      const stats = await apiFetch('/api/admin/dashboard');
      statTotalKeys.textContent = stats.totalKeys;
      statActiveKeys.textContent = stats.activeKeys;
      statDevices.textContent = stats.totalActivatedDevices;
      statExpiredKeys.textContent = stats.expiredKeys + stats.revokedKeys;

      // Also load recent keys
      const keysData = await apiFetch('/api/admin/keys');
      allKeysCache = keysData.keys || [];
      renderRecentKeys(allKeysCache.slice(0, 5));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  }

  /**
   * Render Recent Keys in Overview
   */
  function renderRecentKeys(keys) {
    recentKeysTableBody.innerHTML = '';
    if (keys.length === 0) {
      recentKeysTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:20px;">No license keys generated yet.</td></tr>`;
      return;
    }

    keys.forEach(k => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${k.key}</code></td>
        <td><strong>${escapeHtml(k.clientName)}</strong></td>
        <td>${k.planType}</td>
        <td>${k.daysRemaining} days</td>
        <td><span class="badge-status ${k.currentStatus.toLowerCase()}">${k.currentStatus}</span></td>
        <td>${k.activatedDevices ? k.activatedDevices.length : 0} / ${k.maxDevices}</td>
        <td>
          <button class="btn-action-sm primary btn-copy-key" data-key="${k.key}">Copy</button>
        </td>
      `;
      recentKeysTableBody.appendChild(tr);
    });

    attachTableActionHandlers(recentKeysTableBody);
  }

  /**
   * Load All Keys
   */
  async function loadAllKeys() {
    try {
      const data = await apiFetch('/api/admin/keys');
      allKeysCache = data.keys || [];
      filterAndRenderKeysTable();
    } catch (err) {
      console.error('Failed to load keys:', err);
    }
  }

  /**
   * Filter and render keys table
   */
  function filterAndRenderKeysTable() {
    const search = keysSearchInput.value.toLowerCase().trim();
    const statusFilter = statusFilterSelect.value;

    const filtered = allKeysCache.filter(k => {
      const matchesSearch = !search || 
        k.key.toLowerCase().includes(search) || 
        k.clientName.toLowerCase().includes(search) || 
        k.planType.toLowerCase().includes(search);

      const matchesStatus = statusFilter === 'ALL' || k.currentStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });

    allKeysTableBody.innerHTML = '';
    if (filtered.length === 0) {
      allKeysTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:24px;">No matching keys found.</td></tr>`;
      return;
    }

    filtered.forEach(k => {
      const tr = document.createElement('tr');
      const isRevoked = k.currentStatus === 'REVOKED';

      tr.innerHTML = `
        <td><code>${k.key}</code></td>
        <td><strong>${escapeHtml(k.clientName)}</strong></td>
        <td>${k.planType}</td>
        <td>${k.planType === 'LIFETIME' ? 'Lifetime' : k.daysRemaining + 'd'}</td>
        <td>${k.expiryDateFormatted}</td>
        <td><span class="badge-status ${k.currentStatus.toLowerCase()}">${k.currentStatus}</span></td>
        <td>${k.activatedDevices ? k.activatedDevices.length : 0} / ${k.maxDevices}</td>
        <td>
          <div class="action-btn-group">
            <button class="btn-action-sm primary btn-copy-key" data-key="${k.key}" title="Copy Key">📋</button>
            <button class="btn-action-sm btn-extend-key" data-id="${k.id}" title="Extend Days">⏳</button>
            ${isRevoked 
              ? `<button class="btn-action-sm btn-restore-key" data-id="${k.id}" title="Restore Key">✅</button>`
              : `<button class="btn-action-sm danger btn-revoke-key" data-id="${k.id}" title="Revoke Key">🚫</button>`
            }
            <button class="btn-action-sm danger btn-delete-key" data-id="${k.id}" title="Delete Key">🗑️</button>
          </div>
        </td>
      `;
      allKeysTableBody.appendChild(tr);
    });

    attachTableActionHandlers(allKeysTableBody);
  }

  /**
   * Attach Action Listeners to Tables
   */
  function attachTableActionHandlers(container) {
    container.querySelectorAll('.btn-copy-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        navigator.clipboard.writeText(key).then(() => showToast('Copied key to clipboard!'));
      });
    });

    container.querySelectorAll('.btn-extend-key').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        extendTargetKeyId.value = id;
        extendModal.classList.remove('hidden');
        extraDaysInput.focus();
      });
    });

    container.querySelectorAll('.btn-revoke-key').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to revoke this license key? The user will lose access immediately.')) {
          const res = await apiFetch('/api/admin/revoke-key', {
            method: 'POST',
            body: JSON.stringify({ keyId: id })
          });
          if (res.success) {
            showToast('License key revoked.');
            loadAllKeys();
            loadDashboardData();
          }
        }
      });
    });

    container.querySelectorAll('.btn-restore-key').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const res = await apiFetch('/api/admin/restore-key', {
          method: 'POST',
          body: JSON.stringify({ keyId: id })
        });
        if (res.success) {
          showToast('License key restored to Active.');
          loadAllKeys();
          loadDashboardData();
        }
      });
    });

    container.querySelectorAll('.btn-delete-key').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Permanently delete this license key from the database?')) {
          const res = await apiFetch('/api/admin/delete-key', {
            method: 'POST',
            body: JSON.stringify({ keyId: id })
          });
          if (res.success) {
            showToast('License key deleted.');
            loadAllKeys();
            loadDashboardData();
          }
        }
      });
    });
  }

  /**
   * Handle Key Generation
   */
  async function handleGenerateKey(e) {
    e.preventDefault();
    const planType = genPlanSelect.value;
    let days = 30;

    if (planType === 'MONTHLY') days = 30;
    else if (planType === 'YEARLY') days = 365;
    else if (planType === 'LIFETIME') days = 36500;
    else if (planType === 'CUSTOM') {
      days = parseInt(genCustomDays.value, 10);
      if (isNaN(days) || days <= 0) {
        showToast('Please enter a valid number of days.');
        return;
      }
    }

    const clientName = genClientName.value.trim() || 'User';
    const maxDevices = parseInt(genMaxDevices.value, 10) || 1;

    try {
      const res = await apiFetch('/api/admin/generate-key', {
        method: 'POST',
        body: JSON.stringify({ planType, days, clientName, maxDevices })
      });

      if (res.success && res.key) {
        newGeneratedKeyCode.textContent = res.key.key;
        newGeneratedKeyDetails.textContent = `Valid for ${days === 36500 ? 'Lifetime Access' : days + ' Days'} • ${planType} Plan • Client: ${clientName} (Max ${maxDevices} device${maxDevices > 1 ? 's' : ''})`;
        generatedBanner.classList.remove('hidden');
        showToast('✨ License Key Generated!');
        loadDashboardData();
      }
    } catch (err) {
      showToast('Error generating key.');
    }
  }

  /**
   * Confirm Extend Days
   */
  async function handleConfirmExtend() {
    const keyId = extendTargetKeyId.value;
    const days = parseInt(extraDaysInput.value, 10);

    if (isNaN(days) || days <= 0) {
      showToast('Please enter a valid number of days.');
      return;
    }

    try {
      const res = await apiFetch('/api/admin/extend-key', {
        method: 'POST',
        body: JSON.stringify({ keyId, days })
      });

      if (res.success) {
        extendModal.classList.add('hidden');
        showToast(`✅ Added ${days} days to license key!`);
        loadAllKeys();
        loadDashboardData();
      }
    } catch (err) {
      showToast('Error extending key.');
    }
  }

  /**
   * Load Audit Logs
   */
  async function loadAuditLogs() {
    try {
      const stats = await apiFetch('/api/admin/dashboard');
      activityLogsTableBody.innerHTML = '';

      if (!stats.recentLogs || stats.recentLogs.length === 0) {
        activityLogsTableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#94a3b8; padding:20px;">No audit logs yet.</td></tr>`;
        return;
      }

      stats.recentLogs.forEach(l => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><small>${new Date(l.timestamp).toLocaleString()}</small></td>
          <td><strong>${l.action}</strong></td>
          <td>${escapeHtml(l.details)}</td>
        `;
        activityLogsTableBody.appendChild(tr);
      });
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  }

  /**
   * Change Master Password
   */
  async function handleChangePassword(e) {
    e.preventDefault();
    passwordAlert.classList.add('hidden');

    const oldPassword = oldPasswordInput.value;
    const newPassword = newPasswordInput.value;

    try {
      const res = await apiFetch('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword })
      });

      if (res.success) {
        passwordAlert.textContent = '✅ Master admin password updated successfully!';
        passwordAlert.style.color = 'var(--success)';
        passwordAlert.classList.remove('hidden');
        oldPasswordInput.value = '';
        newPasswordInput.value = '';
        showToast('Password updated!');
      } else {
        passwordAlert.textContent = res.error || 'Failed to update password.';
        passwordAlert.style.color = 'var(--danger)';
        passwordAlert.classList.remove('hidden');
      }
    } catch (err) {
      passwordAlert.textContent = 'Error updating password.';
      passwordAlert.style.color = 'var(--danger)';
      passwordAlert.classList.remove('hidden');
    }
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2800);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
