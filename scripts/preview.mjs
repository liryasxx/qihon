import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { handleContent } from '../server/content.mjs';
import { sendNodeResponse } from '../server/node.mjs';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const root = path.resolve('dist');
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/content') return sendNodeResponse(await handleContent(url, req.method), res);
  try {
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
    let data;
    try { data = await readFile(file); res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); }
    catch { data = await readFile(path.join(root, 'index.html')); res.setHeader('Content-Type', 'text/html'); }
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4173, '0.0.0.0', () => console.log('Local: http://localhost:4173'));
