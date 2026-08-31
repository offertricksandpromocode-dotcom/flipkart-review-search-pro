/**
 * UI controller and search coordinator for Flipkart Review Search Chrome Extension
 * Features persistent state storage, membership verification, and Admin integration
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const productUrlInput = document.getElementById('productUrl');
  const btnDetectTab = document.getElementById('btnDetectTab');
  const productInfoBanner = document.getElementById('productInfoBanner');
  const productTitleText = document.getElementById('productTitleText');

  const reviewerNamesInput = document.getElementById('reviewerNames');
  const nameCountBadge = document.getElementById('nameCountBadge');
  const locationInput = document.getElementById('locationInput');
  const locationCountBadge = document.getElementById('locationCountBadge');
  const sampleChips = document.querySelectorAll('.btn-chip');

  const searchScopeSelect = document.getElementById('searchScopeSelect');
  const maxPagesSelect = document.getElementById('maxPagesSelect');
  const pagesValueDisplay = document.getElementById('pagesValueDisplay');
  const matchModeRadios = document.querySelectorAll('input[name="matchMode"]');
  const similaritySliderContainer = document.getElementById('similaritySliderContainer');
  const thresholdSlider = document.getElementById('thresholdSlider');
  const thresholdValue = document.getElementById('thresholdValue');

  const btnSearch = document.getElementById('btnSearch');
  const btnCancel = document.getElementById('btnCancel');
  const progressContainer = document.getElementById('progressContainer');
  const progressStatusText = document.getElementById('progressStatusText');
  const progressStat = document.getElementById('progressStat');
  const progressBarFill = document.getElementById('progressBarFill');

  const alertMessage = document.getElementById('alertMessage');
  const resultsSection = document.getElementById('resultsSection');
  const emptyState = document.getElementById('emptyState');
  const availabilityList = document.getElementById('availabilityList');
  const overallFoundBadge = document.getElementById('overallFoundBadge');
  const matchCountHeader = document.getElementById('matchCountHeader');
  const reviewsList = document.getElementById('reviewsList');

  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnCopyLinks = document.getElementById('btnCopyLinks');
  const btnClearAll = document.getElementById('btnClearAll');
  const btnDeleteResults = document.getElementById('btnDeleteResults');
  const btnOpenAdmin = document.getElementById('btnOpenAdmin');

  // Membership & Redeem Modal Elements
  const headerMembershipBadge = document.getElementById('headerMembershipBadge');
  const headerExpiryBadge = document.getElementById('headerExpiryBadge');
  const membershipNoticeBar = document.getElementById('membershipNoticeBar');
  const btnOpenRedeemModal = document.getElementById('btnOpenRedeemModal');
  const redeemModal = document.getElementById('redeemModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const redeemKeyInput = document.getElementById('redeemKeyInput');
  const btnSubmitRedeem = document.getElementById('btnSubmitRedeem');
  const redeemAlert = document.getElementById('redeemAlert');

  // Search State
  let isSearching = false;
  let isCancelled = false;
  let matchedReviews = [];
  let nameAvailabilityMap = {};
  let currentProductTitle = '';
  let currentMembership = null;

  // Initialize
  bindEvents();
  await updateMembershipUI();
  restoreSavedState();

  /**
   * Bind event listeners
   */
  function bindEvents() {
    btnDetectTab.addEventListener('click', detectActiveTabUrl);
    productUrlInput.addEventListener('input', () => {
      onUrlInputChange();
      saveFullState();
    });
    reviewerNamesInput.addEventListener('input', () => {
      updateNameCountBadge();
      saveFullState();
    });
    locationInput.addEventListener('input', () => {
      updateLocationCountBadge();
      saveFullState();
    });

    sampleChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const nameVal = chip.getAttribute('data-name');
        const locVal = chip.getAttribute('data-location');

        if (nameVal) {
          reviewerNamesInput.value = nameVal;
          updateNameCountBadge();
        }
        if (locVal) {
          locationInput.value = locVal;
          updateLocationCountBadge();
        }
        saveFullState();
      });
    });

    searchScopeSelect.addEventListener('change', saveFullState);

    matchModeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        const isFuzzy = getSelectedMatchMode() === 'fuzzy';
        similaritySliderContainer.classList.toggle('hidden', !isFuzzy);
        saveFullState();
      });
    });

    thresholdSlider.addEventListener('input', () => {
      thresholdValue.textContent = `${thresholdSlider.value}%`;
      saveFullState();
    });

    maxPagesSelect.addEventListener('change', () => {
      const val = maxPagesSelect.value;
      pagesValueDisplay.textContent = val === '250' ? 'All pages' : `${val} pages`;
      saveFullState();
    });

    btnSearch.addEventListener('click', handleStartSearch);
    btnCancel.addEventListener('click', handleCancelSearch);

    btnExportCsv.addEventListener('click', exportToCsv);
    btnExportJson.addEventListener('click', exportToJson);
    btnCopyLinks.addEventListener('click', copyAllLinksToClipboard);

    btnClearAll.addEventListener('click', handleDeleteAllData);
    if (btnDeleteResults) {
      btnDeleteResults.addEventListener('click', handleDeleteAllData);
    }

    btnOpenAdmin.addEventListener('click', openAdminPanel);

    // Membership modal
    if (btnOpenRedeemModal) {
      btnOpenRedeemModal.addEventListener('click', () => {
        redeemModal.classList.remove('hidden');
        redeemKeyInput.focus();
      });
    }

    btnCloseModal.addEventListener('click', () => {
      redeemModal.classList.add('hidden');
      redeemAlert.classList.add('hidden');
    });

    btnSubmitRedeem.addEventListener('click', handleRedeemKey);
  }

  /**
   * Update Membership Status in UI
   */
  async function updateMembershipUI() {
    currentMembership = await LicenseEngine.checkMembership();

    if (currentMembership.isActive) {
      headerMembershipBadge.textContent = currentMembership.isLifetime ? '👑 Lifetime VIP' : `👑 Pro Member`;
      headerMembershipBadge.className = 'membership-badge active';
      headerExpiryBadge.textContent = currentMembership.isLifetime ? 'Lifetime' : `${currentMembership.daysRemaining}d left`;
      membershipNoticeBar.classList.add('hidden');
    } else {
      headerMembershipBadge.textContent = '⚠️ Inactive';
      headerMembershipBadge.className = 'membership-badge expired';
      headerExpiryBadge.textContent = 'Expired';
      membershipNoticeBar.classList.remove('hidden');
    }
  }

  /**
   * Handle Key Redemption with Backend & Offline Fallback
   */
  async function handleRedeemKey() {
    const key = redeemKeyInput.value.trim();
    if (!key) {
      redeemAlert.textContent = 'Please enter a license key.';
      redeemAlert.classList.remove('hidden');
      return;
    }

    btnSubmitRedeem.disabled = true;
    btnSubmitRedeem.textContent = 'Activating...';

    try {
      const result = await LicenseEngine.activateOnlineKey(key, 'User');
      if (result.success) {
        const modeLabel = result.isOnline ? 'Online Server' : 'Offline Signature';
        redeemAlert.textContent = `✅ Activated (${result.planType} - ${result.days === 36500 ? 'Lifetime' : result.days + ' Days'}) via ${modeLabel}!`;
        redeemAlert.style.color = 'var(--accent-green)';
        redeemAlert.classList.remove('hidden');

        setTimeout(async () => {
          redeemModal.classList.add('hidden');
          redeemKeyInput.value = '';
          redeemAlert.classList.add('hidden');
          await updateMembershipUI();
          showAlert('🎉 Membership activated successfully!', 'info', 3000);
        }, 1200);
      } else {
        redeemAlert.textContent = result.error || 'Invalid or revoked license key.';
        redeemAlert.style.color = 'var(--accent-red)';
        redeemAlert.classList.remove('hidden');
      }
    } catch (err) {
      redeemAlert.textContent = 'Activation error: ' + err.message;
      redeemAlert.style.color = 'var(--accent-red)';
      redeemAlert.classList.remove('hidden');
    } finally {
      btnSubmitRedeem.disabled = false;
      btnSubmitRedeem.textContent = 'Activate License';
    }
  }

  /**
   * Open Admin Panel in a new browser tab
   */
  function openAdminPanel() {
    const adminUrl = chrome.runtime.getURL('admin/admin.html');
    chrome.tabs.create({ url: adminUrl });
  }

  /**
   * Detect URL from active browser tab when button clicked
   */
  function detectActiveTabUrl() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url) {
          const currentUrl = tabs[0].url;
          if (currentUrl.includes('flipkart.com')) {
            productUrlInput.value = currentUrl;
            onUrlInputChange();
            saveFullState();
            showAlert('Detected active Flipkart tab!', 'info', 2500);
          } else {
            showAlert('Active tab is not a Flipkart page. You can paste any Flipkart product link manually.', 'error', 3500);
          }
        }
      });
    }
  }

  /**
   * Handle URL input change to display detected product title
   */
  function onUrlInputChange() {
    const rawUrl = productUrlInput.value.trim();
    if (!rawUrl) {
      productInfoBanner.classList.add('hidden');
      return;
    }

    const norm = FlipkartScraper.normalizeReviewUrl(rawUrl);
    if (norm.isValid) {
      currentProductTitle = norm.productTitle;
      productTitleText.textContent = norm.productTitle;
      productInfoBanner.classList.remove('hidden');
      hideAlert();
    } else {
      productInfoBanner.classList.add('hidden');
    }
  }

  function getParsedNames() {
    const text = reviewerNamesInput.value;
    if (!text) return [];
    return text
      .split(/[\n,]+/)
      .map(n => n.trim())
      .filter(n => n.length > 0);
  }

  function getParsedLocations() {
    const text = locationInput.value;
    if (!text) return [];
    return text
      .split(/[\n,]+/)
      .map(n => n.trim())
      .filter(n => n.length > 0);
  }

  function updateNameCountBadge() {
    const names = getParsedNames();
    nameCountBadge.textContent = `${names.length} ${names.length === 1 ? 'name' : 'names'}`;
  }

  function updateLocationCountBadge() {
    const locs = getParsedLocations();
    locationCountBadge.textContent = locs.length > 0 ? `${locs.length} ${locs.length === 1 ? 'area' : 'areas'}` : 'Optional';
  }

  function getSelectedMatchMode() {
    const selected = document.querySelector('input[name="matchMode"]:checked');
    return selected ? selected.value : 'fuzzy';
  }

  function showAlert(msg, type = 'error', autoHideMs = 0) {
    alertMessage.textContent = msg;
    alertMessage.className = `alert-box ${type}`;
    alertMessage.classList.remove('hidden');

    if (autoHideMs > 0) {
      setTimeout(() => {
        hideAlert();
      }, autoHideMs);
    }
  }

  function hideAlert() {
    alertMessage.classList.add('hidden');
  }

  /**
   * Execute Review Search across sections and locations
   */
  async function handleStartSearch() {
    hideAlert();

    // Check membership
    await updateMembershipUI();
    if (!currentMembership || !currentMembership.isActive) {
      showAlert('⚠️ Membership expired or inactive. Click "Activate Key" or open Admin to renew.', 'error');
      redeemModal.classList.remove('hidden');
      return;
    }

    const rawUrl = productUrlInput.value.trim();
    if (!rawUrl) {
      showAlert('Please enter or paste a Flipkart product URL.');
      productUrlInput.focus();
      return;
    }

    const norm = FlipkartScraper.normalizeReviewUrl(rawUrl);
    if (!norm.isValid) {
      showAlert(norm.error || 'Invalid Flipkart URL provided.');
      return;
    }

    const queryNames = getParsedNames();
    const queryLocations = getParsedLocations();

    if (queryNames.length === 0 && queryLocations.length === 0) {
      showAlert('Please enter at least one Reviewer Name or Area/Location to search.');
      reviewerNamesInput.focus();
      return;
    }

    const matchMode = getSelectedMatchMode();
    const exactOnly = matchMode === 'exact';
    const threshold = parseInt(thresholdSlider.value, 10) / 100;
    const maxPagesPerSection = parseInt(maxPagesSelect.value, 10);
    const searchScope = searchScopeSelect.value;

    // Prepare search UI
    isSearching = true;
    isCancelled = false;
    matchedReviews = [];
    nameAvailabilityMap = {};

    const allQueries = [
      ...queryNames.map(n => ({ key: n, type: 'name' })),
      ...queryLocations.map(l => ({ key: l, type: 'location' }))
    ];

    allQueries.forEach(q => {
      nameAvailabilityMap[q.key] = {
        name: q.key,
        type: q.type,
        isAvailable: false,
        matchCount: 0,
        matches: []
      };
    });

    btnSearch.classList.add('hidden');
    btnCancel.classList.remove('hidden');
    progressContainer.classList.remove('hidden');
    progressBarFill.style.width = '5%';
    progressStatusText.textContent = `Starting multi-section scan...`;
    progressStat.textContent = `0 reviews scanned`;

    emptyState.classList.add('hidden');
    resultsSection.classList.remove('hidden');

    reviewsList.innerHTML = '';
    renderAvailabilitySummary();
    updateHeaderStats();

    try {
      const results = await FlipkartScraper.searchReviews({
        reviewUrl: norm.reviewUrl,
        queryNames,
        queryLocations,
        exactOnly,
        threshold,
        maxPagesPerSection,
        searchScope,
        delayMs: 250,
        isCancelled: () => isCancelled,
        onMatchFound: (matchItem) => {
          renderSingleReviewCard(matchItem);
          renderAvailabilitySummary();
          updateHeaderStats();
          saveFullState();
        },
        onPageScanned: ({ currentPage, sectionIndex, totalSections, sectionName, totalPagesScanned, totalReviewsScanned, matchesFoundSoFar, hasNextPage }) => {
          const totalEstimatedPages = totalSections * maxPagesPerSection;
          const progressPercent = Math.min(100, Math.round((totalPagesScanned / totalEstimatedPages) * 100));
          progressBarFill.style.width = `${progressPercent}%`;
          progressStatusText.textContent = `[Section ${sectionIndex}/${totalSections}] ${sectionName}: Page ${currentPage}...`;
          progressStat.textContent = `${totalReviewsScanned} reviews scanned • ${matchesFoundSoFar} matched`;
        }
      });

      // Search completed
      progressBarFill.style.width = '100%';
      if (isCancelled) {
        progressStatusText.textContent = `Search stopped by user.`;
      } else {
        progressStatusText.textContent = `Scan complete across all sections! Scanned ${results.totalPagesScanned} total pages.`;
      }
      progressStat.textContent = `${results.totalReviewsScanned} unique reviews • ${results.matchedReviews.length} matched`;

      renderAvailabilitySummary();
      updateHeaderStats();
      saveFullState();

      if (results.matchedReviews.length === 0) {
        const queryDisplay = [...queryNames, ...queryLocations].join(', ');
        showAlert(`Finished scanning ${results.totalPagesScanned} pages (${results.totalReviewsScanned} reviews). No reviews matched "${queryDisplay}". Try checking name/area spelling or lowering sensitivity.`, 'info');
      }

    } catch (err) {
      console.error('Search failed:', err);
      showAlert(`Search Error: ${err.message || 'Failed to fetch reviews from Flipkart.'}`, 'error');
    } finally {
      isSearching = false;
      btnSearch.classList.remove('hidden');
      btnCancel.classList.add('hidden');
    }
  }

  function handleCancelSearch() {
    isCancelled = true;
    progressStatusText.textContent = 'Stopping scan...';
  }

  /**
   * Complete Delete of All Data from Memory & Storage
   */
  function handleDeleteAllData() {
    isCancelled = true;
    isSearching = false;
    matchedReviews = [];
    nameAvailabilityMap = {};
    currentProductTitle = '';

    productUrlInput.value = '';
    reviewerNamesInput.value = '';
    locationInput.value = '';
    
    productInfoBanner.classList.add('hidden');
    updateNameCountBadge();
    updateLocationCountBadge();
    reviewsList.innerHTML = '';
    availabilityList.innerHTML = '';
    resultsSection.classList.add('hidden');
    emptyState.classList.remove('hidden');
    progressContainer.classList.add('hidden');
    btnSearch.classList.remove('hidden');
    btnCancel.classList.add('hidden');

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(['savedSearchState'], () => {
        showAlert('✅ Search data deleted successfully!', 'info', 2500);
      });
    } else {
      showAlert('✅ Search data deleted successfully!', 'info', 2500);
    }
  }

  /**
   * Render Availability Summary Badges
   */
  function renderAvailabilitySummary() {
    availabilityList.innerHTML = '';
    let totalFoundCount = 0;

    const names = Object.keys(nameAvailabilityMap);
    names.forEach(name => {
      const item = nameAvailabilityMap[name];
      const row = document.createElement('div');
      row.className = 'availability-item';

      const isFound = item.isAvailable;
      if (isFound) totalFoundCount++;

      const countText = item.matchCount === 1 ? '1 Review Found' : `${item.matchCount} Reviews Found`;
      const typeIcon = item.type === 'location' ? '📍 ' : '';

      row.innerHTML = `
        <span class="availability-name">${typeIcon}${escapeHtml(name)}</span>
        <span class="status-pill ${isFound ? 'found' : 'not-found'}">
          ${isFound ? '✓ ' + countText : '✕ Not Available'}
        </span>
      `;
      availabilityList.appendChild(row);
    });

    overallFoundBadge.textContent = `${totalFoundCount} of ${names.length} Available`;
    overallFoundBadge.style.backgroundColor = totalFoundCount > 0 ? 'var(--accent-green-bg)' : '#f1f3f5';
    overallFoundBadge.style.color = totalFoundCount > 0 ? 'var(--accent-green)' : '#868e96';
  }

  /**
   * Render a single matching review card
   */
  function renderSingleReviewCard(item) {
    const existing = reviewsList.querySelector(`[data-id="${item.id}"]`);
    if (existing) return;

    const card = document.createElement('div');
    card.className = 'review-card';
    card.setAttribute('data-id', item.id);

    const similarityPercent = Math.round((item.similarityScore || 1) * 100);
    const matchClass = item.matchType === 'exact' ? 'exact' : 'similar';
    const matchLabel = item.matchType === 'exact' ? 'Exact Match' : `${similarityPercent}% Similar`;

    const ratingDisplay = item.rating !== 'N/A' 
      ? `<span class="rating-badge">${item.rating} ★</span>` 
      : '';

    const certifiedBadge = item.isCertified 
      ? `<span class="certified-buyer">✓ Certified Buyer</span>` 
      : '';

    const sectionBadge = item.foundInSection 
      ? `<span class="section-tag">${escapeHtml(item.foundInSection)}</span>` 
      : '';

    const locationBadge = item.location 
      ? `<span class="location-tag">📍 ${escapeHtml(item.location)}</span>` 
      : '';

    card.innerHTML = `
      <div class="review-card-header">
        <div class="reviewer-meta">
          <div class="reviewer-matched-name">
            ${escapeHtml(item.matchedName)}
            ${locationBadge}
            <span class="similarity-pill ${matchClass}">${matchLabel}</span>
            ${sectionBadge}
          </div>
          <div class="search-query-tag">Matched: "<strong>${escapeHtml(item.searchedQuery || item.searchedName)}</strong>"</div>
        </div>
        <div class="rating-and-badge">
          ${ratingDisplay}
        </div>
      </div>

      ${item.title ? `<div class="review-headline">${escapeHtml(item.title)}</div>` : ''}
      ${item.body ? `<div class="review-body-snippet">${escapeHtml(item.body)}</div>` : ''}

      <div class="review-card-footer">
        <div class="footer-left">
          ${certifiedBadge}
          ${item.dateLocation ? `<span class="date-loc">• ${escapeHtml(item.dateLocation)}</span>` : ''}
        </div>
        <a href="${item.directUrl}" target="_blank" class="btn-open-review" title="Open review page in new tab">
          Open Review ↗
        </a>
      </div>
    `;

    reviewsList.appendChild(card);
  }

  function updateHeaderStats() {
    matchCountHeader.textContent = matchedReviews.length.toString();
  }

  function exportToCsv() {
    if (matchedReviews.length === 0) {
      showAlert('No matching reviews to export.', 'info', 2000);
      return;
    }

    const headers = ['Searched Query', 'Matched Reviewer', 'Location', 'Section', 'Similarity %', 'Rating', 'Review Title', 'Review Text', 'Certified Buyer', 'Date / Location', 'Review URL'];
    const rows = matchedReviews.map(r => [
      `"${(r.searchedQuery || r.searchedName || '').replace(/"/g, '""')}"`,
      `"${(r.matchedName || '').replace(/"/g, '""')}"`,
      `"${(r.location || '').replace(/"/g, '""')}"`,
      `"${r.foundInSection || ''}"`,
      Math.round((r.similarityScore || 1) * 100) + '%',
      `"${r.rating || ''}"`,
      `"${(r.title || '').replace(/"/g, '""')}"`,
      `"${(r.body || '').replace(/"/g, '""')}"`,
      r.isCertified ? 'Yes' : 'No',
      `"${(r.dateLocation || '').replace(/"/g, '""')}"`,
      `"${r.directUrl}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
    downloadFile(csvContent, `flipkart_reviews_${Date.now()}.csv`, 'text/csv');
  }

  function exportToJson() {
    if (matchedReviews.length === 0) {
      showAlert('No matching reviews to export.', 'info', 2000);
      return;
    }

    const data = {
      productTitle: currentProductTitle,
      exportDate: new Date().toISOString(),
      nameAvailability: nameAvailabilityMap,
      matchedReviews: matchedReviews
    };

    const jsonContent = JSON.stringify(data, null, 2);
    downloadFile(jsonContent, `flipkart_reviews_${Date.now()}.json`, 'application/json');
  }

  function copyAllLinksToClipboard() {
    if (matchedReviews.length === 0) {
      showAlert('No matching reviews available.', 'info', 2000);
      return;
    }

    const links = matchedReviews.map(r => `${r.matchedName} (${r.location || 'N/A'}) [${r.foundInSection}]: ${r.directUrl}`).join('\n');
    navigator.clipboard.writeText(links).then(() => {
      showAlert('Copied all review links to clipboard!', 'info', 2000);
    }).catch(err => {
      showAlert('Failed to copy links to clipboard.', 'error', 2000);
    });
  }

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Save full search state & matched results persistently
   */
  function saveFullState() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const fullState = {
        productUrl: productUrlInput.value,
        productTitle: currentProductTitle,
        reviewerNames: reviewerNamesInput.value,
        location: locationInput.value,
        searchScope: searchScopeSelect.value,
        matchMode: getSelectedMatchMode(),
        threshold: thresholdSlider.value,
        maxPages: maxPagesSelect.value,
        matchedReviews: matchedReviews,
        nameAvailabilityMap: nameAvailabilityMap,
        savedAt: Date.now()
      };
      chrome.storage.local.set({ savedSearchState: fullState });
    }
  }

  /**
   * Restore full saved state and matched review cards from local storage
   */
  function restoreSavedState() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['savedSearchState'], (res) => {
        if (res && res.savedSearchState) {
          const state = res.savedSearchState;
          if (state.productUrl) productUrlInput.value = state.productUrl;
          if (state.reviewerNames) reviewerNamesInput.value = state.reviewerNames;
          if (state.location) locationInput.value = state.location;
          if (state.searchScope) searchScopeSelect.value = state.searchScope;

          if (state.matchMode) {
            const radio = document.querySelector(`input[name="matchMode"][value="${state.matchMode}"]`);
            if (radio) radio.checked = true;
            similaritySliderContainer.classList.toggle('hidden', state.matchMode === 'exact');
          }
          if (state.threshold) {
            thresholdSlider.value = state.threshold;
            thresholdValue.textContent = `${state.threshold}%`;
          }
          if (state.maxPages) {
            maxPagesSelect.value = state.maxPages;
            pagesValueDisplay.textContent = state.maxPages === '250' ? 'All pages' : `${state.maxPages} pages`;
          }

          if (state.productTitle) {
            currentProductTitle = state.productTitle;
            productTitleText.textContent = state.productTitle;
            productInfoBanner.classList.remove('hidden');
          }

          updateNameCountBadge();
          updateLocationCountBadge();
          onUrlInputChange();

          if (state.matchedReviews && state.matchedReviews.length > 0) {
            matchedReviews = state.matchedReviews;
            nameAvailabilityMap = state.nameAvailabilityMap || {};

            emptyState.classList.add('hidden');
            resultsSection.classList.remove('hidden');

            reviewsList.innerHTML = '';
            matchedReviews.forEach(item => renderSingleReviewCard(item));
            renderAvailabilitySummary();
            updateHeaderStats();
          }
        }
      });
    }
  }
});
