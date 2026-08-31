# 🚀 Free 24/7 Lifetime Hosting Guide for Flipkart Review Search Backend & Admin Panel

Here are the **best 100% free options** to host your Backend Server and Admin Panel with permanent lifetime memory:

---

## 🏆 Recommended: Render.com + MongoDB Atlas (100% Free Forever)

This setup is **free forever**, gives you a live **HTTPS URL** (e.g. `https://fk-admin.onrender.com`), and guarantees that all license keys, user memberships, and passwords **never get deleted**.

---

### 📋 Step 1: Get a 100% Free Lifetime Database (MongoDB Atlas)

1. Go to [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) and create a free account.
2. Choose the **M0 FREE Tier** (Shared, 512MB storage — 100% free forever).
3. Under **Security Quickstart**:
   - Create a Username and Password (e.g. `admin` / `MySecretPass123`).
   - In **IP Access List**, click **Allow Access from Anywhere** (`0.0.0.0/0`).
4. Click **Connect** -> **Drivers** -> Copy your Connection String:
   ```
   mongodb+srv://admin:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```

---

### 🌐 Step 2: Deploy Backend to Render.com (Free 24/7)

1. Create a free account at [render.com](https://render.com).
2. Upload this project folder to GitHub (private or public repository).
3. In Render Dashboard, click **New +** -> **Web Service**.
4. Connect your GitHub repository.
5. Set the following configuration:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: **Free**
6. Click **Advanced** -> **Add Environment Variable**:
   - `MONGODB_URI`: paste your MongoDB connection string from Step 1.
   - `PORT`: `5000`
7. Click **Create Web Service**.
8. In ~1 minute, your Backend and Admin Panel will be live at:
   ```
   https://your-service-name.onrender.com
   ```

---

## ⚡ Alternative: Koyeb.com (Free Always-On Instance)

1. Sign up at [koyeb.com](https://www.koyeb.com) (Free Eco Tier).
2. Click **Create App** -> **GitHub**.
3. Select your repository -> set directory to `server`.
4. Add environment variable `MONGODB_URI` or use local storage.
5. Deploy -> You get a free live URL: `https://your-app.koyeb.app`.

---

## 🔗 Step 3: Connect Chrome Extension to Your Hosted Backend

Once you have your live URL (e.g. `https://your-service-name.onrender.com`):

1. In the Chrome extension, open `scripts/license.js`.
2. Update `DEFAULT_BACKEND_URL`:
   ```javascript
   static DEFAULT_BACKEND_URL = 'https://your-service-name.onrender.com';
   ```
3. Reload the Chrome extension at `chrome://extensions`.

Now:
- You can open your Admin Panel from your phone, laptop, or anywhere at `https://your-service-name.onrender.com`.
- All license keys you create will be remembered permanently.
- Any user with the Chrome extension anywhere in the world will activate and sync with your live backend automatically!
