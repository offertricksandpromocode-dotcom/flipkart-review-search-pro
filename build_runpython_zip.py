import os
import shutil
import zipfile

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR = os.path.join(ROOT_DIR, 'runpython_build')
ZIP_FILE = os.path.join(ROOT_DIR, 'runpython_deploy.zip')
DESKTOP_ZIP = os.path.expanduser('~/Desktop/runpython_deploy.zip')

print("[Build] Packaging RunPython Flask Application...")

if os.path.exists(BUILD_DIR):
    shutil.rmtree(BUILD_DIR)
os.makedirs(BUILD_DIR, exist_ok=True)

TEMPLATES_DIR = os.path.join(BUILD_DIR, 'templates')
STATIC_DIR = os.path.join(BUILD_DIR, 'static')
os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# 1. Copy Python files to root
SRC_PY = os.path.join(ROOT_DIR, 'python_server')
for py_f in ['app.py', 'database.py', 'scraper.py']:
    src_path = os.path.join(SRC_PY, py_f)
    if os.path.exists(src_path):
        shutil.copy2(src_path, os.path.join(BUILD_DIR, py_f))

# Write requirements.txt
with open(os.path.join(BUILD_DIR, 'requirements.txt'), 'w', encoding='utf-8') as f:
    f.write("Flask>=3.0.0\nrequests>=2.31.0\npymongo>=4.6.0\n")

# 2. Copy HTML files to templates/ AND root/static/
SERVER_PUBLIC = os.path.join(ROOT_DIR, 'server', 'public')
for html_f in ['index.html', 'admin.html']:
    src_html = os.path.join(SERVER_PUBLIC, html_f)
    if os.path.exists(src_html):
        shutil.copy2(src_html, os.path.join(TEMPLATES_DIR, html_f))
        shutil.copy2(src_html, os.path.join(STATIC_DIR, html_f))

# 3. Copy CSS and JS assets to static/
for asset_f in ['web_app.css', 'web_app.js', 'style.css', 'app.js']:
    src_asset = os.path.join(SERVER_PUBLIC, asset_f)
    if os.path.exists(src_asset):
        shutil.copy2(src_asset, os.path.join(STATIC_DIR, asset_f))

# 4. Create zip archive
print("[Build] Creating Zip archive...")
if os.path.exists(ZIP_FILE):
    os.remove(ZIP_FILE)

with zipfile.ZipFile(ZIP_FILE, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(BUILD_DIR):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, BUILD_DIR)
            zf.write(full_path, rel_path)

# Copy to Desktop
try:
    shutil.copy2(ZIP_FILE, DESKTOP_ZIP)
    print(f"[Desktop] Copied directly to {DESKTOP_ZIP}")
except Exception as e:
    print(f"[Desktop] Copy error: {e}")

size_kb = round(os.path.getsize(ZIP_FILE) / 1024, 2)
print(f"[Success] Created {ZIP_FILE} ({size_kb} KB)")
