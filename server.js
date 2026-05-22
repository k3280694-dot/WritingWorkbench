const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  name = path.normalize(name).replace(/^([/\\])+/, '');
  const file = path.resolve(root, name);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(4173, '127.0.0.1', () => {
  console.log('WritingWorkbench running at http://127.0.0.1:4173/index.html');
});
