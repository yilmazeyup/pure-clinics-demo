// Runs an exported model in headless Chrome with onnxruntime-web, through the app's own scan code.
//
//   node train/browser_check.mjs runs/scin-pilot/export
//
// It compiles apps/mobile/src/scan/{run,model,analyze}.ts to plain JS, serves them with the export on 127.0.0.1, and
// opens train/browser_check.html twice: once with the model under /models/ (as public/models/ would be in the app),
// once without (the app must then keep its colour measures exactly). Everything stays on this machine except the
// pinned scripts from jsDelivr (onnxruntime-web, MediaPipe) and MediaPipe's model file.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..'); // ml/huidscan
const REPO = path.resolve(ROOT, '../..');
const require = createRequire(path.join(REPO, 'package.json'));
const WebSocket = require('ws');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const exportDir = path.resolve(process.argv[2] || 'runs/scin-pilot/export');
if (!fs.existsSync(path.join(exportDir, 'huidscan.json'))) {
  console.error(`no huidscan.json in ${exportDir}`);
  process.exit(2);
}
const exportUrl = '/x/' + path.relative(ROOT, exportDir).split(path.sep).join('/') + '/';

// 1. The app's scan code as plain ES modules.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'huidscan-check-'));
const appJs = path.join(tmp, 'app-scan');
execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), [
  path.join(REPO, 'apps/mobile/src/scan/run.ts'),
  '--outDir', appJs, '--rootDir', path.join(REPO, 'apps/mobile/src/scan'),
  '--module', 'esnext', '--moduleResolution', 'bundler', '--target', 'es2022', '--lib', 'es2022,dom,dom.iterable',
  '--skipLibCheck', '--strict', '--noEmitOnError',
], { stdio: 'inherit' });

// 2. A small static server. `withModel` decides whether /models/ exists.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.onnx': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg' };
function serve(withModel) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = null;
    if (url === '/check.html') file = path.join(HERE, 'browser_check.html');
    else if (url.startsWith('/x/')) file = path.join(ROOT, url.slice(3));
    else if (url.startsWith('/app-scan/')) {
      file = path.join(appJs, url.slice(10));
      if (!fs.existsSync(file)) file += '.js';
    } else if (url.startsWith('/models/') && withModel) file = path.join(exportDir, url.slice(8));
    const inside = file && (file.startsWith(ROOT) || file.startsWith(appJs) || file.startsWith(HERE));
    if (!inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// 3. Headless Chrome over the DevTools protocol.
async function chrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'huidscan-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
    proc.on('exit', () => reject(new Error('Chrome stopped: ' + buf)));
  });
  const port = new URL(wsUrl).port;
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r) => ws.on('open', r));
  let id = 0;
  const waiting = new Map();
  const logs = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
    } else if (msg.method === 'Runtime.exceptionThrown') logs.push('exception: ' + JSON.stringify(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') logs.push('console.error: ' + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    id += 1;
    waiting.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable');
  return {
    logs,
    async open(url, timeoutMs = 180000) {
      logs.length = 0;
      await send('Page.navigate', { url });
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        await new Promise((r) => setTimeout(r, 500));
        const r = await send('Runtime.evaluate', { expression: 'window.__result ? JSON.stringify(window.__result) : ""', returnByValue: true });
        const v = r.result?.result?.value;
        if (v) return JSON.parse(v);
      }
      throw new Error('timed out; console: ' + logs.join('\n'));
    },
    async close() {
      ws.close();
      const gone = new Promise((r) => proc.once('exit', r));
      proc.kill();
      await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
      try {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch {
        // a leftover temp profile is harmless
      }
    },
  };
}

const info = JSON.parse(fs.readFileSync(path.join(exportDir, 'huidscan.json'), 'utf8'));
const withModel = await serve(true);
const withoutModel = await serve(false);
const browser = await chrome();
let failed = false;
const check = (cond, label) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!cond) failed = true;
};
try {
  const a = await browser.open(`http://127.0.0.1:${withModel.address().port}/check.html?export=${encodeURIComponent(exportUrl)}`);
  if (!a.ok) throw new Error(a.error + '\n' + browser.logs.join('\n'));
  check(a.A.fp32.maxDiff < 1e-4, `A fp32 in onnxruntime-web = Python on ${a.A.fp32.crops} crops (max diff ${a.A.fp32.maxDiff.toExponential(1)})`);
  check(a.A.int8.maxDiff < 1e-4, `A int8 in onnxruntime-web = Python on ${a.A.int8.crops} crops (max diff ${a.A.int8.maxDiff.toExponential(1)})`);
  // B checks what the app's code is responsible for: cutting the same zones as Python. Resampling in a canvas and in
  // OpenCV differs by a grey level or two; more than 5 on average means the zones are misplaced.
  const worst = Math.max(...Object.values(a.B.pixelDiff));
  check(worst <= 5, `B model.ts cuts the same zones as Python: mean pixel difference per zone ${JSON.stringify(a.B.pixelDiff)} (of 255)`);
  const stable = a.B.maxDiff < 0.05;
  console.log(`${stable ? 'ok  ' : 'note'}  B model output on those crops (${a.B.file}, ${a.B.ms} ms for 7 zones): max difference to Python ${a.B.maxDiff.toFixed(3)}`
    + (stable ? '' : ' -- the model reacts strongly to tiny resampling differences; a model to ship should not'));
  console.log('     per zone (Python / browser):', Object.entries(a.B.perZone).map(([z, v]) => `${z} ${v.python}/${v.browser}`).join(', '));
  fs.writeFileSync(path.join(exportDir, 'reference', 'face_crops_browser.png'), Buffer.from(a.B.crops.split(',')[1], 'base64'));
  const counts = (head) => {
    const b = info.blend;
    return (typeof b === 'object' && b ? (b[head] ?? 0) : (b ?? 0.5)) > 0;
  };
  const wantAlso = (info.also || []).filter((x) => counts(x.head)).map((x) => x.file);
  check(JSON.stringify(a.D.loaded) === JSON.stringify(wantAlso),
    `D model.ts loads the also-models whose head counts: ${JSON.stringify(a.D.loaded)} of ${JSON.stringify((info.also || []).map((x) => x.file))}`);
  for (const [file, d] of Object.entries(a.D.perModel)) {
    check(d.maxDiff < 0.05, `D ${file} on the face's zones (${a.D.ms} ms): max difference to Python ${d.maxDiff.toFixed(3)}`);
    console.log('     per zone (Python / browser):', Object.entries(d.perZone).map(([z, v]) => `${z} ${v.python}/${v.browser}`).join(', '));
  }
  check(a.C.kind === 'found' && a.C.modelVersion === info.version, `C run.ts scanPhoto with model: ${a.C.kind}, model ${a.C.modelVersion} (${a.C.ms} ms)`);
  check(JSON.stringify(a.C.alsoUsed) === JSON.stringify(wantAlso), `C the scan averaged in ${JSON.stringify(a.C.alsoUsed)}`);
  console.log('     overall with model:', JSON.stringify(a.C.overall));

  const b = await browser.open(`http://127.0.0.1:${withoutModel.address().port}/check.html?model=none&export=${encodeURIComponent(exportUrl)}`);
  if (!b.ok) throw new Error(b.error + '\n' + browser.logs.join('\n'));
  check(b.C.kind === 'found' && b.C.modelVersion === null, `C run.ts scanPhoto without model: ${b.C.kind}, colour measures only`);
  console.log('     overall without model:', JSON.stringify(b.C.overall));
  const report = { exportDir, version: info.version, withModel: { ...a, B: { ...a.B, crops: undefined } }, withoutModel: b };
  fs.writeFileSync(path.join(exportDir, 'browser_check.json'), JSON.stringify(report, null, 2));
} catch (e) {
  console.error(String(e.stack || e));
  failed = true;
} finally {
  await browser.close();
  withModel.close();
  withoutModel.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
