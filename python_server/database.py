import os
import json
import time
import hashlib
import random
import string
from datetime import datetime

class PythonDatabase:
    def __init__(self, mongo_uri=None):
        self.data_dir = os.path.join(os.path.dirname(__file__), 'data')
        self.db_file = os.path.join(self.data_dir, 'database.json')
        self.mongo_uri = mongo_uri or os.environ.get('MONGO_URI') or "mongodb+srv://offertricksandpromocode_db_user:KMhZIVuxHEmSiSku@cluster0.4mrmksu.mongodb.net/?retryWrites=true&w=majority"
        
        self.data = {
            "keys": [],
            "logs": [],
            "adminPasswordHash": self.hash_password("mk@123")
        }
        
        self.is_mongo = False
        self.mongo_db = None
        self.init_database()

    def hash_password(self, password):
        return hashlib.sha256(password.encode('utf-8')).hexdigest()

    def init_database(self):
        # 1. Load local copy if exists
        if os.path.exists(self.db_file):
            try:
                with open(self.db_file, 'r', encoding='utf-8') as f:
                    local_data = json.load(f)
                    if isinstance(local_data, dict):
                        self.data.update(local_data)
            except Exception as e:
                print(f"[DB] Error loading local file: {e}")

        # 2. Connect to MongoDB Atlas
        if self.mongo_uri:
            try:
                from pymongo import MongoClient
                client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=5000)
                self.mongo_db = client.get_database('flipkart_review_pro')
                # Test connection
                self.mongo_db.command('ping')
                self.is_mongo = True
                print("[DB] Connected to MongoDB Atlas Cloud Database.")
                self.load_from_mongo()
            except Exception as e:
                print(f"[DB] MongoDB Atlas connection error (fallback to local JSON): {e}")

    def load_from_mongo(self):
        if not self.is_mongo or not self.mongo_db:
            return
        try:
            # Load keys
            keys_cursor = self.mongo_db.keys.find()
            mongo_keys = []
            for k in keys_cursor:
                k.pop('_id', None)
                mongo_keys.append(k)
            if mongo_keys:
                self.data['keys'] = mongo_keys

            # Load settings / admin hash
            settings = self.mongo_db.settings.find_one({'_id': 'admin_settings'})
            if settings and 'adminPasswordHash' in settings:
                self.data['adminPasswordHash'] = settings['adminPasswordHash']

            # Load logs
            logs_cursor = self.mongo_db.logs.find().sort('timestamp', -1).limit(100)
            mongo_logs = []
            for l in logs_cursor:
                l.pop('_id', None)
                mongo_logs.append(l)
            if mongo_logs:
                self.data['logs'] = mongo_logs

            self.save_local()
        except Exception as e:
            print(f"[DB] Error loading from MongoDB: {e}")

    def save_local(self):
        try:
            os.makedirs(self.data_dir, exist_ok=True)
            with open(self.db_file, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, indent=2)
        except Exception as e:
            print(f"[DB] Error saving local file: {e}")

    def sync_key_to_mongo(self, key_record):
        if not self.is_mongo or not self.mongo_db:
            return
        try:
            k_copy = dict(key_record)
            k_id = k_copy.get('id', k_copy.get('key'))
            self.mongo_db.keys.update_one({'id': k_id}, {'$set': k_copy}, upsert=True)
        except Exception as e:
            print(f"[DB] Error syncing key to MongoDB: {e}")

    def log_activity(self, action, details):
        log_item = {
            "id": f"log_{int(time.time()*1000)}",
            "action": action,
            "details": details,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        self.data['logs'].insert(0, log_item)
        if len(self.data['logs']) > 500:
            self.data['logs'] = self.data['logs'][:500]

        if self.is_mongo and self.mongo_db:
            try:
                self.mongo_db.logs.insert_one(dict(log_item))
            except Exception:
                pass

        self.save_local()

    def verify_admin(self, password):
        return self.hash_password(password) == self.data['adminPasswordHash']

    def update_admin_password(self, old_password, new_password):
        if not self.verify_admin(old_password):
            return {"success": False, "error": "Current password is incorrect."}
        if not new_password or len(new_password) < 4:
            return {"success": False, "error": "New password must be at least 4 characters."}
        
        self.data['adminPasswordHash'] = self.hash_password(new_password)
        if self.is_mongo and self.mongo_db:
            try:
                self.mongo_db.settings.update_one(
                    {'_id': 'admin_settings'},
                    {'$set': {'adminPasswordHash': self.data['adminPasswordHash']}},
                    upsert=True
                )
            except Exception:
                pass
        self.log_activity('ADMIN_PASSWORD_CHANGED', 'Admin master password updated.')
        self.save_local()
        return {"success": True}

    def generate_key(self, plan_type, days, client_name='User', max_devices=1):
        days_code = 'LIFE' if plan_type == 'LIFETIME' else f"{days}D"
        rand1 = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        rand2 = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        key = f"FKPRO-{days_code}-{rand1}-{rand2}"

        now_ms = int(time.time() * 1000)
        new_key_record = {
            "id": f"key_{now_ms}_{rand1[:4]}",
            "key": key,
            "planType": plan_type,
            "days": 36500 if plan_type == 'LIFETIME' else int(days),
            "clientName": (client_name or 'User').strip(),
            "maxDevices": int(max_devices) or 1,
            "createdAt": now_ms,
            "expiresAt": None,
            "status": "ACTIVE",
            "activatedDevices": [],
            "firstActivatedAt": None
        }

        self.data['keys'].insert(0, new_key_record)
        self.sync_key_to_mongo(new_key_record)
        self.log_activity('KEY_GENERATED', f"Key generated for {client_name} ({plan_type} - {days_code})")
        self.save_local()
        return new_key_record

    def activate_key(self, key, device_id=None, client_name=''):
        if not key:
            return {"success": False, "error": "License key is required."}
        clean_key = key.strip().upper()

        record = next((k for k in self.data['keys'] if k['key'].upper() == clean_key), None)
        if not record:
            return {"success": False, "error": "Invalid license key. Key not found in database."}

        if record.get('status') == 'REVOKED':
            return {"success": False, "error": "This license key has been revoked by the administrator."}

        now_ms = int(time.time() * 1000)

        if record.get('expiresAt') and now_ms >= record['expiresAt'] and record.get('planType') != 'LIFETIME':
            record['status'] = 'EXPIRED'
            self.sync_key_to_mongo(record)
            self.save_local()
            return {"success": False, "error": "This license key has expired."}

        if device_id:
            if 'activatedDevices' not in record:
                record['activatedDevices'] = []
            if device_id not in record['activatedDevices']:
                if len(record['activatedDevices']) >= record.get('maxDevices', 1):
                    return {"success": False, "error": f"Device limit reached (Max: {record.get('maxDevices', 1)}). Key is already bound to another device."}
                record['activatedDevices'].append(device_id)

        if not record.get('firstActivatedAt'):
            record['firstActivatedAt'] = now_ms
            if record.get('planType') == 'LIFETIME':
                record['expiresAt'] = now_ms + (100 * 365 * 24 * 60 * 60 * 1000)
            else:
                record['expiresAt'] = now_ms + (record.get('days', 30) * 24 * 60 * 60 * 1000)

        if client_name and record.get('clientName') == 'User':
            record['clientName'] = client_name

        self.sync_key_to_mongo(record)
        self.log_activity('KEY_ACTIVATED', f"Key {clean_key} activated by device {device_id or 'web'}")
        self.save_local()

        days_remaining = 9999 if record.get('planType') == 'LIFETIME' else max(0, int((record['expiresAt'] - now_ms) / (1000 * 60 * 60 * 24)) + 1)
        exp_date_str = 'Lifetime Access' if record.get('planType') == 'LIFETIME' else datetime.fromtimestamp(record['expiresAt'] / 1000).strftime('%d/%m/%Y')

        return {
            "success": True,
            "planType": record.get('planType'),
            "days": record.get('days'),
            "daysRemaining": days_remaining,
            "expiresAt": record.get('expiresAt'),
            "expiryDate": exp_date_str,
            "clientName": record.get('clientName')
        }

    def verify_license(self, key, device_id=None):
        if not key:
            return {"isValid": False, "error": "No license key provided."}
        clean_key = key.strip().upper()

        record = next((k for k in self.data['keys'] if k['key'].upper() == clean_key), None)
        if not record:
            return {"isValid": False, "error": "License key not found in database."}

        if record.get('status') == 'REVOKED':
            return {"isValid": False, "isRevoked": True, "error": "This license has been revoked by the administrator."}

        now_ms = int(time.time() * 1000)

        if not record.get('firstActivatedAt'):
            return {
                "isValid": True,
                "isActivated": False,
                "planType": record.get('planType'),
                "days": record.get('days'),
                "daysRemaining": 9999 if record.get('planType') == 'LIFETIME' else record.get('days'),
                "expiryDate": "Lifetime Access" if record.get('planType') == 'LIFETIME' else f"{record.get('days')} Days (Starts on first use)",
                "clientName": record.get('clientName')
            }

        if record.get('expiresAt') and now_ms >= record['expiresAt'] and record.get('planType') != 'LIFETIME':
            record['status'] = 'EXPIRED'
            self.sync_key_to_mongo(record)
            self.save_local()
            exp_date_str = datetime.fromtimestamp(record['expiresAt'] / 1000).strftime('%d/%m/%Y')
            return {
                "isValid": False,
                "isExpired": True,
                "error": f"Your membership expired on {exp_date_str} (0 days remaining). Please renew your subscription.",
                "daysRemaining": 0,
                "expiryDate": exp_date_str,
                "planType": record.get('planType')
            }

        days_remaining = 9999 if record.get('planType') == 'LIFETIME' else max(0, int((record['expiresAt'] - now_ms) / (1000 * 60 * 60 * 24)) + 1)
        exp_date_str = 'Lifetime Access' if record.get('planType') == 'LIFETIME' else datetime.fromtimestamp(record['expiresAt'] / 1000).strftime('%d/%m/%Y')

        return {
            "isValid": True,
            "isActivated": True,
            "planType": record.get('planType'),
            "daysRemaining": days_remaining,
            "expiresAt": record.get('expiresAt'),
            "expiryDate": exp_date_str,
            "clientName": record.get('clientName')
        }

    def get_dashboard_stats(self):
        keys = self.data.get('keys', [])
        now_ms = int(time.time() * 1000)

        total_keys = len(keys)
        active_keys = 0
        expired_keys = 0
        total_devices = 0

        for k in keys:
            if k.get('status') == 'ACTIVE':
                if k.get('expiresAt') and now_ms > k['expiresAt'] and k.get('planType') != 'LIFETIME':
                    expired_keys += 1
                else:
                    active_keys += 1
            else:
                expired_keys += 1
            total_devices += len(k.get('activatedDevices', []))

        return {
            "totalKeys": total_keys,
            "activeKeys": active_keys,
            "expiredKeys": expired_keys,
            "totalDevices": total_devices,
            "recentKeys": keys[:10],
            "logs": self.data.get('logs', [])[:50]
        }

    def revoke_key(self, key_id):
        record = next((k for k in self.data['keys'] if k.get('id') == key_id or k.get('key') == key_id), None)
        if not record:
            return {"success": False, "error": "Key not found."}
        record['status'] = 'REVOKED'
        self.sync_key_to_mongo(record)
        self.log_activity('KEY_REVOKED', f"License key {record['key']} revoked.")
        self.save_local()
        return {"success": True}

    def restore_key(self, key_id):
        record = next((k for k in self.data['keys'] if k.get('id') == key_id or k.get('key') == key_id), None)
        if not record:
            return {"success": False, "error": "Key not found."}
        record['status'] = 'ACTIVE'
        self.sync_key_to_mongo(record)
        self.log_activity('KEY_RESTORED', f"License key {record['key']} restored to ACTIVE.")
        self.save_local()
        return {"success": True}

    def extend_key(self, key_id, extra_days):
        record = next((k for k in self.data['keys'] if k.get('id') == key_id or k.get('key') == key_id), None)
        if not record:
            return {"success": False, "error": "Key not found."}
        days_to_add = int(extra_days)
        if days_to_add <= 0:
            return {"success": False, "error": "Invalid days count."}

        now_ms = int(time.time() * 1000)
        current_exp = record.get('expiresAt') or now_ms
        base_time = max(now_ms, current_exp)
        record['expiresAt'] = base_time + (days_to_add * 24 * 60 * 60 * 1000)
        record['status'] = 'ACTIVE'
        record['days'] = record.get('days', 0) + days_to_add

        self.sync_key_to_mongo(record)
        self.log_activity('KEY_EXTENDED', f"Extended {record['key']} by +{days_to_add} days.")
        self.save_local()
        return {"success": True, "newExpiresAt": record['expiresAt']}

    def delete_key(self, key_id):
        idx = next((i for i, k in enumerate(self.data['keys']) if k.get('id') == key_id or k.get('key') == key_id), None)
        if idx is None:
            return {"success": False, "error": "Key not found."}
        removed = self.data['keys'].pop(idx)
        if self.is_mongo and self.mongo_db:
            try:
                self.mongo_db.keys.delete_one({'id': removed.get('id', removed.get('key'))})
            except Exception:
                pass
        self.log_activity('KEY_DELETED', f"Deleted key {removed.get('key')}")
        self.save_local()
        return {"success": True}

db = PythonDatabase()
