/**
 * Content script for Flipkart Review Search Extension.
 * Interacts with the active Flipkart tab to provide product info and highlight reviews.
 */

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageInfo') {
    const pageUrl = window.location.href;
    const titleEl = document.querySelector('span.B_NuCI, h1._6EBuv-, span[class*="B_NuCI"], h1');
    const productTitle = titleEl ? titleEl.textContent.trim() : document.title;
    
    sendResponse({
      url: pageUrl,
      title: productTitle
    });
    return true;
  }

  if (request.action === 'highlightReview') {
    highlightReviewByIndex(request.index);
    sendResponse({ success: true });
    return true;
  }
});

/**
 * Smoothly highlight a target review card on the page
 */
function highlightReviewByIndex(index) {
  const cards = document.querySelectorAll('div._2wzgFH, div.col._2wzgFH, div.EPCmJX');
  if (cards && cards[index]) {
    const target = cards[index];
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.style.transition = 'all 0.5s ease';
    target.style.outline = '3px solid #2874f0';
    target.style.backgroundColor = '#f0f7ff';

    setTimeout(() => {
      target.style.outline = 'none';
      target.style.backgroundColor = '';
    }, 4000);
  }
}

// Check hash on page load for deep-linking
window.addEventListener('load', () => {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#review-p')) {
    const match = hash.match(/i(\d+)/);
    if (match && match[1]) {
      const idx = parseInt(match[1], 10) - 1;
      setTimeout(() => highlightReviewByIndex(idx), 800);
    }
  }
});
