/**
 * Web Application Controller for Flipkart Review Search Pro
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const webProductUrl = document.getElementById('webProductUrl');
  const webProductBanner = document.getElementById('webProductBanner');
  const webProductTitleText = document.getElementById('webProductTitleText');

  const webNamesInput = document.getElementById('webNamesInput');
  const webNameBadge = document.getElementById('webNameBadge');
  const webLocationInput = document.getElementById('webLocationInput');
  const webLocBadge = document.getElementById('webLocBadge');
  const sampleChips = document.querySelectorAll('.sample-chip');

  const webScopeSelect = document.getElementById('webScopeSelect');
  const webMaxPages = document.getElementById('webMaxPages');
  const webThresholdSlider = document.getElementById('webThresholdSlider');
  const webThresholdVal = document.getElementById('webThresholdVal');

  const btnWebSearch = document.getElementById('btnWebSearch');
  const btnWebDelete = document.getElementById('btnWebDelete');
  const webProgressBox = document.getElementById('webProgressBox');
  const webProgressText = document.getElementById('webProgressText');
  const webProgressBarFill = document.getElementById('webProgressBarFill');
  const webAlert = document.getElementById('webAlert');

  const webAvailabilityCard = document.getElementById('webAvailabilityCard');
  const webTotalFoundPill = document.getElementById('webTotalFoundPill');
  const webAvailabilityList = document.getElementById('webAvailabilityList');

  const webResultsToolbar = document.getElementById('webResultsToolbar');
  const webMatchCount = document.getElementById('webMatchCount');
  const webReviewsList = document.getElementById('webReviewsList');
  const webEmptyState = document.getElementById('webEmptyState');

  const btnWebCsv = document.getElementById('btnWebCsv');
  const btnWebJson = document.getElementById('btnWebJson');
  const btnWebCopyLinks = document.getElementById('btnWebCopyLinks');

  // Key Modal Elements
  const userMembershipStatus = document.getElementById('userMembershipStatus');
  const btnOpenKeyModal = document.getElementById('btnOpenKeyModal');
  const webKeyModal = document.getElementById('webKeyModal');
  const btnCloseKeyModal = document.getElementById('btnCloseKeyModal');
  const webKeyInput = document.getElementById('webKeyInput');
  const btnSubmitWebKey = document.getElementById('btnSubmitWebKey');
  const webKeyModalAlert = document.getElementById('webKeyModalAlert');

  // App State
  let savedLicenseKey = localStorage.getItem('fk_web_license_key') || '';
  let activeMatchedReviews = [];
  let currentProductTitle = '';

  // Initialize
  initKeyStatus();
  bindEvents();
  restoreSavedState();

  function initKeyStatus() {
    if (savedLicenseKey) {
      userMembershipStatus.innerHTML = `
        <span class="status-indicator"></span>
        <span class="status-label">VIP Pro: ${savedLicenseKey.substring(0, 10)}...</span>
      `;
      userMembershipStatus.className = 'membership-pill active';
      webKeyInput.value = savedLicenseKey;
    } else {
      userMembershipStatus.innerHTML = `
        <span class="status-indicator"></span>
        <span class="status-label">Free Preview</span>
      `;
      userMembershipStatus.className = 'membership-pill inactive';
    }
  }

  function bindEvents() {
    btnOpenKeyModal.addEventListener('click', () => {
      webKeyModal.classList.remove('hidden');
      webKeyInput.focus();
    });

    btnCloseKeyModal.addEventListener('click', () => {
      webKeyModal.classList.add('hidden');
      webKeyModalAlert.classList.add('hidden');
    });

    btnSubmitWebKey.addEventListener('click', handleSaveLicenseKey);

    webProductUrl.addEventListener('input', () => {
      onUrlChange();
      saveState();
    });
    webNamesInput.addEventListener('input', () => {
      updateNameCount();
      saveState();
    });
    webLocationInput.addEventListener('input', () => {
      updateLocCount();
      saveState();
    });

    sampleChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const n = chip.getAttribute('data-name');
        const l = chip.getAttribute('data-loc');
        if (n) webNamesInput.value = n;
        if (l) webLocationInput.value = l;
        updateNameCount();
        updateLocCount();
        saveState();
      });
    });

    webThresholdSlider.addEventListener('input', () => {
      const v = parseInt(webThresholdSlider.value, 10);
      let desc = 'Balanced';
      if (v <= 60) desc = 'Broad';
      else if (v >= 90) desc = 'Strict';
      webThresholdVal.textContent = `${v}% ${desc}`;
      saveState();
    });

    btnWebSearch.addEventListener('click', handleExecuteSearch);
    btnWebDelete.addEventListener('click', handleDeleteAll);

    btnWebCsv.addEventListener('click', exportToCsv);
    btnWebJson.addEventListener('click', exportToJson);
    btnWebCopyLinks.addEventListener('click', copyAllLinks);
  }

  function onUrlChange() {
    const raw = webProductUrl.value.trim();
    if (!raw) {
      webProductBanner.classList.add('hidden');
      return;
    }

    if (raw.includes('dl.flipkart.com/s/') || raw.includes('fkrt.it/') || raw.includes('fkrt.co/')) {
      webProductTitleText.textContent = 'Mobile Short Link detected. (If 0 reviews found, copy full link from browser address bar)';
      webProductBanner.classList.remove('hidden');
      return;
    }

    const slugMatch = raw.match(/flipkart\.com\/([^\/]+)/);
    if (slugMatch && slugMatch[1] && slugMatch[1] !== 's' && slugMatch[1] !== 'dl') {
      const title = slugMatch[1].replace(/-/g, ' ');
      currentProductTitle = title.charAt(0).toUpperCase() + title.slice(1);
      webProductTitleText.textContent = currentProductTitle;
      webProductBanner.classList.remove('hidden');
    } else {
      webProductBanner.classList.add('hidden');
    }
  }

  function getNames() {
    return webNamesInput.value.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);
  }

  function getLocations() {
    return webLocationInput.value.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);
  }

  function updateNameCount() {
    const count = getNames().length;
    webNameBadge.textContent = `${count} ${count === 1 ? 'name' : 'names'}`;
  }

  function updateLocCount() {
    const count = getLocations().length;
    webLocBadge.textContent = count > 0 ? `${count} ${count === 1 ? 'area' : 'areas'}` : 'Optional';
  }

  function showAlert(msg, type = 'error') {
    webAlert.textContent = msg;
    webAlert.className = `alert-box ${type}`;
    webAlert.classList.remove('hidden');
  }

  function hideAlert() {
    webAlert.classList.add('hidden');
  }

  async function handleSaveLicenseKey() {
    const key = webKeyInput.value.trim();
    if (!key) {
      webKeyModalAlert.textContent = 'Please enter a license key.';
      webKeyModalAlert.classList.remove('hidden');
      return;
    }

    try {
      const res = await fetch('/api/license/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      const data = await res.json();

      if (data.isValid) {
        savedLicenseKey = key;
        localStorage.setItem('fk_web_license_key', key);
        initKeyStatus();
        webKeyModal.classList.add('hidden');
        webKeyModalAlert.classList.add('hidden');
        showAlert(`🎉 Key Activated (${data.planType} - ${data.expiryDate})!`, 'info');
      } else {
        webKeyModalAlert.textContent = data.error || 'Invalid or revoked license key.';
        webKeyModalAlert.classList.remove('hidden');
      }
    } catch (err) {
      webKeyModalAlert.textContent = 'Error verifying key with server.';
      webKeyModalAlert.classList.remove('hidden');
    }
  }

  async function handleExecuteSearch() {
    hideAlert();

    if (!savedLicenseKey) {
      showAlert('⚠️ Membership Key is required. Please click "Enter Key" above or contact @mahabirgope7 on Telegram.');
      webKeyModal.classList.remove('hidden');
      return;
    }

    const rawUrl = webProductUrl.value.trim();
    if (!rawUrl) {
      showAlert('Please enter a Flipkart product link.');
      webProductUrl.focus();
      return;
    }

    const queryNames = getNames();
    const queryLocations = getLocations();

    if (queryNames.length === 0 && queryLocations.length === 0) {
      showAlert('Please enter at least one Reviewer Name or Area/Location to search.');
      webNamesInput.focus();
      return;
    }

    // UI Loading state
    btnWebSearch.disabled = true;
    btnWebSearch.innerHTML = '<span>⏳ Scanning Flipkart Reviews...</span>';
    webProgressBox.classList.remove('hidden');
    webProgressBarFill.style.width = '30%';
    webProgressText.textContent = 'Connecting to Flipkart and scanning review sections in cloud...';

    webEmptyState.classList.add('hidden');
    webReviewsList.innerHTML = '';
    activeMatchedReviews = [];

    try {
      const payload = {
        licenseKey: savedLicenseKey,
        productUrl: rawUrl,
        queryNames,
        queryLocations,
        exactOnly: false,
        threshold: parseInt(webThresholdSlider.value, 10) / 100,
        maxPagesPerSection: parseInt(webMaxPages.value, 10),
        searchScope: webScopeSelect.value
      };

      const response = await fetch('/api/search/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Search request failed.');
      }

      webProgressBarFill.style.width = '100%';
      webProgressText.textContent = `Completed! Scanned ${data.totalPagesScanned} pages (${data.totalReviewsScanned} reviews).`;

      activeMatchedReviews = data.matchedReviews || [];
      renderResults(queryNames, queryLocations, activeMatchedReviews);
      saveState();

      // Smooth scroll to results on mobile devices
      if (window.innerWidth <= 900 && activeMatchedReviews.length > 0) {
        setTimeout(() => {
          webResultsToolbar.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }

      if (activeMatchedReviews.length === 0) {
        showAlert(`Scanned ${data.totalReviewsScanned} reviews across ${data.totalPagesScanned} pages. No matching reviews found.`, 'info');
      }

    } catch (err) {
      console.error('Search error:', err);
      showAlert(`Search Error: ${err.message}`);
    } finally {
      btnWebSearch.disabled = false;
      btnWebSearch.innerHTML = '<span>🔍 Search Reviews</span>';
    }
  }

  function renderResults(queryNames, queryLocations, matchedList) {
    webReviewsList.innerHTML = '';
    webMatchCount.textContent = matchedList.length.toString();

    if (matchedList.length > 0) {
      webResultsToolbar.classList.remove('hidden');
      webAvailabilityCard.classList.remove('hidden');
    } else {
      webResultsToolbar.classList.add('hidden');
      webAvailabilityCard.classList.add('hidden');
    }

    // Availability matrix
    const allQueries = [
      ...queryNames.map(n => ({ key: n, type: 'name' })),
      ...queryLocations.map(l => ({ key: l, type: 'location' }))
    ];

    webAvailabilityList.innerHTML = '';
    let foundCount = 0;

    allQueries.forEach(q => {
      const matches = matchedList.filter(m => (m.searchedQuery || '').toLowerCase() === q.key.toLowerCase());
      const isFound = matches.length > 0;
      if (isFound) foundCount++;

      const div = document.createElement('div');
      div.className = 'avail-item';
      div.innerHTML = `
        <span>${q.type === 'location' ? '📍 ' : ''}<strong>${escapeHtml(q.key)}</strong></span>
        <span class="status-tag ${isFound ? 'found' : 'not-found'}">
          ${isFound ? `✓ ${matches.length} Found` : '✕ Not Found'}
        </span>
      `;
      webAvailabilityList.appendChild(div);
    });

    webTotalFoundPill.textContent = `${foundCount} of ${allQueries.length} Found`;

    // Render review cards
    matchedList.forEach(item => {
      const card = document.createElement('div');
      card.className = 'web-review-card';

      const simScore = Math.round((item.similarityScore || 1) * 100);
      const isExact = item.matchType === 'exact';

      card.innerHTML = `
        <div class="review-top-meta">
          <div>
            <div class="reviewer-title-row">
              <span class="reviewer-name">${escapeHtml(item.reviewerName || item.matchedName)}</span>
              ${item.location ? `<span class="loc-badge">📍 ${escapeHtml(item.location)}</span>` : ''}
              <span class="sim-pill ${isExact ? 'exact' : 'similar'}">${isExact ? 'Exact Match' : simScore + '% Similar'}</span>
              <span class="section-pill">${escapeHtml(item.foundInSection || 'Section')}</span>
            </div>
            <div class="matched-for-text">Matched for: <strong>"${escapeHtml(item.searchedQuery || '')}"</strong></div>
          </div>
          <span class="rating-box">${item.rating || '★'} ★</span>
        </div>

        ${item.title ? `<div class="review-headline">${escapeHtml(item.title)}</div>` : ''}
        ${item.body ? `<div class="review-text">${escapeHtml(item.body)}</div>` : ''}

        <div class="review-footer">
          <span>${item.isCertified ? '✓ Certified Buyer' : ''} ${item.dateLocation ? '• ' + escapeHtml(item.dateLocation) : ''}</span>
          <div class="footer-btn-group">
            <button class="btn-copy-card-link" data-url="${item.directUrl}" title="Copy review link to clipboard">
              📋 Copy Link
            </button>
            <a href="${item.directUrl}" target="_blank" class="btn-open-perm">Open on Flipkart ↗</a>
          </div>
        </div>
      `;

      webReviewsList.appendChild(card);
    });

    // Attach 1-click copy handlers for each card
    document.querySelectorAll('.btn-copy-card-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        navigator.clipboard.writeText(url).then(() => {
          const originalText = btn.innerHTML;
          btn.innerHTML = '✓ Copied!';
          btn.style.color = 'var(--accent-green)';
          btn.style.borderColor = 'var(--accent-green)';
          setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.color = '';
            btn.style.borderColor = '';
          }, 1800);
        }).catch(() => {
          showAlert('Failed to copy link.');
        });
      });
    });
  }

  function handleDeleteAll() {
    localStorage.removeItem('fk_web_search_state');
    webProductUrl.value = '';
    webNamesInput.value = '';
    webLocationInput.value = '';
    webProductBanner.classList.add('hidden');
    updateNameCount();
    updateLocCount();

    activeMatchedReviews = [];
    webReviewsList.innerHTML = '';
    webAvailabilityCard.classList.add('hidden');
    webResultsToolbar.classList.add('hidden');
    webProgressBox.classList.add('hidden');
    webEmptyState.classList.remove('hidden');
    hideAlert();
    showAlert('✅ All search data cleared successfully.', 'info');
  }

  function saveState() {
    const state = {
      productUrl: webProductUrl.value,
      names: webNamesInput.value,
      location: webLocationInput.value,
      threshold: webThresholdSlider.value,
      scope: webScopeSelect.value,
      matchedReviews: activeMatchedReviews
    };
    localStorage.setItem('fk_web_search_state', JSON.stringify(state));
  }

  function restoreSavedState() {
    const raw = localStorage.getItem('fk_web_search_state');
    if (!raw) return;
    try {
      const state = JSON.parse(raw);
      if (state.productUrl) webProductUrl.value = state.productUrl;
      if (state.names) webNamesInput.value = state.names;
      if (state.location) webLocationInput.value = state.location;
      if (state.threshold) {
        webThresholdSlider.value = state.threshold;
        webThresholdVal.textContent = `${state.threshold}%`;
      }
      if (state.scope) webScopeSelect.value = state.scope;

      updateNameCount();
      updateLocCount();
      onUrlChange();

      if (state.matchedReviews && state.matchedReviews.length > 0) {
        activeMatchedReviews = state.matchedReviews;
        webEmptyState.classList.add('hidden');
        renderResults(getNames(), getLocations(), activeMatchedReviews);
      }
    } catch (e) {}
  }

  function exportToCsv() {
    if (activeMatchedReviews.length === 0) return;
    const headers = ['Searched Query', 'Matched Reviewer', 'Location', 'Section', 'Rating', 'Title', 'Text', 'Certified Buyer', 'URL'];
    const rows = activeMatchedReviews.map(r => [
      `"${(r.searchedQuery || '').replace(/"/g, '""')}"`,
      `"${(r.reviewerName || r.matchedName || '').replace(/"/g, '""')}"`,
      `"${(r.location || '').replace(/"/g, '""')}"`,
      `"${r.foundInSection || ''}"`,
      `"${r.rating || ''}"`,
      `"${(r.title || '').replace(/"/g, '""')}"`,
      `"${(r.body || '').replace(/"/g, '""')}"`,
      r.isCertified ? 'Yes' : 'No',
      `"${r.directUrl || ''}"`
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    downloadFile(csv, `flipkart_reviews_${Date.now()}.csv`, 'text/csv');
  }

  function exportToJson() {
    if (activeMatchedReviews.length === 0) return;
    const json = JSON.stringify(activeMatchedReviews, null, 2);
    downloadFile(json, `flipkart_reviews_${Date.now()}.json`, 'application/json');
  }

  function copyAllLinks() {
    if (activeMatchedReviews.length === 0) return;
    const links = activeMatchedReviews.map(r => `${r.reviewerName || r.matchedName} (${r.location || 'N/A'}): ${r.directUrl}`).join('\n');
    navigator.clipboard.writeText(links).then(() => {
      showAlert('Copied all review links to clipboard!', 'info');
    });
  }

  function downloadFile(content, name, mime) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
