"""Real Apache integration, isolated local HTTP/TLS virtual hosts; no production requests."""
import contextlib
import http.client
import os
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
APEX = 'everyrealestatecalculator.com'
CRM = 'realtorcrm.' + APEX

def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

with tempfile.TemporaryDirectory(prefix='crm-apache-') as tmp:
    base = Path(tmp)
    site = base / 'public_html'
    shutil.copytree(ROOT / 'website/dist-production', site)
    shutil.copy(ROOT / 'deployment/website.htaccess', site / '.htaccess')
    shutil.copytree(ROOT / 'deployment/dist-crm', site / 'realtorcrm')
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', str(base/'key.pem'), '-out', str(base/'cert.pem')], check=True, capture_output=True)
    http_port, tls_port = port(), port()
    modules = ['mpm_event', 'authz_core', 'authz_host', 'dir', 'mime', 'rewrite', 'headers', 'ssl', 'socache_shmcb']
    config = f'ServerRoot "{base}"\nServerName localhost\nPidFile "{base}/apache.pid"\nErrorLog "{base}/error.log"\nListen 127.0.0.1:{http_port}\nListen 127.0.0.1:{tls_port}\n'
    for module in modules:
        config += f'LoadModule {module}_module /usr/lib/apache2/modules/mod_{module}.so\n'
    config += f'TypesConfig /etc/mime.types\nDirectoryIndex index.html\n<Directory "{site}">\nAllowOverride All\nRequire all granted\nOptions -Indexes\n</Directory>\n'
    for listen in [http_port, tls_port]:
        for host, docroot in [(APEX, site), (CRM, site/'realtorcrm'), ('inherited.'+APEX, site)]:
            config += f'<VirtualHost 127.0.0.1:{listen}>\nServerName {host}\n'
            if host == APEX:
                config += f'ServerAlias www.{APEX}\n'
            config += f'DocumentRoot "{docroot}"\n'
            if listen == tls_port:
                config += f'SSLEngine on\nSSLCertificateFile "{base}/cert.pem"\nSSLCertificateKeyFile "{base}/key.pem"\n'
            config += '</VirtualHost>\n'
    conf = base/'httpd.conf'
    conf.write_text(config)
    subprocess.run(['apache2', '-t', '-f', str(conf)], check=True)
    process = subprocess.Popen(['apache2', '-X', '-f', str(conf)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    def get(host, route, tls=True):
        conn = http.client.HTTPSConnection('127.0.0.1', tls_port, context=ssl._create_unverified_context(), timeout=5) if tls else http.client.HTTPConnection('127.0.0.1', http_port, timeout=5)
        try:
            conn.request('GET', route, headers={'Host':host})
            response = conn.getresponse()
            body = response.read()
            return response.status, response.getheader('Location'), body
        finally:
            conn.close()
    try:
        for _ in range(50):
            if process.poll() is not None:
                raise RuntimeError((base/'error.log').read_text())
            try:
                get(APEX, '/')
                break
            except (OSError, http.client.HTTPException):
                time.sleep(.1)
        checks = 0
        for host in [APEX, 'www.'+APEX, APEX.upper()]:
            for tls in [False, True]:
                for old in ['realtorcrm', 'realtoros']:
                    for suffix in ['', '/', '/index.html']:
                        status, location, _ = get(host, '/'+old+suffix+'?utm_source=migration', tls)
                        assert (status, location) == (301, f'https://{APEX}/real-estate-crm/?utm_source=migration'), (host, old, suffix, status, location)
                        checks += 1
        for route in ['/real-estate-crm/', '/real-estate-crm/realtorcrm.css']:
            status, location, _ = get(APEX, route)
            assert status == 200 and location is None, (route, status, location)
            checks += 1
        # Actual nested CRM document root: auth callback, SPA and worker retain behavior.
        for route in ['/', '/?code=offline-test', '/?mode=create', '/sw.js', '/manifest.webmanifest', '/assets/js/config.js']:
            status, location, _ = get(CRM, route)
            assert status == 200 and location is None, (CRM, route, status, location)
            checks += 1
        # Even if root website rules are inherited, non-main hosts never migrate.
        for host in [CRM, 'inherited.'+APEX]:
            for route in ['/realtorcrm/', '/realtorcrm/index.html', '/realtorcrm/sw.js', '/realtoros/']:
                status, location, _ = get(host, route)
                assert not location or '/real-estate-crm/' not in location, (host, route, status, location)
                checks += 1
        for route in ['/realtorcrm/sw.js', '/realtorcrm/manifest.webmanifest', '/realtorcrm/assets/js/config.js']:
            status, location, _ = get(APEX, route)
            assert status == 200 and location is None, (route, status, location)
            checks += 1
        print(f'PASS: {checks} real Apache HTTP/TLS redirect, host isolation, asset and auth/PWA checks (local only).')
    finally:
        process.terminate()
        with contextlib.suppress(subprocess.TimeoutExpired):
            process.wait(timeout=5)
        if process.poll() is None:
            process.kill()
        if (base/'error.log').exists():
            print((base/'error.log').read_text())
