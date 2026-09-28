import os
import secrets
from flask import Flask, request, jsonify, send_from_directory
from functools import wraps

from database import db
from scraper import PythonScraper

# Locate public static directory
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), 'public')
if not os.path.exists(PUBLIC_DIR):
    # Fallback to server/public if sharing workspace
    fallback = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'server', 'public')
    if os.path.exists(fallback):
        PUBLIC_DIR = fallback

app = Flask(__name__, static_folder=PUBLIC_DIR, static_url_path='')

active_admin_tokens = set()

def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '').strip() if 'Bearer ' in auth_header else auth_header.strip()
        if not token or token not in active_admin_tokens:
            return jsonify({"success": False, "error": "Unauthorized. Please login again."}), 401
        return f(*args, **kwargs)
    return decorated


# =====================================================================
# PUBLIC ROUTES
# =====================================================================

@app.route('/api/ping', methods=['GET'])
def ping():
    import time
    return jsonify({"status": "ok", "time": int(time.time() * 1000), "server": "PythonAnywhere Flask"})

@app.route('/api/license/verify', methods=['POST'])
def verify_license_endpoint():
    data = request.get_json(force=True, silent=True) or {}
    key = data.get('key')
    device_id = data.get('deviceId')
    result = db.verify_license(key, device_id)
    return jsonify(result)

@app.route('/api/license/activate', methods=['POST'])
def activate_license_endpoint():
    data = request.get_json(force=True, silent=True) or {}
    key = data.get('key')
    device_id = data.get('deviceId')
    client_name = data.get('clientName', '')
    result = db.activate_key(key, device_id, client_name)
    status_code = 200 if result.get('success') else 400
    return jsonify(result), status_code

@app.route('/api/search/scrape', methods=['POST'])
def search_scrape_endpoint():
    data = request.get_json(force=True, silent=True) or {}
    license_key = data.get('licenseKey')
    product_url = data.get('productUrl')
    query_names = data.get('queryNames', [])
    query_locations = data.get('queryLocations', [])
    exact_only = data.get('exactOnly', False)
    threshold = float(data.get('threshold', 0.75))
    max_pages = int(data.get('maxPagesPerSection', 25))
    search_scope = data.get('searchScope', 'ALL_SECTIONS')
    device_id = data.get('deviceId')

    # 1. Verify License Key
    lic_check = db.verify_license(license_key, device_id)
    if not lic_check.get('isValid'):
        return jsonify({"error": lic_check.get('error', 'Invalid or expired License Key.')}), 403

    # 2. Normalize Universal URL
    norm = PythonScraper.normalize_universal_url(product_url)
    if not norm.get('isValid'):
        return jsonify({"error": norm.get('error', 'Invalid Flipkart Product URL.')}), 400

    # 3. Execute Search
    try:
        results = PythonScraper.search_reviews(
            review_url=norm['reviewUrl'],
            query_names=query_names,
            query_locations=query_locations,
            exact_only=exact_only,
            threshold=threshold,
            max_pages_per_section=max_pages,
            search_scope=search_scope
        )

        return jsonify({
            "success": True,
            "productTitle": norm.get('productTitle', 'Flipkart Product'),
            "normalizedUrl": norm['reviewUrl'],
            "matchedReviews": results['matchedReviews'],
            "totalReviewsScanned": results['totalReviewsScanned'],
            "totalPagesScanned": results['totalPagesScanned'],
            "license": {
                "planType": lic_check.get('planType'),
                "daysRemaining": lic_check.get('daysRemaining'),
                "expiryDate": lic_check.get('expiryDate')
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": f"Error scanning Flipkart reviews: {e}"}), 500


# =====================================================================
# ADMIN PROTECTED ROUTES
# =====================================================================

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.get_json(force=True, silent=True) or {}
    password = data.get('password', '')
    if db.verify_admin(password):
        token = 'adm_' + secrets.token_hex(16)
        active_admin_tokens.add(token)
        return jsonify({"success": True, "token": token})
    return jsonify({"success": False, "error": "Incorrect Admin password."}), 401

@app.route('/api/admin/dashboard', methods=['GET'])
@auth_required
def admin_dashboard():
    return jsonify(db.get_dashboard_stats())

@app.route('/api/admin/keys', methods=['GET'])
@auth_required
def admin_keys():
    return jsonify({"keys": db.data.get('keys', [])})

@app.route('/api/admin/generate-key', methods=['POST'])
@auth_required
def admin_generate_key():
    data = request.get_json(force=True, silent=True) or {}
    plan_type = data.get('planType', 'MONTHLY')
    days = data.get('days', 30)
    client_name = data.get('clientName', 'User')
    max_devices = data.get('maxDevices', 1)
    new_key = db.generate_key(plan_type, days, client_name, max_devices)
    return jsonify({"success": True, "keyRecord": new_key})

@app.route('/api/admin/revoke-key', methods=['POST'])
@auth_required
def admin_revoke_key():
    data = request.get_json(force=True, silent=True) or {}
    return jsonify(db.revoke_key(data.get('keyId')))

@app.route('/api/admin/restore-key', methods=['POST'])
@auth_required
def admin_restore_key():
    data = request.get_json(force=True, silent=True) or {}
    return jsonify(db.restore_key(data.get('keyId')))

@app.route('/api/admin/extend-key', methods=['POST'])
@auth_required
def admin_extend_key():
    data = request.get_json(force=True, silent=True) or {}
    return jsonify(db.extend_key(data.get('keyId'), data.get('extraDays', 30)))

@app.route('/api/admin/delete-key', methods=['POST'])
@auth_required
def admin_delete_key():
    data = request.get_json(force=True, silent=True) or {}
    return jsonify(db.delete_key(data.get('keyId')))

@app.route('/api/admin/change-password', methods=['POST'])
@auth_required
def admin_change_password():
    data = request.get_json(force=True, silent=True) or {}
    return jsonify(db.update_admin_password(data.get('oldPassword'), data.get('newPassword')))


# =====================================================================
# STATIC WEB & ADMIN ROUTES
# =====================================================================

@app.route('/admin')
@app.route('/admin/')
@app.route('/admin/index.html')
@app.route('/admin.html')
def serve_admin():
    admin_path = os.path.join(PUBLIC_DIR, 'admin.html')
    if os.path.exists(admin_path):
        return send_from_directory(PUBLIC_DIR, 'admin.html')
    admin_idx = os.path.join(PUBLIC_DIR, 'admin', 'index.html')
    if os.path.exists(admin_idx):
        return send_from_directory(os.path.join(PUBLIC_DIR, 'admin'), 'index.html')
    return "Admin page not found", 404

@app.route('/')
@app.route('/search')
@app.route('/app')
def serve_home():
    return send_from_directory(PUBLIC_DIR, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(PUBLIC_DIR, filename)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"🚀 Python Flask Server running on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=False)
