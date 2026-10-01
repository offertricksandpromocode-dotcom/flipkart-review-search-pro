import re
import json
import random
import time
import requests
from urllib.parse import urlparse, parse_qs, urljoin

class NameMatcher:
    @staticmethod
    def normalize_string(s):
        if not s:
            return ""
        s = s.lower().strip()
        s = re.sub(r'[^\w\s]', '', s)
        return re.sub(r'\s+', ' ', s).strip()

    @staticmethod
    def levenshtein_distance(s1, s2):
        if len(s1) < len(s2):
            return NameMatcher.levenshtein_distance(s2, s1)
        if len(s2) == 0:
            return len(s1)
        previous_row = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row
        return previous_row[-1]

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
        query_names = query_names or []
        query_locations = query_locations or []
        matches = []

        reviewer_name = review.get('reviewerName', '')
        review_location = review.get('location', '') or review.get('dateLocation', '')

        # 1. Match by Names
        for q_name in query_names:
            if not q_name or not q_name.strip():
                continue
            clean_q = q_name.strip()
            score = NameMatcher.calculate_similarity(clean_q, reviewer_name)
            is_exact = NameMatcher.normalize_string(clean_q) == NameMatcher.normalize_string(reviewer_name)

            if is_exact:
                matches.append({
                    "query": clean_q,
                    "matchedTarget": reviewer_name,
                    "matchType": "exact",
                    "score": 1.0
                })
            elif not exact_only and score >= threshold:
                matches.append({
                    "query": clean_q,
                    "matchedTarget": reviewer_name,
                    "matchType": "fuzzy",
                    "score": round(score, 2)
                })

        # 2. Match by Location / Area
        for q_loc in query_locations:
            if not q_loc or not q_loc.strip():
                continue
            clean_loc = q_loc.strip()
            norm_q_loc = NameMatcher.normalize_string(clean_loc)
            norm_rev_loc = NameMatcher.normalize_string(review_location)

            if norm_q_loc and (norm_q_loc in norm_rev_loc or norm_rev_loc in norm_q_loc):
                matches.append({
                    "query": clean_loc,
                    "matchedTarget": review_location,
                    "matchType": "exact",
                    "score": 1.0,
                    "matchedLocation": True
                })

        return matches


class PythonScraper:
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
            'Cache-Control': 'max-age=0',
            'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        }

    @classmethod
    def extract_url_from_text(cls, text):
        if not text:
            return ""
        match = re.search(r'https?://[^\s<>"\'()]+', str(text), re.IGNORECASE)
        return match.group(0) if match else text.strip()

    @classmethod
    def resolve_redirects(cls, url_str, max_hops=5):
        if not url_str:
            return ""
        current_url = url_str.strip()

        is_short = 'dl.flipkart.com' in current_url or 'fkrt.it' in current_url or 'fkrt.co' in current_url or '/s/' in current_url
        if not is_short and ('/p/' in current_url or '/product-reviews/' in current_url or 'pid=' in current_url):
            return current_url

        session = requests.Session()
        for _ in range(max_hops):
            try:
                resp = session.get(current_url, headers=cls.get_headers(), timeout=8, allow_redirects=False)
                if resp.status_code in (301, 302, 303, 307, 308) and 'Location' in resp.headers:
                    current_url = urljoin(current_url, resp.headers['Location'])
                    continue

                # Check JSON redirect
                if 'redirectUrl' in resp.text:
                    try:
                        data = resp.json()
                        r_url = data.get('RESPONSE', {}).get('redirectUrl') or data.get('redirectUrl')
                        if r_url and r_url.startswith('http'):
                            current_url = r_url
                            continue
                    except Exception:
                        match = re.search(r'"redirectUrl"\s*:\s*"(https?:[^"]+)"', resp.text)
                        if match:
                            current_url = match.group(1).replace('\\u0026', '&').replace('\\', '')
                            continue

                break
            except Exception as e:
                print(f"[Scraper] Redirect error: {e}")
                break

        return current_url

    @classmethod
    def normalize_universal_url(cls, raw_input):
        if not raw_input:
            return {"isValid": False, "error": "Empty URL provided."}

        extracted = cls.extract_url_from_text(raw_input)
        if not extracted:
            return {"isValid": False, "error": "No valid URL found in input."}

        resolved_url = cls.resolve_redirects(extracted)

        try:
            parsed = urlparse(resolved_url)
            host = parsed.netloc.lower()

            if 'flipkart.com' not in host and 'fkrt.it' not in host and 'fkrt.co' not in host:
                return {"isValid": False, "error": "Please enter a valid Flipkart product link."}

            qs = parse_qs(parsed.query)
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
                "productTitle": product_title
            }
        except Exception as e:
            return {"isValid": False, "error": f"Could not parse Flipkart URL: {e}"}

    @classmethod
    def fetch_html(cls, url):
        session = requests.Session()
        resp = session.get(url, headers=cls.get_headers(), timeout=12)
        return resp.text

    @classmethod
    def parse_reviews_from_html(cls, html, page_url):
        reviews = []

        # 1. Parse __INITIAL_STATE__
        match = re.search(r'window\.__INITIAL_STATE__\s*=\s*(\{.+?\});</script>', html, re.DOTALL)
        if match:
            try:
                state = json.loads(match.group(1))
                slots = state.get('multiWidgetState', {}).get('widgetsData', {}).get('slots', [])
                for slot in slots:
                    widget = slot.get('slotData', {}).get('widget', {})
                    comps = widget.get('data', {}).get('renderableComponents', [])
                    for comp in comps:
                        val = comp.get('value', {})
                        if val and (val.get('author') or val.get('reviewerName') or (val.get('text') and val.get('rating'))):
                            author = val.get('author') or val.get('reviewerName') or 'Anonymous'
                            rating = str(val.get('rating', 'N/A'))
                            title = val.get('title') or val.get('heading') or ''
                            body = val.get('text') or val.get('reviewText') or val.get('comment') or ''
                            is_certified = bool(val.get('certifiedBuyer') or val.get('isCertified'))
                            created_date = val.get('created') or val.get('submissionTime') or ''

                            loc_val = val.get('location')
                            location = ""
                            if isinstance(loc_val, str):
                                location = loc_val
                            elif isinstance(loc_val, dict):
                                city = loc_val.get('city', '')
                                st = loc_val.get('state', '')
                                location = f"{city}, {st}" if (city and st) else (city or st)

                            direct_url = page_url
                            if val.get('url'):
                                u = val['url']
                                direct_url = u if u.startswith('http') else f"https://www.flipkart.com{u}"
                            elif val.get('reviewId'):
                                qs = parse_qs(urlparse(page_url).query)
                                pid_val = qs.get('pid', [''])[0]
                                direct_url = f"https://www.flipkart.com/reviews/{pid_val}?reviewId={val['reviewId']}"

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
                print(f"[Scraper] State parse error: {e}")

        # 2. DOM regex fallback
        if not reviews:
            card_matches = re.findall(r'<div class="[^"]*(?:col _2wQAZ[A-Za-z0-9_-]*|cPHDOP)[^"]*"[\s\S]*?</div>\s*</div>\s*</div>', html)
            for card in card_matches:
                name_m = re.search(r'<p class="[^"]*(?:_2NsDsF|_2sc7ZR)[^"]*">([^<]+)</p>', card)
                if name_m:
                    name = name_m.group(1).strip()
                    rating_m = re.search(r'<div class="[^"]*_3LWZlK[^"]*">([0-9.]+)<', card)
                    rating = rating_m.group(1).strip() if rating_m else 'N/A'
                    title_m = re.search(r'<p class="[^"]*_2-N8zT[^"]*">([^<]+)</p>', card)
                    title = title_m.group(1).strip() if title_m else ''
                    body_m = re.search(r'<div class="[^"]*t-ZTKy[^"]*"><div><div class="[^"]*">([\s\S]*?)</div>', card)
                    body = re.sub(r'<[^>]+>', '', body_m.group(1)).strip() if body_m else ''
                    is_certified = 'Certified Buyer' in card
                    loc_m = re.search(r'<p class="[^"]*_2mcPpE[^"]*"><span>([^<]+)</span>', card)
                    location = loc_m.group(1).strip() if loc_m else ''

                    reviews.append({
                        "id": f"dom_{len(reviews)}_{int(time.time())}",
                        "reviewerName": name,
                        "location": location,
                        "rating": rating,
                        "title": title,
                        "body": body,
                        "isCertified": is_certified,
                        "dateLocation": location,
                        "directUrl": page_url
                    })

        has_next = '<span>Next</span>' in html or '&page=' in html or len(reviews) >= 10
        return reviews, has_next

    @classmethod
    def search_reviews(cls, review_url, query_names=None, query_locations=None, exact_only=False, threshold=0.75, max_pages_per_section=25, search_scope='ALL_SECTIONS'):
        query_names = query_names or []
        query_locations = query_locations or []

        sections = [
            {"sortOrder": "MOST_RECENT", "name": "Latest / Recent Posts"},
            {"sortOrder": "MOST_HELPFUL", "name": "Most Helpful"},
            {"sortOrder": "POSITIVE_FIRST", "name": "Positive Reviews"},
            {"sortOrder": "NEGATIVE_FIRST", "name": "Negative Reviews"}
        ]

        if search_scope and search_scope != 'ALL_SECTIONS':
            sections = [s for s in sections if s['sortOrder'] == search_scope] or sections

        matched_reviews = []
        seen_ids = set()
        total_reviews_scanned = 0
        total_pages_scanned = 0

        for section in sections:
            current_page = 1
            has_next = True

            while current_page <= max_pages_per_section and has_next:
                total_pages_scanned += 1
                parsed_url = urlparse(review_url)
                qs = parse_qs(parsed_url.query)
                qs['page'] = [str(current_page)]
                qs['sortOrder'] = [section['sortOrder']]

                query_str = '&'.join(f"{k}={v[0]}" for k, v in qs.items())
                target_url = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}?{query_str}"

                try:
                    html = cls.fetch_html(target_url)
                    revs, has_next = cls.parse_reviews_from_html(html, target_url)

                    for r in revs:
                        dedupe_key = f"{r['reviewerName'].lower()}_{r.get('title', '')[:15]}"
                        if dedupe_key in seen_ids:
                            continue
                        seen_ids.add(dedupe_key)
                        total_reviews_scanned += 1

                        matches = NameMatcher.match_review(r, query_names, query_locations, exact_only, threshold)
                        for m in matches:
                            matched_reviews.append({
                                **r,
                                "foundInSection": section['name'],
                                "searchedQuery": m['query'],
                                "matchedTarget": m['matchedTarget'],
                                "matchType": m['matchType'],
                                "similarityScore": m['score'],
                                "matchedLocation": m.get('matchedLocation', False)
                            })

                    if not revs:
                        break
                    current_page += 1
                    time.sleep(0.2)
                except Exception as e:
                    print(f"[Scraper] Error scraping {section['name']} page {current_page}: {e}")
                    break

        return {
            "matchedReviews": matched_reviews,
            "totalReviewsScanned": total_reviews_scanned,
            "totalPagesScanned": total_pages_scanned
        }
