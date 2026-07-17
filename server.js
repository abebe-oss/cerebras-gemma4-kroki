const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const MODEL = process.env.CEREBRAS_MODEL || 'gemma-4-31b';
const API_URL = 'https://api.cerebras.ai/v1/chat/completions';

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function encodeKroki(text) {
  const compressed = zlib.deflateSync(Buffer.from(text, 'utf8'));
  return compressed.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return map[ext] || 'text/plain; charset=utf-8';
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, buffer) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    res.end(buffer);
  });
}

async function handleChat(req, res) {
  try {
    const body = await readBody(req);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const apiKey = process.env.CEREBRAS_API_KEY;

    if (!prompt) {
      sendJson(res, 400, { error: 'Prompt is required.' });
      return;
    }

    if (!apiKey) {
      sendJson(res, 500, {
        error: 'Missing CEREBRAS_API_KEY. Set it in your shell or in a local .env file before starting the server.'
      });
      return;
    }

    const systemMessage = [
      'You are a helpful AI assistant for software architecture and technical explanation.',
      'Answer every user question strictly in Afaan Oromoo.',
      'If the user asks for diagrams, return a fenced code block with the most appropriate engine such as excalidraw, mermaid, plantuml, dbml, d2, or svgbob.',
      'Prefer Excalidraw for natural visual figures, Mermaid for flowcharts, and PlantUML for architecture/UML. Do not answer in English unless the user explicitly requests another language.'
    ].join(' ');

    const completionResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 800
      })
    });

    const data = await completionResponse.json();

    if (!completionResponse.ok) {
      const remoteMessage = data?.message || data?.error?.message || 'Cerebras request failed.';
      const detail = data?.code ? ` (${data.code})` : '';
      sendJson(res, completionResponse.status, {
        error: `${remoteMessage}${detail}`
      });
      return;
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      sendJson(res, 502, { error: 'No content returned by Cerebras.' });
      return;
    }

    sendJson(res, 200, { answer: content });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
}

async function handleKroki(req, res) {
  try {
    const body = await readBody(req);
    const diagram = typeof body.diagram === 'string' ? body.diagram.trim() : '';
    const engine = typeof body.engine === 'string' ? body.engine.trim().toLowerCase() : 'mermaid';
    const format = typeof body.format === 'string' ? body.format.trim().toLowerCase() : 'svg';

    if (!diagram) {
      sendJson(res, 400, { error: 'Diagram source is required.' });
      return;
    }

    const encoded = encodeKroki(diagram);
    const url = `https://kroki.io/${encodeURIComponent(engine)}/${format}/${encoded}`;
    const krokiResponse = await fetch(url);

    if (!krokiResponse.ok) {
      const text = await krokiResponse.text();
      sendJson(res, 502, {
        error: 'Kroki render failed.',
        details: text
      });
      return;
    }

    const contentType = krokiResponse.headers.get('content-type') || 'text/plain; charset=utf-8';
    const bodyBuffer = Buffer.from(await krokiResponse.arrayBuffer());
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(bodyBuffer);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || 'Failed to render diagram.' });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, model: MODEL });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    handleChat(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/render-diagram') {
    handleKroki(req, res);
    return;
  }

  const filePath = url.pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, url.pathname.replace(/^\//, ''));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      serveFile(res, filePath);
    } else {
      serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!process.env.CEREBRAS_API_KEY) {
    console.warn('Warning: CEREBRAS_API_KEY is not set. Copy .env.example to .env or export it before using the chat endpoint.');
  }
});
