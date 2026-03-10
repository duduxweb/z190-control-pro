/**
 * Z190 Control Madruga — Server v2.0
 * Servidor Express standalone para controle da câmera Sony PXW-Z190.
 *
 * Funcionalidades:
 *  - Proxy reverso para a câmera com Basic Auth injetado
 *  - API REST para configuração (IP, usuário, senha) com persistência em config.json
 *  - API REST para leitura de status da câmera (via proxy)
 *  - Servir frontend estático (public/)
 *
 * Uso:
 *   npm install
 *   node server.js
 *   Abrir http://localhost:3000
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

const { getCameraStatus } = require('./camera-api');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const PORT = process.env.PORT || 3000;

// ─── Configuração persistente ────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  camera: {
    ip: '192.168.100.41',
    user: 'admin',
    password: 'ABCD1234',
    port: 80
  },
  server: {
    port: 3000
  }
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      // Merge com defaults para garantir que todos os campos existam
      return {
        camera: { ...DEFAULT_CONFIG.camera, ...(parsed.camera || {}) },
        server: { ...DEFAULT_CONFIG.server, ...(parsed.server || {}) }
      };
    }
  } catch (e) {
    console.error('[Config] Erro ao carregar config.json:', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[Config] Erro ao salvar config.json:', e.message);
    return false;
  }
}

let config = loadConfig();

// ─── Express App ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ─── API de Configuração ─────────────────────────────────────────────────────

// GET /api/config — Retorna configuração atual (sem senha)
app.get('/api/config', (_req, res) => {
  res.json({
    camera: {
      ip: config.camera.ip,
      user: config.camera.user,
      password: config.camera.password ? '••••••••' : '',
      port: config.camera.port,
      hasPassword: !!config.camera.password
    },
    server: config.server
  });
});

// GET /api/config/full — Retorna configuração completa (com senha, para uso interno)
app.get('/api/config/full', (_req, res) => {
  res.json(config);
});

// POST /api/config — Atualiza configuração
app.post('/api/config', (req, res) => {
  const body = req.body;

  if (body.camera) {
    if (body.camera.ip) config.camera.ip = body.camera.ip.trim();
    if (body.camera.user) config.camera.user = body.camera.user.trim();
    if (body.camera.password !== undefined && body.camera.password !== '••••••••') {
      config.camera.password = body.camera.password;
    }
    if (body.camera.port) config.camera.port = Number(body.camera.port) || 80;
  }

  if (body.server) {
    if (body.server.port) config.server.port = Number(body.server.port) || 3000;
  }

  const ok = saveConfig(config);
  if (ok) {
    // Recriar proxy com novas credenciais
    setupProxy();
    res.json({ ok: true, message: 'Configuração salva. Proxy atualizado.' });
  } else {
    res.status(500).json({ ok: false, message: 'Erro ao salvar configuração.' });
  }
});

// POST /api/config/test — Testa conexão com a câmera
app.post('/api/config/test', async (req, res) => {
  const ip = (req.body.ip || config.camera.ip).trim();
  const user = (req.body.user || config.camera.user).trim();
  const pass = req.body.password !== undefined && req.body.password !== '••••••••'
    ? req.body.password
    : config.camera.password;
  const port = Number(req.body.port || config.camera.port) || 80;

  const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  const url = `http://${ip}:${port}/rmt.html`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      headers: { 'Authorization': auth },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      res.json({ ok: true, status: response.status, message: 'Câmera acessível!' });
    } else if (response.status === 401) {
      res.json({ ok: false, status: 401, message: 'Credenciais inválidas (401 Unauthorized).' });
    } else {
      res.json({ ok: false, status: response.status, message: `Resposta inesperada: ${response.status}` });
    }
  } catch (e) {
    res.json({ ok: false, status: 0, message: `Erro de conexão: ${e.message}` });
  }
});

// ─── Proxy Reverso para a Câmera ─────────────────────────────────────────────

let proxyMiddleware = null;

function setupProxy() {
  const { ip, user, password, port } = config.camera;
  const basicAuth = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  const target = `http://${ip}:${port}`;

  proxyMiddleware = createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    logLevel: 'silent',
    onProxyReq: (proxyReq, req, _res) => {
      proxyReq.setHeader('Authorization', basicAuth);
      proxyReq.setHeader('X-Forwarded-Host', req.headers.host || `localhost:${PORT}`);
      proxyReq.setHeader('X-Forwarded-Proto', 'http');
      if (!proxyReq.getHeader('Accept')) proxyReq.setHeader('Accept', '*/*');
      if (!proxyReq.getHeader('User-Agent')) proxyReq.setHeader('User-Agent', 'Mozilla/5.0');
      if (!proxyReq.getHeader('Referer')) proxyReq.setHeader('Referer', `http://${ip}/`);
    },
    onProxyReqWs: (proxyReq) => {
      proxyReq.setHeader('Authorization', basicAuth);
    },
    onError: (err, _req, res) => {
      if (res.writeHead) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
      }
    }
  });

  console.log(`[Proxy] Configurado para ${target} (user: ${user})`);
}

setupProxy();

// ─── API de Status da Câmera ─────────────────────────────────────────────────

app.get('/api/camera/status', async (_req, res) => {
  try {
    const status = await getCameraStatus();
    res.json(status);
  } catch (e) {
    res.json({ error: e.message, connected: false });
  }
});

// ─── Servir Frontend ─────────────────────────────────────────────────────────

app.use('/', express.static(path.join(__dirname, 'public')));

// ─── Proxy catch-all (redireciona para câmera tudo que não é local) ──────────

app.use('/cam', (req, res, next) => {
  if (proxyMiddleware) {
    // Remove o prefixo /cam antes de encaminhar
    req.url = req.url.replace(/^\/cam/, '') || '/';
    proxyMiddleware(req, res, next);
  } else {
    res.status(503).json({ error: 'Proxy não configurado' });
  }
});

// Rota para acessar rmt.html da câmera via proxy
app.use('/rmt.html', (req, res, next) => {
  if (proxyMiddleware) {
    proxyMiddleware(req, res, next);
  } else {
    res.status(503).json({ error: 'Proxy não configurado' });
  }
});

// Proxy para WebSocket e rotas da câmera que não são locais
app.use('/sony', (req, res, next) => {
  if (proxyMiddleware) {
    req.url = req.url.replace(/^\/sony/, '') || '/';
    proxyMiddleware(req, res, next);
  } else {
    res.status(503).json({ error: 'Proxy não configurado' });
  }
});

// ─── Iniciar Servidor ────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Z190 Control Madruga — v2.0                       ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Painel:  http://localhost:${PORT}                        ║`);
  console.log(`║  Câmera:  http://${config.camera.ip}:${config.camera.port}                  ║`);
  console.log(`║  Proxy:   /cam/* → câmera (com auth)                    ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
});

// Suporte a WebSocket upgrade para o proxy
server.on('upgrade', (req, socket, head) => {
  if (proxyMiddleware && proxyMiddleware.upgrade) {
    proxyMiddleware.upgrade(req, socket, head);
  }
});
