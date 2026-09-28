# 🚀 Step-by-Step Guide: Hosting on PythonAnywhere (mahabir.pythonanywhere.com)

This guide will help you host **Flipkart Review Search Pro** on your [PythonAnywhere Dashboard (mahabir)](https://www.pythonanywhere.com/user/mahabir/).

---

## 📋 Prerequisites
- PythonAnywhere Account: **`mahabir`**
- Your Live URL will be: **`https://mahabir.pythonanywhere.com`**
- Admin Portal will be: **`https://mahabir.pythonanywhere.com/admin`** *(Password: `mk@123`)*

---

## ⚡ Step 1: Open Bash Console & Clone Repository

1. Open your [PythonAnywhere Dashboard](https://www.pythonanywhere.com/user/mahabir/).
2. Under the **"Consoles"** tab, click **"Bash"** to open a new terminal.
3. Run the following commands one by one:

```bash
# 1. Clone your GitHub repository
git clone https://github.com/offertricksandpromocode-dotcom/flipkart-review-search-pro.git

# 2. Go to the python_server directory
cd flipkart-review-search-pro/python_server

# 3. Install required packages (Flask, Requests, PyMongo)
pip3 install -r requirements.txt --user
```

---

## 🌐 Step 2: Configure Web App in PythonAnywhere

1. In PythonAnywhere, click on the **"Web"** tab at the top.
2. Click the blue button **"Add a new web app"**.
3. In the setup popup:
   - Choose **"Manual configuration (including virtualenvs)"**
   - Select **"Python 3.10"** (or Python 3.11)
   - Click **"Next"** until created.

---

## ⚙️ Step 3: Set Paths & WSGI Configuration

Under your newly created Web App settings:

### 1. Set Code Paths:
- **Source code**: 
  ```text
  /home/mahabir/flipkart-review-search-pro/python_server
  ```
- **Working directory**:
  ```text
  /home/mahabir/flipkart-review-search-pro/python_server
  ```

---

### 2. Edit WSGI configuration file:
1. Click on the link for **WSGI configuration file** (e.g. `/var/www/mahabir_pythonanywhere_com_wsgi.py`).
2. Delete everything inside the editor and paste the following:

```python
import sys
import os

# Project path
path = '/home/mahabir/flipkart-review-search-pro/python_server'
if path not in sys.path:
    sys.path.insert(0, path)

# Import Flask application as WSGI entry point
from app import app as application
```

3. Click the green **"Save"** button in the top-right corner.

---

## 🔄 Step 4: Reload & Launch!

1. Go back to the **"Web"** tab.
2. Click the big green button: **"Reload mahabir.pythonanywhere.com"**.
3. Visit your live site:
   - 🌐 **Web App**: **`https://mahabir.pythonanywhere.com`**
   - 👑 **Admin Portal**: **`https://mahabir.pythonanywhere.com/admin`** *(Password: `mk@123`)*

---

## 🔄 How to Pull Future Updates on PythonAnywhere
Whenever you push changes to GitHub, you can update PythonAnywhere in 5 seconds:
1. Open **Bash Console** in PythonAnywhere.
2. Run:
```bash
cd /home/mahabir/flipkart-review-search-pro
git pull origin main
```
3. Go to the **Web** tab and click **"Reload mahabir.pythonanywhere.com"**!
