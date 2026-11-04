// Tiny static web server, no installs. Run:  npm start   then open http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/' || url === '/simulator') { res.writeHead(302, { Location: '/simulator/' }); return res.end(); }
  const file = path.normalize(path.join(ROOT, url.endsWith('/') ? url + 'index.html' : url));
  if (!file.startsWith(ROOT) || !['simulator', 'src', 'docs'].includes(path.relative(ROOT, file).split(path.sep)[0])) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`\n  ShopNow voice AI simulator →  http://localhost:${PORT}\n  (Ctrl+C to stop)\n`));
