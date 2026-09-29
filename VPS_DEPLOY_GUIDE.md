# 🚀 Deployment Guide for `flipkart.runpython.online`

This guide explains how to host your **Flipkart Review Search Pro** backend & web app on your server (`77.42.34.80` / `flipkart.runpython.online`).

---

## 📋 Quick Setup via SSH (3 Steps)

### Step 1: Connect to your VPS
```bash
ssh root@77.42.34.80
```

---

### Step 2: Clone & Install Dependencies
```bash
# Navigate to web root or app directory
cd /var/www

# Clone repository (or pull latest changes)
git clone https://github.com/offertricksandpromocode-dotcom/flipkart-review-search-pro.git flipkart-app
cd flipkart-app

# Install Node.js packages
npm install
cd server && npm install && cd ..
```

---

### Step 3: Start Application with PM2 (24/7 Background Runner)
```bash
# Install PM2 if not installed
npm install -g pm2

# Start the server using ecosystem config
pm2 start ecosystem.config.js

# Save PM2 process list to auto-start on server reboot
pm2 save
pm2 startup
```

---

## 🌐 Step 4: Nginx Reverse Proxy Configuration

Open or create the Nginx site configuration:
```bash
sudo nano /etc/nginx/sites-available/flipkart.runpython.online
```

Paste the following Nginx block:
```nginx
server {
    listen 80;
    server_name flipkart.runpython.online;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/flipkart.runpython.online /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Enable Free SSL (HTTPS with Certbot):
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d flipkart.runpython.online
```

---

## 🔗 Live URLs After Deployment:
- **🌐 User Web Search App**: `https://flipkart.runpython.online`
- **👑 Admin Portal**: `https://flipkart.runpython.online/admin` *(Password: `mk@123`)*
