#!/usr/bin/env node
/**
 * z190-midi-server v0.3.1
 * - Mantém SSE de logs do runner
 * - Adiciona /api/logs/clear para limpar buffer
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let easymidi;
try { easymidi = require('easymidi'); } catch (e) {
  console.error('❌ Precisa de "easymidi": npm i easymidi');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '2mb' }));

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'midi-mapping.json');
const Z190_MIDI_CLI = path.join(ROOT, 'z190-midi.js');

let state = {
  ips: ['192.168.9.105'],
  inPort: null,
  outPort: null,
  mapping: null,
  child: null,
  lastLogs: [],
  sseClients: new Set(),
  learnInput: null,
  learnClients: new Set()
};

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const txt = fs.readFileSync(CONFIG_PATH, 'utf8');
      const json = JSON.parse(txt);
      state.mapping = json;
      if (json?.global?.ips) state.ips = json.global.ips;
    } catch {
      state.mapping = null;
    }
  }
  if (!state.mapping) {
    state.mapping = { $schema:"inline", global:{ ips: state.ips, z190Cli:"./z190-multi.js", debounceMs:40 }, bindings:[] };
  }
}
loadConfig();

function saveConfig(body) {
  try {
    if (Array.isArray(body.ips) && body.ips.length) state.ips = body.ips;
    if (typeof body.inPort === 'string' || body.inPort === null) state.inPort = body.inPort || null;
    if (typeof body.outPort === 'string' || body.outPort === null) state.outPort = body.outPort || null;
    if (body.mapping) state.mapping = body.mapping;
    state.mapping.global = state.mapping.global || {};
    state.mapping.global.ips = state.ips;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(state.mapping, null, 2), 'utf8');
    return true;
  } catch { return false; }
}

function broadcast(line) {
  state.lastLogs.push(line);
  if (state.lastLogs.length > 2000) state.lastLogs.shift();
  const data = `data: ${JSON.stringify({ line, ts: Date.now() })}\n\n`;
  for (const res of state.sseClients) res.write(data);
}

function ensureNotRunning() {
  if (state.child) { try { state.child.kill(); } catch {} state.child = null; }
}

app.get('/api/midi/ports', (_req, res) => {
  res.json({ in: easymidi.getInputs(), out: easymidi.getOutputs() });
});

app.get('/api/config', (_req, res) => {
  res.json({ ips: state.ips, inPort: state.inPort, outPort: state.outPort, mapping: state.mapping });
});

app.post('/api/config', (req, res) => {
  const ok = saveConfig(req.body || {});
  if (!ok) return res.status(500).json({ error: 'Falha ao salvar config' });
  res.json({ ok: true });
});

app.post('/api/run', (_req, res) => {
  if (!fs.existsSync(Z190_MIDI_CLI)) return res.status(400).json({ error: 'z190-midi.js não encontrado.' });
  ensureNotRunning();
  const args = [Z190_MIDI_CLI, '--ips', state.ips.join(',')];
  if (state.inPort) args.push('--in', state.inPort);
  if (state.outPort) args.push('--out', state.outPort);
  args.push('--config', CONFIG_PATH);

  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  state.child = child;

  broadcast(`[server] spawn: node ${args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);

  child.stdout.on('data', (buf) => buf.toString('utf8').split(/\r?\n/).filter(Boolean).forEach(l => broadcast(l)));
  child.stderr.on('data', (buf) => buf.toString('utf8').split(/\r?\n/).filter(Boolean).forEach(l => broadcast('[stderr] ' + l)));
  child.on('exit', (code, sig) => { broadcast(`[server] processo finalizado (code=${code}, signal=${sig||'none'})`); state.child=null; });

  res.json({ ok: true });
});

app.post('/api/stop', (_req, res) => {
  ensureNotRunning();
  broadcast('[server] stop solicitado');
  res.json({ ok: true });
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  state.sseClients.add(res);
  for (const l of state.lastLogs.slice(-100)) res.write(`data: ${JSON.stringify({ line:l, ts: Date.now() })}\n\n`);
  req.on('close', () => state.sseClients.delete(res));
});

app.post('/api/logs/clear', (_req, res) => {
  state.lastLogs = [];
  res.json({ ok:true });
});

/* ===== MIDI LEARN ===== */
app.post('/api/learn/start', (req, res) => {
  if (state.child) return res.status(400).json({ error: 'Pare a execução antes de usar MIDI Learn.' });
  const inPort = (req.body && req.body.inPort) || state.inPort;
  if (!inPort) return res.status(400).json({ error: 'Selecione uma porta de entrada MIDI.' });

  if (state.learnInput) { try { state.learnInput.close(); } catch {} state.learnInput=null; }
  try {
    const input = new easymidi.Input(inPort);
    state.learnInput = input;
    const emit = (type, payload) => {
      const data = `data: ${JSON.stringify({ type, payload, ts: Date.now() })}\n\n`;
      for (const res of state.learnClients) res.write(data);
    };
    input.on('noteon', e => emit('noteon', { channel:e.channel, number:e.note, value:e.velocity }));
    input.on('noteoff', e => emit('noteoff', { channel:e.channel, number:e.note, value:0 }));
    input.on('cc', e => emit('cc', { channel:e.channel, number:e.controller, value:e.value }));
    input.on('pitch', e => emit('pitch', { channel:e.channel, value:e.value }));
    input.on('program', e => emit('program', { channel:e.channel, value:e.number }));
    return res.json({ ok:true });
  } catch {
    return res.status(500).json({ error: 'Não foi possível abrir a entrada MIDI para Learn.' });
  }
});
app.post('/api/learn/stop', (_req, res) => { if (state.learnInput) { try { state.learnInput.close(); } catch {} state.learnInput=null; } res.json({ ok:true }); });
app.get('/api/learn/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  state.learnClients.add(res);
  req.on('close', () => state.learnClients.delete(res));
});

app.use('/', express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 4545;
app.listen(PORT, () => console.log(`z190-midi-server v0.3.1 rodando em http://localhost:${PORT}`));
