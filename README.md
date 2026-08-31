# Flipkart Review Search by Name (Chrome Extension)

A powerful Chrome Extension (Manifest V3) that searches Flipkart product reviews by reviewer name (exact or similar/fuzzy matching), checks review availability for single or multiple users, displays matching review text and ratings, and provides direct links to each review.

---

## ✨ Features

- 🔍 **Exact & Fuzzy Name Matching**:
  - **Exact Match**: Instant case-insensitive exact matching.
  - **Fuzzy / Similar Match**: Uses Levenshtein distance, Bigram (Dice's coefficient), and token subset matching to catch typos, shortened names, and partial matches (e.g. *"Rahul S."* matching *"Rahul Sharma"*).
  - **Adjustable Sensitivity**: Custom slider from 50% to 95% threshold.

- 👥 **Single & Batch Multi-User Search**:
  - Search 1 name or paste dozens of names at once (separated by commas or new lines).
  - Clear **Availability Summary Matrix** showing instantly if a review is `Found (N reviews)` or `Not Available` for each queried person.

- 🔗 **Direct Review Links & Snippets**:
  - Direct clickable link to open the exact review page on Flipkart.
  - Review rating (stars), review headline, full/snippet text, date/location, and Certified Buyer badge status.

- ⚡ **Live Pagination & Controls**:
  - Background scanning with live progress bar and review counter.
  - Adjustable max pages (5, 10, 20, 50, 100 pages).
  - Pause / Stop scan button at any point.

- 📥 **Export & Sharing**:
  - Export matched reviews to **CSV** or **JSON**.
  - **Copy All Links** to clipboard with one click.

- 🎯 **1-Click Active Tab Detection**:
  - Automatically detects the current Flipkart product URL when you open the popup on Flipkart.

---

## 🚀 How to Install in Google Chrome

1. Open Google Chrome.
2. In the address bar, type `chrome://extensions` and press **Enter**.
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click the **Load unpacked** button in the top-left.
5. Select this folder:
   ```
   c:\Users\mahab\Documents\antigravity\serene-raman
   ```
6. The **Flipkart Review Search by Name** extension is now installed! Pin it to your Chrome toolbar for easy access.

---

## 📖 How to Use

1. **Step 1: Provide Flipkart Link**
   - Open any Flipkart product page in Chrome and click **Use Active Tab**, OR
   - Paste any Flipkart product or review URL into the input field.

2. **Step 2: Enter Reviewer Name(s)**
   - Enter one name (e.g. `Rahul Sharma`), OR
   - Enter multiple names separated by commas or new lines (e.g. `Amit Kumar, Priya Patel, Vikas Singh`).

3. **Step 3: Choose Settings**
   - Select **Fuzzy / Similar** (recommended) or **Exact Match**.
   - Adjust the similarity sensitivity slider if needed.
   - Choose scan depth (e.g. 20 pages).

4. **Step 4: Click Search Reviews**
   - Watch the live progress bar scan review pages.
   - View the **Availability Status** for each name and read the matched review cards.
   - Click **Review Page ↗** to navigate directly to the review on Flipkart.
   - Click **CSV** or **JSON** to export the results.

---

## 📁 File Structure

```
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── popup/
│   ├── popup.html             # Popup user interface
│   ├── popup.css              # Styling (Flipkart theme, cards, badges)
│   └── popup.js               # UI controller and orchestration
├── scripts/
│   ├── matcher.js             # Exact and fuzzy string matching algorithms
│   ├── scraper.js             # Flipkart DOM parser and multi-page review fetcher
│   ├── generate_icons.js      # Icon builder utility
│   └── test_verification.js   # Automated unit tests
├── icons/
│   ├── icon16.png             # 16x16 icon
│   ├── icon48.png             # 48x48 icon
│   └── icon128.png            # 128x128 icon
└── content/
    └── content.js             # In-page helper & highlight script
```
