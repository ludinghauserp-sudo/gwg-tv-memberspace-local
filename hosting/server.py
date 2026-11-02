#!/usr/bin/env python3
"""Node-free hosting adapter for the existing GWG local browser interface.

Run behind the supplied authenticated HTTPS proxy; never expose this port publicly.
Only Python's standard library is used. Workspace/backup format matches the Mac app.
"""
import base64
import binascii
import json
import mimetypes
import os
from pathlib import Path
import sqlite3
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

MAX_BODY = 96 * 1024 * 1024
MAX_STATE = 64 * 1024 * 1024
MAX_PHOTO = 5 * 1024 * 1024
FORMAT = 'GWG-TV-Local-v1'
PHOTO_TYPES = {'image/jpeg', 'image/png', 'image/webp'}


def encode(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def valid_state(value):
    if not isinstance(value, dict) or not isinstance(value.get('gear'), list) or not isinstance(value.get('plans'), list):
        raise ValueError('Invalid workspace data.')
    result = encode(value)
    if len(result) >= MAX_STATE:
        raise ValueError('Workspace must be under 64 MB.')
    return result


def photo_id(value):
    if not isinstance(value, str) or str(uuid.UUID(value)) != value:
        raise ValueError('Invalid photo ID.')
    return value


def photo_type(data):
    if not 8 < len(data) <= MAX_PHOTO:
        raise ValueError('Photos must be under 5 MB.')
    if data.startswith(b'\xff\xd8'):
        return 'image/jpeg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    raise ValueError('Use a JPEG, PNG or WebP photo.')


class Workspace:
    def __init__(self, root):
        self.root = root
        self.photos = root / 'photos'
        self.photos.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(root / 'workspace.sqlite3', timeout=20, check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload BLOB NOT NULL)')
        self.db.execute("INSERT OR IGNORE INTO workspace VALUES(1,0,'null')")
        self.db.execute('CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,mime TEXT NOT NULL)')
        self.db.commit()

    def snapshot(self):
        revision, payload = self.db.execute('SELECT revision,payload FROM workspace WHERE id=1').fetchone()
        return {'revision': revision, 'state': json.loads(payload)}

    def backup(self):
        result = dict(self.snapshot(), format=FORMAT, photos=[])
        for key, mime in self.db.execute('SELECT id,mime FROM photos'):
            path = self.photos / photo_id(key)
            if path.is_file():
                result['photos'].append({'id': key, 'mime': mime, 'data': base64.b64encode(path.read_bytes()).decode('ascii')})
        return result

    def restore(self, value):
        if not isinstance(value, dict) or value.get('format') != FORMAT:
            raise ValueError('Choose a GWG TV complete backup.')
        state = valid_state(value.get('state'))
        photos = value.get('photos', [])
        if not isinstance(photos, list):
            raise ValueError('Invalid backup photos.')
        incoming = {}
        for photo in photos:
            key = photo_id(photo['id'])
            mime = photo['mime']
            data = base64.b64decode(photo['data'], validate=True)
            if mime not in PHOTO_TYPES or photo_type(data) != mime or key in incoming:
                raise ValueError('Invalid backup photo.')
            path = self.photos / key
            if path.exists() and path.read_bytes() != data:
                raise ValueError('Backup has a photo ID conflict. Import into a new workspace instead.')
            incoming[key] = (mime, data)
        safety = self.root / ('before-import-' + str(time.time_ns()) + '.json')
        safety.write_bytes(encode(self.backup()))
        # Photos are immutable: extra files after a failed import are harmless.
        # The state and photo index are committed together in SQLite.
        with self.db:
            for key, (mime, data) in incoming.items():
                self.write_photo(key, data)
                self.db.execute('INSERT OR REPLACE INTO photos VALUES(?,?)', (key, mime))
            self.db.execute('UPDATE workspace SET revision=revision+1,payload=? WHERE id=1', (state,))

    def write_photo(self, key, data):
        path = self.photos / key
        if not path.exists():
            temp = self.photos / (key + '.tmp')
            temp.write_bytes(data)
            temp.replace(path)


class Handler(BaseHTTPRequestHandler):
    server_version = 'GWGLocalHost/1.0'

    def log_message(self, *_):
        # No URLs, query strings or authorization headers in the application log.
        pass

    def send_data(self, code, data=b'', content_type='application/json', extra=None):
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        for name, value in (extra or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def reply(self, value, code=200):
        self.send_data(code, encode(value))

    def do_GET(self):
        self.dispatch()

    def do_HEAD(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def dispatch(self):
        try:
            if self.headers.get('Host') != self.server.public_host:
                self.reply({'error': 'Unexpected host.'}, 403)
                return
            if self.command == 'POST' and self.headers.get('Origin') != self.server.public_origin:
                self.reply({'error': 'Save changes from this workspace only.'}, 403)
                return
            request = urlsplit(self.path)
            path = unquote(request.path)
            body = b''
            if self.command == 'POST':
                if self.headers.get('Transfer-Encoding'):
                    self.reply({'error': 'Content-Length required.'}, 411)
                    return
                size = int(self.headers.get('Content-Length', '-1'))
                if not 0 <= size <= MAX_BODY:
                    self.reply({'error': 'Upload exceeds the 96 MB limit.'}, 413)
                    return
                self.connection.settimeout(60)
                body = self.rfile.read(size)
                if len(body) != size:
                    raise ValueError('Incomplete upload.')
            store = self.server.workspace
            with store.lock:
                if path == '/local/health' and self.command in ('GET', 'HEAD'):
                    self.reply({'ok': True, 'runtime': 'Python', 'hosted': True})
                    return
                if path == '/local/state':
                    if self.command in ('GET', 'HEAD'):
                        self.reply(store.snapshot())
                        return
                    value = json.loads(body)
                    expected = value.get('expectedRevision')
                    if type(expected) is not int:
                        raise ValueError('Invalid workspace revision.')
                    state = valid_state(value.get('state'))
                    with store.db:
                        saved = store.db.execute('UPDATE workspace SET revision=revision+1,payload=? WHERE id=1 AND revision=?', (state, expected)).rowcount
                    self.reply({'success': True} if saved else {'error': 'Workspace changed.'}, 200 if saved else 409)
                    return
                if path == '/local/backup':
                    if self.command in ('GET', 'HEAD'):
                        self.send_data(200, encode(store.backup()), extra={'Content-Disposition': 'attachment; filename=GWG-TV-Workspace.gwgbackup.json'})
                    else:
                        store.restore(json.loads(body))
                        self.reply({'success': True})
                    return
                if path == '/api/members/photos':
                    if self.command == 'POST':
                        mime = photo_type(body)
                        key = str(uuid.uuid4())
                        store.write_photo(key, body)
                        with store.db:
                            store.db.execute('INSERT INTO photos VALUES(?,?)', (key, mime))
                        self.reply({'id': key, 'url': '/api/members/photos?id=' + key})
                    else:
                        key = photo_id(parse_qs(request.query).get('id', [''])[0])
                        photo = store.db.execute('SELECT mime FROM photos WHERE id=?', (key,)).fetchone()
                        file = store.photos / key
                        if not photo or not file.is_file():
                            self.reply({'error': 'Photo not found.'}, 404)
                        else:
                            self.send_data(200, file.read_bytes(), photo[0])
                    return
            if self.command == 'POST':
                self.reply({'error': 'Unknown endpoint.'}, 404)
                return
            if path.startswith(('/api/', '/local/')):
                self.reply({'error': 'Endpoint not found.'}, 404)
                return
            root = self.server.web_root
            file = (root / path.lstrip('/')).resolve()
            if not file.is_relative_to(root):
                self.reply({'error': 'Forbidden.'}, 403)
                return
            if path == '/' or (path.startswith('/members') and not file.is_file()):
                file = root / 'index.html'
            if not file.is_file():
                self.reply({'error': 'Not found.'}, 404)
                return
            mime = {'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml'}.get(file.suffix) or mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
            self.send_data(200, file.read_bytes(), mime)
        except (ValueError, KeyError, TypeError, binascii.Error):
            self.reply({'error': 'Invalid request or backup data.'}, 400)
        except (OSError, sqlite3.Error):
            self.reply({'error': 'Could not read or save the workspace. Check the server storage.'}, 500)


def main():
    origin = os.environ.get('GWG_PUBLIC_ORIGIN', '').rstrip('/')
    parsed = urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username:
        raise SystemExit('Set GWG_PUBLIC_ORIGIN to the HTTPS site origin, for example https://gear.example.com')
    root = Path(os.environ.get('GWG_WEB_ROOT', Path(__file__).resolve().parents[1] / 'www')).resolve()
    if not (root / 'index.html').is_file():
        raise SystemExit('GWG_WEB_ROOT must contain the existing built www/index.html.')
    store = Workspace(Path(os.environ.get('GWG_DATA_DIR', '/data')).resolve())
    http = ThreadingHTTPServer((os.environ.get('GWG_BIND', '127.0.0.1'), int(os.environ.get('GWG_PORT', '8080'))), Handler)
    http.workspace = store
    http.public_origin = origin
    http.public_host = parsed.netloc
    http.web_root = root
    print('GWG hosting adapter started behind the authenticated HTTPS proxy.', flush=True)
    try:
        http.serve_forever()
    finally:
        http.server_close()
        store.db.close()


if __name__ == '__main__':
    main()
