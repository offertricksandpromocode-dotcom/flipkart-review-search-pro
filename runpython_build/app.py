import os
import sys
import json
import time
import secrets
import hashlib
import random
import re
import urllib.request
import urllib.parse
import urllib.error
import ssl
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from functools import wraps
from flask import Flask, request, jsonify, render_template, send_from_directory, make_response, Response

# ==============================================================================
# DATABASE ENGINE (Local JSON + MongoDB Atlas)
# ==============================================================================
class DatabaseEngine:
    def __init__(self):
        self.data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
        self.db_file = os.path.join(self.data_dir, 'database.json')
        self.mongo_uri = os.environ.get('MONGODB_URI', "mongodb+srv://offertricksandpromocode_db_user:KMhZIVuxHEmSiSku@cluster0.4mrmksu.mongodb.net/?retryWrites=true&w=majority")
        self.data = {
            "keys": [],
            "logs": [],
            "adminPasswordHash": self.hash_password("mk@123")
        }
        self.is_mongo = False
        self.mongo_db = None
        self.init_db()

    def hash_password(self, password):
        return hashlib.sha256(str(password).encode('utf-8')).hexdigest()

    def init_db(self):
        if os.path.exists(self.db_file):
            try:
                with open(self.db_file, 'r', encoding='utf-8') as f:
                    local_d = json.load(f)
                    if isinstance(local_d, dict):
                        self.data.update(local_d)
            except Exception:
                pass

        try:
            from pymongo import MongoClient
            client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=2000)
            self.mongo_db = client.get_database('flipkart_review_pro')
            self.mongo_db.command('ping')
            self.is_mongo = True
            self.load_from_mongo()
        except Exception:
            pass

    def load_from_mongo(self):
        if not self.is_mongo or not self.mongo_db:
            return
        try:
            keys_cursor = self.mongo_db.keys.find()
            mongo_keys = []
            for k in keys_cursor:
                k.pop('_id', None)
                mongo_keys.append(k)
            if mongo_keys:
                self.data['keys'] = mongo_keys

            settings = self.mongo_db.settings.find_one({'_id': 'admin_settings'})
            if settings and 'adminPasswordHash' in settings:
                self.data['adminPasswordHash'] = settings['adminPasswordHash']

            self.save_local()
        except Exception:
            pass

    def save_local(self):
        try:
            os.makedirs(self.data_dir, exist_ok=True)
            with open(self.db_file, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, indent=2)
        except Exception:
            pass

    def verify_admin(self, password):
        return self.hash_password(password) == self.data.get('adminPasswordHash')

    def get_dashboard_stats(self):
        keys = self.data.get('keys', [])
        return {
            "totalKeys": len(keys),
            "activeKeys": len([k for k in keys if k.get('status') == 'ACTIVE']),
            "expiredKeys": len([k for k in keys if k.get('status') != 'ACTIVE']),
            "totalDevices": sum(len(k.get('activatedDevices', [])) for k in keys),
            "recentKeys": keys[:10],
            "logs": self.data.get('logs', [])[:50]
        }

db = DatabaseEngine()

# ==============================================================================
# FLIPKART SCRAPER & MATCHER (High-Speed Concurrent ThreadPool)
# ==============================================================================
class NameMatcher:
    @staticmethod
    def normalize_string(s):
        if not s:
            return ""
        s = str(s).lower().strip()
        s = re.sub(r'[^\w\s]', '', s)
        return re.sub(r'\s+', ' ', s).strip()

    @staticmethod
    def levenshtein_distance(s1, s2):
        if len(s1) < len(s2):
            return NameMatcher.levenshtein_distance(s2, s1)
        if len(s2) == 0:
            return len(s1)
        prev = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            curr = [i + 1]
            for j, c2 in enumerate(s2):
                ins = prev[j + 1] + 1
                dels = curr[j] + 1
                subs = prev[j] + (c1 != c2)
                curr.append(min(ins, dels, subs))
            prev = curr
        return prev[-1]

    @staticmethod
    def calculate_similarity(s1, s2):
        n1 = NameMatcher.normalize_string(s1)
        n2 = NameMatcher.normalize_string(s2)
        if not n1 or not n2:
            return 0.0
        if n1 == n2:
            return 1.0
        if n1 in n2 or n2 in n1:
            return max(len(n1), len(n2)) / max(len(s1), len(s2)) * 0.95
        max_len = max(len(n1), len(n2))
        dist = NameMatcher.levenshtein_distance(n1, n2)
        return max(0.0, 1.0 - (dist / max_len))

    @staticmethod
    def match_review(review, query_names=None, query_locations=None, exact_only=False, threshold=0.75):
        query_names = [q.strip() for q in (query_names or []) if q and q.strip()]
        query_locations = [l.strip() for l in (query_locations or []) if l and l.strip()]
        matches = []

        reviewer_name = review.get('reviewerName', '') or 'Flipkart Customer'
        review_location = review.get('location', '') or review.get('dateLocation', '') or ''

        # If no search filters given, return every review
        if not query_names and not query_locations:
            return [{
                "query": "All Reviews",
                "matchedTarget": reviewer_name,
                "matchType": "exact",
                "score": 1.0
            }]

        norm_reviewer = NameMatcher.normalize_string(reviewer_name)
        reviewer_words = norm_reviewer.split()

        # 1. Match by Names
        for clean_q in query_names:
            norm_q = NameMatcher.normalize_string(clean_q)
            if not norm_q:
                continue

            # Exact full name match
            if norm_q == norm_reviewer:
                matches.append({
                    "query": clean_q,
                    "matchedTarget": reviewer_name,
                    "matchType": "exact",
                    "score": 1.0
                })
                continue

            # Word-level exact match (e.g. 'Riya' matches 'Riya Paul' or 'Kesab' matches 'Kesab Pradhan')
            if norm_q in reviewer_words or norm_q in norm_reviewer:
                matches.append({
                    "query": clean_q,
                    "matchedTarget": reviewer_name,
                    "matchType": "exact",
                    "score": 1.0
                })
                continue

            # Fuzzy distance match
            if not exact_only:
                score = NameMatcher.calculate_similarity(clean_q, reviewer_name)
                if score >= threshold:
                    matches.append({
                        "query": clean_q,
                        "matchedTarget": reviewer_name,
                        "matchType": "fuzzy",
                        "score": round(score, 2)
                    })

        # 2. Match by Locations / Areas
        norm_rev_loc = NameMatcher.normalize_string(review_location)
        for clean_loc in query_locations:
            norm_q_loc = NameMatcher.normalize_string(clean_loc)
            if not norm_q_loc:
                continue

            if norm_rev_loc and (norm_q_loc in norm_rev_loc or norm_rev_loc in norm_q_loc):
                matches.append({
                    "query": clean_loc,
                    "matchedTarget": review_location,
                    "matchType": "exact",
                    "score": 1.0,
                    "matchedLocation": True
                })

        return matches


class FlipkartScraper:
    USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0'
    ]

    @classmethod
    def get_headers(cls):
        return {
            'User-Agent': random.choice(cls.USER_AGENTS),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
            'Cache-Control': 'max-age=0'
        }

    @classmethod
    def fetch_url(cls, url):
        # 1. Try requests.Session first (handles cookies, compression, and HTTP/2)
        try:
            import requests
            session = requests.Session()
            resp = session.get(url, headers=cls.get_headers(), timeout=8)
            if resp.status_code == 200 and resp.text:
                return resp.text
        except Exception:
            pass

        # 2. Fallback to urllib.request with SSL context
        try:
            req = urllib.request.Request(url, headers=cls.get_headers())
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(req, context=ctx, timeout=8) as response:
                return response.read().decode('utf-8', errors='ignore')
        except Exception:
            return ""

    @classmethod
    def extract_url(cls, text):
        if not text:
            return ""
        match = re.search(r'https?://[^\s<>"\'()]+', str(text), re.IGNORECASE)
        return match.group(0) if match else text.strip()

    @classmethod
    def resolve_redirects(cls, url_str, max_hops=4):
        if not url_str:
            return ""
        current_url = url_str.strip()

        is_short = 'dl.flipkart.com' in current_url or 'fkrt.it' in current_url or 'fkrt.co' in current_url or '/s/' in current_url
        if not is_short and ('/p/' in current_url or '/product-reviews/' in current_url or 'pid=' in current_url):
            return current_url

        try:
            import requests
            session = requests.Session()
            resp = session.get(current_url, headers=cls.get_headers(), timeout=6, allow_redirects=True)
            if resp.url:
                return resp.url
        except Exception:
            pass

        return current_url

    @classmethod
    def normalize_universal_url(cls, raw_input):
        if not raw_input:
            return {"isValid": False, "error": "Empty URL provided."}
        extracted = cls.extract_url(raw_input)
        if not extracted:
            return {"isValid": False, "error": "No valid URL found in input."}

        resolved_url = cls.resolve_redirects(extracted)
        try:
            parsed = urllib.parse.urlparse(resolved_url)
            host = parsed.netloc.lower()
            if 'flipkart.com' not in host and 'fkrt.it' not in host and 'fkrt.co' not in host:
                # Check if raw input is a PID
                pid_m = re.search(r'\b([A-Z0-9]{16})\b', str(raw_input))
                if pid_m:
                    return {
                        "isValid": True,
                        "reviewUrl": f"https://www.flipkart.com/product/product-reviews/itm?pid={pid_m.group(1)}&marketplace=FLIPKART",
                        "resolvedUrl": resolved_url,
                        "pid": pid_m.group(1),
                        "productTitle": "Flipkart Product"
                    }
                return {"isValid": False, "error": "Please enter a valid Flipkart product link."}

            qs = urllib.parse.parse_qs(parsed.query)
            pid = qs.get('pid', [None])[0]
            lid = qs.get('lid', [None])[0]
            marketplace = qs.get('marketplace', ['FLIPKART'])[0]

            path_parts = [p for p in parsed.path.split('/') if p]
            itm_id = ''
            slug = ''

            if 'p' in path_parts:
                p_idx = path_parts.index('p')
                if p_idx + 1 < len(path_parts):
                    itm_id = path_parts[p_idx + 1]
                if p_idx > 0:
                    slug = path_parts[p_idx - 1]

            if 'product-reviews' in path_parts:
                r_idx = path_parts.index('product-reviews')
                if r_idx + 1 < len(path_parts):
                    itm_id = path_parts[r_idx + 1]
                if r_idx > 0:
                    slug = path_parts[r_idx - 1]

            if not slug:
                ignore = {'dl', 'hi', 'en', 'bn', 'ta', 'te', 'kn', 'mr', 'gu', 's', 'item', 'product'}
                for p in path_parts:
                    if p.lower() not in ignore and not p.startswith('itm'):
                        slug = p
                        break
                if not slug:
                    slug = path_parts[0] if path_parts else 'product'

            raw_title = slug.replace('-', ' ')
            product_title = raw_title.capitalize()

            if itm_id and pid:
                review_url = f"https://www.flipkart.com/{slug}/product-reviews/{itm_id}?pid={pid}"
            elif itm_id:
                review_url = f"https://www.flipkart.com/{slug}/product-reviews/{itm_id}?pid={pid or ''}"
            elif pid:
                review_url = f"https://www.flipkart.com/{slug}/product-reviews/itm?pid={pid}"
            else:
                review_url = f"https://www.flipkart.com{parsed.path}"

            if lid:
                review_url += f"&lid={lid}"
            if marketplace:
                review_url += f"&marketplace={marketplace}"

            return {
                "isValid": True,
                "reviewUrl": review_url,
                "resolvedUrl": resolved_url,
                "pid": pid,
                "slug": slug,
                "itmId": itm_id,
                "productTitle": product_title
            }
        except Exception as e:
            return {"isValid": False, "error": f"Could not parse Flipkart URL: {e}"}

    @classmethod
    def extract_product_meta(cls, slug='', itm_id='', pid='', resolved_url='', initial_html=''):
        title = ''
        image_url = ''
        price = ''

        # 1. Clean Title from HTML title or og:title if provided
        if initial_html:
            t_matches = re.findall(r'<meta[^>]*property=[\"\']og:title[\"\'][^>]*content=[\"\']([^\"\']+)[\"\']', initial_html) or re.findall(r'<title>([^<]+)</title>', initial_html)
            if t_matches:
                raw_t = t_matches[0]
                clean_t = re.sub(r'Reviews:\s*Latest Review of.*', '', raw_t, flags=re.IGNORECASE)
                clean_t = re.sub(r'\|\s*Price in India.*', '', clean_t, flags=re.IGNORECASE)
                clean_t = re.sub(r'Online at (?:Best|Lowest) Price.*', '', clean_t, flags=re.IGNORECASE)
                clean_t = re.sub(r'\|\s*Flipkart\.com.*', '', clean_t, flags=re.IGNORECASE)
                title = clean_t.strip()

            img_matches = re.findall(r'<meta[^>]*property=[\"\']og:image[\"\'][^>]*content=[\"\']([^\"\']+)[\"\']', initial_html)
            if img_matches:
                image_url = img_matches[0]

        if not title and slug:
            title = slug.replace('-', ' ').title()

        # 2. Extract Product Image from main product page if not present
        if not image_url:
            try:
                prod_page_url = f"https://www.flipkart.com/{slug}/p/{itm_id or 'itm'}?pid={pid}" if (slug and pid) else resolved_url
                if prod_page_url:
                    prod_html = cls.fetch_url(prod_page_url)
                    if not title:
                        t_matches = re.findall(r'<meta[^>]*property=[\"\']og:title[\"\'][^>]*content=[\"\']([^\"\']+)[\"\']', prod_html) or re.findall(r'<title>([^<]+)</title>', prod_html)
                        if t_matches:
                            raw_t = t_matches[0]
                            clean_t = re.sub(r'\|\s*Price in India.*', '', raw_t, flags=re.IGNORECASE)
                            clean_t = re.sub(r'Online at (?:Best|Lowest) Price.*', '', clean_t, flags=re.IGNORECASE)
                            clean_t = re.sub(r'\|\s*Flipkart\.com.*', '', clean_t, flags=re.IGNORECASE)
                            title = clean_t.strip()

                    p_img = re.findall(r'<meta[^>]*property=[\"\']og:image[\"\'][^>]*content=[\"\']([^\"\']+)[\"\']', prod_html)
                    if p_img:
                        image_url = p_img[0]
                    else:
                        ruk = re.findall(r'https://rukminim[0-9]*\.flixcart\.com/image/[^"\'>\s]+', prod_html)
                        if ruk:
                            image_url = ruk[0]
            except Exception:
                pass

        return {
            "title": title or (slug.replace('-', ' ').title() if slug else "Flipkart Product"),
            "imageUrl": image_url,
            "price": price
        }

    @classmethod
    def parse_reviews_from_html(cls, html, page_url):
        reviews = []
        if not html:
            return reviews, False

        # 1. Robust __INITIAL_STATE__ JSON Extractor
        idx = html.find('__INITIAL_STATE__')
        if idx != -1:
            try:
                eq_idx = html.find('=', idx)
                end_idx = html.find('</script>', eq_idx)
                raw_json = html[eq_idx + 1:end_idx].strip().rstrip(';')
                state = json.loads(raw_json)
                slots = state.get('multiWidgetState', {}).get('widgetsData', {}).get('slots', [])
                for slot in slots:
                    widget = slot.get('slotData', {}).get('widget', {})
                    comps = widget.get('data', {}).get('renderableComponents', [])
                    for comp in comps:
                        val = comp.get('value', {})
                        if val and (val.get('author') or val.get('reviewerName') or (val.get('text') and val.get('rating'))):
                            author = val.get('author') or val.get('reviewerName') or 'Flipkart Customer'
                            rating = str(val.get('rating', '5'))
                            title = val.get('title') or val.get('heading') or ''
                            body = val.get('text') or val.get('reviewText') or val.get('comment') or ''
                            is_certified = val.get('certifiedBuyer', False) or val.get('isCertified', False)
                            created_date = val.get('created') or val.get('submissionTime') or ''

                            loc_data = val.get('location', '')
                            location = ''
                            if isinstance(loc_data, str):
                                location = loc_data
                            elif isinstance(loc_data, dict):
                                location = f"{loc_data.get('city', '')}, {loc_data.get('state', '')}".strip(', ')

                            direct_url = page_url
                            if val.get('url'):
                                direct_url = val['url'] if val['url'].startswith('http') else f"https://www.flipkart.com{val['url']}"
                            elif val.get('reviewId'):
                                pid = urllib.parse.parse_qs(urllib.parse.urlparse(page_url).query).get('pid', [''])[0]
                                direct_url = f"https://www.flipkart.com/reviews/{pid}?reviewId={val['reviewId']}"

                            reviews.append({
                                "id": val.get('reviewId') or f"rev_{len(reviews)}_{int(time.time())}",
                                "reviewerName": author,
                                "location": location,
                                "rating": rating,
                                "title": title,
                                "body": body,
                                "isCertified": is_certified,
                                "dateLocation": " • ".join(filter(None, [created_date, location])),
                                "directUrl": direct_url
                            })
            except Exception as e:
                print(f"[Scraper] State parse warning: {e}")

        # 2. DOM Card Parsing Fallback
        if not reviews:
            card_matches = re.findall(r'<div class="[^"]*(?:col _2wQAZ[A-Za-z0-9_-]*|cPHDOP)[^"]*"[\s\S]*?</div>\s*</div>\s*</div>', html)
            for card in card_matches:
                name_m = re.search(r'<p class="[^"]*(?:_2NsDsF|_2sc7ZR)[^"]*">([^<]+)</p>', card)
                name = name_m.group(1).strip() if name_m else ''
                if name:
                    rating_m = re.search(r'<div class="[^"]*_3LWZlK[^"]*">([0-9.]+)<\s*img', card)
                    rating = rating_m.group(1).strip() if rating_m else 'N/A'
                    title_m = re.search(r'<p class="[^"]*_2-N8zT[^"]*">([^<]+)</p>', card)
                    title = title_m.group(1).strip() if title_m else ''
                    body_m = re.search(r'<div class="[^"]*t-ZTKy[^"]*"><div><div class="[^"]*">([\s\S]*?)</div>', card)
                    body = re.sub(r'<[^>]+>', '', body_m.group(1)).strip() if body_m else ''
                    is_cert = 'Certified Buyer' in card
                    loc_m = re.search(r'<p class="[^"]*_2mcPpE[^"]*"><span>([^<]+)</span>', card)
                    location = loc_m.group(1).strip() if loc_m else ''

                    reviews.append({
                        "id": f"dom_{len(reviews)}_{int(time.time())}",
                        "reviewerName": name,
                        "location": location,
                        "rating": rating,
                        "title": title,
                        "body": body,
                        "isCertified": is_cert,
                        "dateLocation": location,
                        "directUrl": page_url
                    })

        has_next = '<span>Next</span>' in html or '&page=' in html or len(reviews) >= 10
        return reviews, has_next

    @classmethod
    def fetch_page_worker(cls, target_url, section_name):
        html = cls.fetch_url(target_url)
        reviews, has_next = cls.parse_reviews_from_html(html, target_url)
        return {"reviews": reviews, "hasNext": has_next, "sectionName": section_name}

    @classmethod
    def search_reviews(cls, review_url, query_names=None, query_locations=None, exact_only=False, threshold=0.75, max_pages_per_section=25, search_scope='ALL_SECTIONS'):
        SECTIONS = [
            {"sortOrder": "MOST_RECENT", "name": "Latest / Recent Posts"},
            {"sortOrder": "MOST_HELPFUL", "name": "Most Helpful"},
            {"sortOrder": "POSITIVE_FIRST", "name": "Positive Reviews"},
            {"sortOrder": "NEGATIVE_FIRST", "name": "Negative Reviews"}
        ]

        sections_to_scan = SECTIONS
        if search_scope and search_scope != 'ALL_SECTIONS':
            sections_to_scan = [s for s in SECTIONS if s['sortOrder'] == search_scope] or SECTIONS

        # Safe cap per section to ensure lightning-fast execution under 4 seconds
        effective_pages = min(max_pages_per_section, 10 if len(sections_to_scan) > 1 else 25)

        # Build list of URLs to scan concurrently
        tasks = []
        for section in sections_to_scan:
            for page in range(1, effective_pages + 1):
                parsed_u = urllib.parse.urlparse(review_url)
                qs = urllib.parse.parse_qs(parsed_u.query)
                qs['page'] = [str(page)]
                qs['sortOrder'] = [section['sortOrder']]
                query_str = '&'.join(f"{k}={v[0]}" for k, v in qs.items())
                target_url = f"{parsed_u.scheme}://{parsed_u.netloc}{parsed_u.path}?{query_str}"
                tasks.append((target_url, section['name']))

        matched_reviews = []
        seen_ids = set()
        total_scanned = 0
        total_pages = 0

        # Execute concurrent worker pool (8 threads)
        with ThreadPoolExecutor(max_workers=8) as executor:
            future_to_url = {executor.submit(cls.fetch_page_worker, url, sec): url for url, sec in tasks}
            for future in as_completed(future_to_url):
                total_pages += 1
                try:
                    res = future.result()
                    for rev in res['reviews']:
                        dedupe = f"{rev['reviewerName'].lower()}_{rev['title'][:15]}"
                        if dedupe in seen_ids:
                            continue
                        seen_ids.add(dedupe)
                        total_scanned += 1

                        matches = NameMatcher.match_review(rev, query_names, query_locations, exact_only, threshold)
                        for m in matches:
                            matched_reviews.append({
                                **rev,
                                "foundInSection": res['sectionName'],
                                "searchedQuery": m['query'],
                                "matchedTarget": m['matchedTarget'],
                                "matchType": m['matchType'],
                                "similarityScore": m['score'],
                                "matchedLocation": m.get('matchedLocation', False)
                            })
                except Exception:
                    pass

        return {
            "matchedReviews": matched_reviews,
            "totalReviewsScanned": total_scanned,
            "totalPagesScanned": total_pages
        }


# ==============================================================================
# FLASK APPLICATION FACTORY & ROUTES
# ==============================================================================
def create_app():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(base_dir)

    # Dynamic search paths for templates and static files
    tmpl_dir = os.path.join(base_dir, 'templates')
    if not os.path.exists(tmpl_dir):
        for candidate in [os.path.join(base_dir, 'public'), os.path.join(root_dir, 'server', 'public'), os.path.join(root_dir, 'runpython_build', 'templates')]:
            if os.path.exists(candidate):
                tmpl_dir = candidate
                break

    static_dir = os.path.join(base_dir, 'static')
    if not os.path.exists(static_dir):
        for candidate in [os.path.join(base_dir, 'public'), os.path.join(root_dir, 'server', 'public'), os.path.join(root_dir, 'runpython_build', 'static')]:
            if os.path.exists(candidate):
                static_dir = candidate
                break

    app = Flask(__name__, template_folder=tmpl_dir, static_folder=static_dir)
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'fk-pro-secret-2026')

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

    @app.route('/api/ping', methods=['GET'])
    def ping():
        return jsonify({"status": "ok", "time": int(time.time() * 1000), "server": "RunPython Flask (100% Free)"})

    @app.route('/api/license/verify', methods=['POST'])
    def verify_license_endpoint():
        return jsonify({
            "isValid": True,
            "isActivated": True,
            "planType": "FREE_UNLIMITED",
            "daysRemaining": 9999,
            "expiryDate": "100% Free & Unlimited",
            "clientName": "Free User"
        })

    @app.route('/api/license/activate', methods=['POST'])
    def activate_license_endpoint():
        return jsonify({
            "success": True,
            "planType": "FREE_UNLIMITED",
            "days": 9999,
            "daysRemaining": 9999,
            "expiryDate": "100% Free & Unlimited"
        })

    @app.route('/api/proxy-image', methods=['GET'])
    def proxy_image_endpoint():
        img_url = request.args.get('url', '')
        if not img_url or not (img_url.startswith('http://') or img_url.startswith('https://')):
            return jsonify({"error": "Invalid image URL"}), 400

        try:
            req = urllib.request.Request(img_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Referer': 'https://www.flipkart.com/',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            })
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            with urllib.request.urlopen(req, context=ctx, timeout=12) as response:
                content_type = response.headers.get('Content-Type', 'image/jpeg')
                img_bytes = response.read()
                resp = make_response(img_bytes)
                resp.headers['Content-Type'] = content_type
                resp.headers['Access-Control-Allow-Origin'] = '*'
                resp.headers['Cache-Control'] = 'public, max-age=86400'
                return resp
        except Exception as e:
            return jsonify({"error": f"Failed to proxy image: {e}"}), 500

    @app.route('/api/screenshot', methods=['GET'])
    def capture_screenshot():
        review_url = request.args.get('url', '')
        if not review_url:
            return jsonify({"error": "Missing review URL"}), 400

        try:
            # Request real desktop browser screenshot (1280x800 desktop viewport in JPG format)
            api_url = f"https://api.microlink.io/?url={urllib.parse.quote(review_url)}&screenshot=true&meta=false&viewport.width=1280&viewport.height=800&viewport.deviceScaleFactor=1&type=jpeg"
            req = urllib.request.Request(api_url, headers={'User-Agent': 'Mozilla/5.0'})
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            with urllib.request.urlopen(req, context=ctx, timeout=14) as response:
                data = json.loads(response.read().decode('utf-8'))
                img_url = data.get('data', {}).get('screenshot', {}).get('url')
                if img_url:
                    return jsonify({"success": True, "screenshotUrl": img_url})

            return jsonify({"success": False, "error": "Could not capture live screenshot"}), 500
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

    @app.route('/api/search/scrape', methods=['POST'])
    def search_scrape_endpoint():
        data = request.get_json(force=True, silent=True) or {}
        product_url = data.get('productUrl')
        query_names = data.get('queryNames', [])
        query_locations = data.get('queryLocations', [])
        exact_only = data.get('exactOnly', False)
        threshold = float(data.get('threshold', 0.75))
        max_pages = int(data.get('maxPagesPerSection', 10))
        search_scope = data.get('searchScope', 'ALL_SECTIONS')

        # 1. Normalize Universal URL (100% Free)
        norm = FlipkartScraper.normalize_universal_url(product_url)
        if not norm.get('isValid'):
            return jsonify({"error": norm.get('error', 'Invalid Flipkart Product URL.')}), 400

        # 2. Extract Product Meta (Title, High-Res Image, Price)
        prod_meta = FlipkartScraper.extract_product_meta(
            slug=norm.get('slug', ''),
            itm_id=norm.get('itmId', ''),
            pid=norm.get('pid', ''),
            resolved_url=norm.get('resolvedUrl', '')
        )

        # 3. Execute Fast Concurrent Search
        try:
            results = FlipkartScraper.search_reviews(
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
                "productTitle": prod_meta.get('title') or norm.get('productTitle', 'Flipkart Product'),
                "productImageUrl": prod_meta.get('imageUrl', ''),
                "productPrice": prod_meta.get('price', ''),
                "normalizedUrl": norm['reviewUrl'],
                "matchedReviews": results['matchedReviews'],
                "totalReviewsScanned": results['totalReviewsScanned'],
                "totalPagesScanned": results['totalPagesScanned'],
                "license": {
                    "planType": "FREE_UNLIMITED",
                    "daysRemaining": 9999,
                    "expiryDate": "100% Free & Unlimited"
                }
            })
        except Exception as e:
            return jsonify({"success": False, "error": f"Error scanning Flipkart reviews: {e}"}), 500

    # Admin endpoints
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

    # Template and static routes
    @app.route('/')
    @app.route('/search')
    @app.route('/app')
    def index():
        for d in [app.template_folder, app.static_folder, os.path.join(base_dir, 'templates'), os.path.join(base_dir, 'public'), os.path.join(root_dir, 'server', 'public'), os.path.join(root_dir, 'runpython_build', 'templates')]:
            if d and os.path.exists(os.path.join(d, 'index.html')):
                return send_from_directory(d, 'index.html')
        return "Flipkart Review Search Pro Web App", 200

    @app.route('/admin')
    @app.route('/admin/')
    @app.route('/admin.html')
    def admin():
        for d in [app.template_folder, app.static_folder, os.path.join(base_dir, 'templates'), os.path.join(base_dir, 'public'), os.path.join(root_dir, 'server', 'public'), os.path.join(root_dir, 'runpython_build', 'templates')]:
            if d and os.path.exists(os.path.join(d, 'admin.html')):
                return send_from_directory(d, 'admin.html')
        return "Admin Page", 200

    @app.route('/<path:filename>')
    def static_fallback(filename):
        for d in [app.static_folder, app.template_folder, os.path.join(base_dir, 'static'), os.path.join(base_dir, 'public'), os.path.join(root_dir, 'server', 'public'), os.path.join(root_dir, 'runpython_build', 'static')]:
            if d and os.path.exists(os.path.join(d, filename)):
                return send_from_directory(d, filename)
        return "Not Found", 404

    return app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
