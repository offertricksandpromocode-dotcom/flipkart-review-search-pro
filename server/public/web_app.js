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
  let currentProductImage = '';
  let currentProductPrice = '';
  let keyStatusData = { isValid: false, daysRemaining: 0, isExpired: false, planType: '' };

  // Initialize
  initKeyStatus();
  bindEvents();
  restoreSavedState();

  async function initKeyStatus() {
    if (!savedLicenseKey) {
      userMembershipStatus.innerHTML = `
        <span class="status-indicator"></span>
        <span class="status-label">Free Preview</span>
      `;
      userMembershipStatus.className = 'membership-pill inactive';
      keyStatusData = { isValid: false, daysRemaining: 0, isExpired: false };
      return;
    }

    try {
      const res = await fetch('/api/license/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: savedLicenseKey })
      });
      const data = await res.json();
      keyStatusData = data;

      if (data.isValid) {
        if (data.planType === 'LIFETIME') {
          userMembershipStatus.innerHTML = `
            <span class="status-indicator"></span>
            <span class="status-label">👑 VIP Lifetime</span>
          `;
        } else {
          const days = data.daysRemaining !== undefined ? data.daysRemaining : 30;
          userMembershipStatus.innerHTML = `
            <span class="status-indicator"></span>
            <span class="status-label">👑 VIP Pro (${days} ${days === 1 ? 'Day' : 'Days'} Left)</span>
          `;
        }
        userMembershipStatus.className = 'membership-pill active';
        webKeyInput.value = savedLicenseKey;
      } else {
        // Expired or Revoked
        userMembershipStatus.innerHTML = `
          <span class="status-indicator" style="background: #dc2626;"></span>
          <span class="status-label">⚠️ Expired (0 Days Left)</span>
        `;
        userMembershipStatus.className = 'membership-pill inactive';
        userMembershipStatus.style.background = '#fee2e2';
        userMembershipStatus.style.color = '#dc2626';
        userMembershipStatus.style.borderColor = '#fca5a5';
      }
    } catch (err) {
      userMembershipStatus.innerHTML = `
        <span class="status-indicator"></span>
        <span class="status-label">VIP Pro: ${savedLicenseKey.substring(0, 10)}...</span>
      `;
      userMembershipStatus.className = 'membership-pill active';
    }
  }

  function bindEvents() {
    if (btnOpenKeyModal && webKeyModal) {
      btnOpenKeyModal.addEventListener('click', () => {
        webKeyModal.classList.remove('hidden');
        if (webKeyInput) webKeyInput.focus();
      });
    }

    if (btnCloseKeyModal && webKeyModal) {
      btnCloseKeyModal.addEventListener('click', () => {
        webKeyModal.classList.add('hidden');
        if (webKeyModalAlert) webKeyModalAlert.classList.add('hidden');
      });
    }

    if (btnSubmitWebKey) {
      btnSubmitWebKey.addEventListener('click', handleSaveLicenseKey);
    }

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
    webAlert.className = `alert-banner ${type}`;
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
        await initKeyStatus();
        webKeyModal.classList.add('hidden');
        webKeyModalAlert.classList.add('hidden');
        const daysText = data.planType === 'LIFETIME' ? 'Lifetime Access' : `${data.daysRemaining} Days Left`;
        showAlert(`🎉 Key Activated (${data.planType} • ${daysText})!`, 'info');
      } else {
        webKeyModalAlert.textContent = data.error || 'Invalid or expired license key.';
        webKeyModalAlert.classList.remove('hidden');
      }
    } catch (err) {
      webKeyModalAlert.textContent = 'Error verifying key with server.';
      webKeyModalAlert.classList.remove('hidden');
    }
  }

  async function handleExecuteSearch() {
    hideAlert();

    const rawUrl = webProductUrl.value.trim();
    if (!rawUrl) {
      showAlert('Please enter a Flipkart product link.');
      webProductUrl.focus();
      return;
    }

    const queryNames = getNames();
    const queryLocations = getLocations();

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

      const rawText = await response.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseErr) {
        throw new Error('Server request took too long or returned an error. Please try scanning with Scan Depth: 10 or 5 pages/section.');
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Search request failed.');
      }

      if (data.productTitle) {
        currentProductTitle = data.productTitle;
        webProductTitleText.textContent = data.productTitle;
        webProductBanner.classList.remove('hidden');
      }
      if (data.productImageUrl) {
        currentProductImage = data.productImageUrl;
      }
      if (data.productPrice) {
        currentProductPrice = data.productPrice;
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
            <button class="btn-card-screenshot" title="Download HD Screenshot of this Review">
              📸 Download SS
            </button>
            <button class="btn-copy-card-link" data-url="${item.directUrl}" title="Copy review link to clipboard">
              📋 Copy Link
            </button>
            <a href="${item.directUrl}" target="_blank" class="btn-open-perm">Open on Flipkart ↗</a>
          </div>
        </div>
      `;

      webReviewsList.appendChild(card);
    });

    // Attach 1-click Screenshot handlers for each card (Pixel-Perfect HD Desktop SS)
    document.querySelectorAll('.btn-card-screenshot').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.web-review-card');
        if (!card) return;

        const originalText = btn.innerHTML;
        btn.innerHTML = '⏳ Generating HD SS...';
        btn.disabled = true;

        const reviewerName = card.querySelector('.reviewer-name')?.textContent.trim() || 'Flipkart Customer';
        const ratingText = card.querySelector('.rating-box')?.textContent.trim().replace('★', '').trim() || '5';
        const titleText = card.querySelector('.review-headline')?.textContent.trim() || 'Review';
        const bodyText = card.querySelector('.review-text')?.textContent.trim() || '';
        const locText = card.querySelector('.loc-badge')?.textContent.replace('📍', '').trim() || '';
        const footerSpan = card.querySelector('.review-footer > span')?.textContent.trim() || '';
        const directUrl = card.querySelector('.btn-copy-card-link')?.getAttribute('data-url') || '';
        const safeName = reviewerName.replace(/[^a-zA-Z0-9_-]/g, '_');

        try {
          if (typeof html2canvas === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
          }

          const numRating = parseFloat(ratingText) || 5;
          const ratingBg = numRating <= 2 ? '#ff6161' : numRating === 3 ? '#ff9f00' : '#388e3c';
          const prodTitle = currentProductTitle || 'Flipkart Product Review';

          // Preload product image via local image proxy if available
          let proxiedImgUrl = '';
          if (currentProductImage) {
            proxiedImgUrl = `/api/proxy-image?url=${encodeURIComponent(currentProductImage)}`;
            try {
              const testImg = new Image();
              testImg.crossOrigin = 'anonymous';
              await new Promise((resolve) => {
                testImg.onload = resolve;
                testImg.onerror = resolve;
                testImg.src = proxiedImgUrl;
                setTimeout(resolve, 3000); // 3s timeout
              });
            } catch (e) {}
          }

          const cleanDate = footerSpan.replace('✓ Certified Buyer', '').replace(/^•\s*/, '').trim() || (locText ? locText : 'Verified Purchase');

          // Create authentic Desktop Flipkart webpage mock container (1120px width)
          const mockContainer = document.createElement('div');
          mockContainer.style.position = 'fixed';
          mockContainer.style.left = '-9999px';
          mockContainer.style.top = '0';
          mockContainer.style.width = '1120px';
          mockContainer.style.backgroundColor = '#ffffff';
          mockContainer.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
          mockContainer.style.boxSizing = 'border-box';
          mockContainer.style.color = '#212121';

          mockContainer.innerHTML = `
            <!-- Flipkart Main Desktop Navbar -->
            <div style="background: #2874f0; padding: 10px 48px; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;">
              <div style="display: flex; align-items: center; gap: 28px; flex: 1;">
                <div style="display: flex; flex-direction: column;">
                  <span style="font-size: 20px; font-weight: 800; font-style: italic; color: #ffffff; letter-spacing: -0.5px; line-height: 1;">Flipkart</span>
                  <span style="font-size: 11px; font-style: italic; color: #ffe500; font-weight: 600; margin-top: 2px;">Explore <span style="color: #fff;">Plus</span> ✦</span>
                </div>
                <div style="flex: 0 1 520px; position: relative;">
                  <input type="text" value="Search for products, brands and more" readonly style="width: 100%; height: 36px; padding: 0 16px; border: none; border-radius: 2px; font-size: 14px; color: #878787; outline: none; box-shadow: 0 1px 2px 0 rgba(0,0,0,.2); box-sizing: border-box;" />
                  <span style="position: absolute; right: 12px; top: 8px; color: #2874f0; font-size: 15px; font-weight: bold;">🔍</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 28px; color: #ffffff; font-size: 15px; font-weight: 600;">
                <div style="background: #ffffff; color: #2874f0; padding: 6px 36px; font-weight: 700; border-radius: 2px; font-size: 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">Login</div>
                <span>Become a Seller</span>
                <span>More ▾</span>
                <span style="display: flex; align-items: center; gap: 6px;">🛒 Cart</span>
              </div>
            </div>

            <!-- Sub Navigation Categories -->
            <div style="background: #ffffff; border-bottom: 1px solid #f0f0f0; padding: 12px 48px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; color: #212121; box-shadow: 0 1px 1px 0 rgba(0,0,0,.06); box-sizing: border-box;">
              <span>Electronics ▾</span><span>TVs & Appliances ▾</span><span>Men ▾</span><span>Women ▾</span><span>Baby & Kids ▾</span><span>Home & Furniture ▾</span><span>Sports, Books & More ▾</span><span>Flights</span><span>Offer Zone</span>
            </div>

            <!-- Main Review Container Box -->
            <div style="background: #ffffff; padding: 32px 48px 40px; display: flex; gap: 40px; min-height: 380px; box-sizing: border-box;">
              <!-- Left Product Column -->
              <div style="width: 250px; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-start;">
                ${proxiedImgUrl ? `
                  <div style="width: 200px; height: 210px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; background: #ffffff;">
                    <img src="${proxiedImgUrl}" crossorigin="anonymous" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" />
                  </div>
                ` : `
                  <div style="width: 180px; height: 190px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 48px; margin-bottom: 12px;">
                    🛍️
                  </div>
                `}
                <div style="color: #ff6161; font-size: 13px; font-weight: 600; margin-bottom: 6px;">
                  Currently unavailable
                </div>
                <div style="font-size: 13px; font-weight: 600; line-height: 1.4; color: #212121; margin-bottom: 8px; word-break: break-word;">
                  ${escapeHtml(prodTitle)}
                </div>
                <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 6px;">
                  <span style="color: #2874f0; font-weight: 800; font-style: italic; font-size: 13px;">🛡️ Assured</span>
                </div>
              </div>

              <!-- Right Review Column -->
              <div style="flex: 1; border-left: 1px solid #f0f0f0; padding-left: 40px; display: flex; flex-direction: column; box-sizing: border-box;">
                <div style="font-size: 19px; font-weight: 700; color: #212121; margin-bottom: 22px;">
                  Customer Review
                </div>
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                  <span style="background: ${ratingBg}; color: #ffffff; font-size: 12px; font-weight: 700; padding: 2px 7px; border-radius: 3px; display: inline-flex; align-items: center; gap: 2px;">
                    ${escapeHtml(ratingText)} ★
                  </span>
                  <span style="font-size: 15px; font-weight: 700; color: #212121;">${escapeHtml(titleText)}</span>
                </div>
                <div style="font-size: 14px; line-height: 1.5; color: #212121; margin-bottom: 22px; white-space: pre-wrap; word-break: break-word;">
                  ${escapeHtml(bodyText || titleText)}
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #878787; margin-bottom: 32px;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-weight: 600; color: #878787;">${escapeHtml(reviewerName)}</span>
                    <span style="display: inline-flex; align-items: center; gap: 4px; color: #878787;">
                      <span style="width: 14px; height: 14px; background: #878787; color: #fff; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 9px;">✓</span>
                      Certified Buyer
                    </span>
                    <span>${escapeHtml(cleanDate)}</span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 16px; font-size: 13px; color: #878787;">
                    <span>👍 0</span><span>👎 0</span>
                  </div>
                </div>
                <div style="margin-top: auto; padding-top: 16px; border-top: 1px solid #f0f0f0;">
                  <span style="color: #2874f0; font-size: 14px; font-weight: 600;">
                    View all reviews of the product
                  </span>
                </div>
              </div>
            </div>
          `;

          document.body.appendChild(mockContainer);
          const canvas = await html2canvas(mockContainer, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff'
          });
          document.body.removeChild(mockContainer);

          const link = document.createElement('a');
          link.download = `Flipkart_Review_${safeName}_Desktop.jpg`;
          link.href = canvas.toDataURL('image/jpeg', 0.95);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          btn.innerHTML = '✓ Downloaded!';
          btn.style.color = '#10b981';
          btn.style.borderColor = '#10b981';
        } catch (canvasErr) {
          console.error('Canvas error:', canvasErr);
          showAlert('Error generating screenshot: ' + canvasErr.message);
          btn.innerHTML = originalText;
        }

        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.color = '';
          btn.style.borderColor = '';
          btn.disabled = false;
        }, 2200);
      });
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

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
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
      productTitle: currentProductTitle,
      productImageUrl: currentProductImage,
      productPrice: currentProductPrice,
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
      if (state.productTitle) {
        currentProductTitle = state.productTitle;
        webProductTitleText.textContent = state.productTitle;
        webProductBanner.classList.remove('hidden');
      }
      if (state.productImageUrl) currentProductImage = state.productImageUrl;
      if (state.productPrice) currentProductPrice = state.productPrice;
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
