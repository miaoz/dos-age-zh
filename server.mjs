import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server = http.createServer(async (req,res) => {
 try {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname.startsWith('/scores') || url.pathname === '/chat') {
   res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});
   res.end(JSON.stringify({error:'本地汉化版未连接原站在线服务。'})); return;
  }
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root)) {res.writeHead(403);res.end();return;}
  const data = await readFile(file);
  res.writeHead(200, {'Content-Type':types[path.extname(file)]||'application/octet-stream', 'Cache-Control':'no-cache'});
  res.end(req.method === 'HEAD' ? undefined : data);
 } catch {res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('文件不存在');}
});
server.listen(port,'127.0.0.1',()=>console.log(`幽林纪：http://127.0.0.1:${port}`));
