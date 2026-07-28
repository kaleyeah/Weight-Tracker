/* A localhost origin for the browser tests.
   Not file:// — Web Locks and crypto.subtle require a secure context, and
   http://127.0.0.1 is one while file:// is not guaranteed to be. Testing the
   app on an origin where those APIs are missing would prove nothing about the
   app the athlete actually runs. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function start(port) {
  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    const rel = url === '/' ? '/index.html' : url;
    const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    const ext = path.extname(file);
    const type = ext === '.html' ? 'text/html; charset=utf-8'
      : ext === '.js' ? 'text/javascript; charset=utf-8'
        : ext === '.json' ? 'application/json' : 'text/plain';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port || 0, '127.0.0.1', () => resolve({
      server,
      origin: 'http://127.0.0.1:' + server.address().port,
      close: () => new Promise((r) => server.close(r)),
    }));
  });
}

module.exports = { start };
