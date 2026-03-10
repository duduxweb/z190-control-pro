#!/usr/bin/env node
/**
 * z190-midi-integration v1.0.4
 * Novidades:
 *  - Suporte a "CC como Toggle" via bind.ccToggle { threshold=64, hysteresis=2, invert=false }
 *    • Ex.: CC >=64 vira ON; CC < (64 - 2) vira OFF; com invert inverte a lógica.
 *  - Loga quando há binding mas não existe ação aplicável (tag:"noaction").
 *  - Ordem: escolhe ação -> throttle -> match/exec (assim você vê "noaction" mesmo quando há throttle).
 *
 * Uso:
 *   node z190-midi.js --list
 *   node z190-midi.js --ips 192.168.9.105 --in "WORLDE" --config midi-mapping.json
 */

const path = require('path');
const fs = require('fs');
const minimist = require('minimist');
const chokidar = require('chokidar');
const spawn = require('cross-spawn');
let easymidi;
try { easymidi = require('easymidi'); } catch (e) {
  console.error('❌ Dependência "easymidi" não encontrada. Rode: npm i easymidi');
  process.exit(1);
}

const argv = minimist(process.argv.slice(2), {
  string: ['ips', 'in', 'out', 'config', 'z190'],
  boolean: ['list', 'verbose'],
  default: { verbose: true }
});

const Z190_CLI_PATH = argv.z190 || './z190-multi.js';
const CAMERA_IPS = (argv.ips || '').split(',').map(s => s.trim()).filter(Boolean);
const MIDI_IN_NAME = argv.in || null;
const MIDI_OUT_NAME = argv.out || null;
const CONFIG_PATH = argv.config || path.resolve(process.cwd(), 'midi-mapping.json');
const VERBOSE = !!argv.verbose;

// ---- LOG helpers ----------------------------------------------------------
function jlog(obj){ try{ console.log(JSON.stringify(obj)); }catch{} }
function log(...a){ if(VERBOSE) console.log('[MIDI-Z190]', ...a); }

// ---- listagem -------------------------------------------------------------
function listPorts() {
  const inputs = easymidi.getInputs();
  const outputs = easymidi.getOutputs();
  console.log('\nEntradas MIDI disponíveis:');
  inputs.forEach((n,i)=>console.log(`  [${i}] ${n}`));
  console.log('\nSaídas MIDI disponíveis:');
  outputs.forEach((n,i)=>console.log(`  [${i}] ${n}`));
  console.log('\nUse --in "Nome exato" e --out "Nome exato" para selecionar.\n');
}

if (argv.list) {
  listPorts();
  process.exit(0);
}

if (!CAMERA_IPS.length) {
  console.error('⚠️  Defina as IPs com --ips 192.168.x.x[,192.168.x.y]');
  process.exit(1);
}

// ---- Estado / config ------------------------------------------------------
let cfg = {
  global: { ips: CAMERA_IPS, z190Cli: Z190_CLI_PATH, debounceMs: 30 },
  bindings: []
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const txt = fs.readFileSync(CONFIG_PATH, 'utf8');
      const json = JSON.parse(txt);
      if (json.global?.ips && !argv.ips) cfg.global.ips = json.global.ips;
      if (json.global?.z190Cli && !argv.z190) cfg.global.z190Cli = json.global.z190Cli;
      if (json.global?.debounceMs != null) cfg.global.debounceMs = json.global.debounceMs;
      cfg.bindings = Array.isArray(json.bindings) ? json.bindings : [];
      log('Config carregada de', CONFIG_PATH, `(${cfg.bindings.length} bindings)`);
      jlog({ tag:'config', info:{ file: CONFIG_PATH, bindings: cfg.bindings.length, ips: cfg.global.ips }});
    } else {
      log('Sem arquivo de config, usando defaults embutidos.');
      jlog({ tag:'config', info:{ file: null, bindings: 0, ips: cfg.global.ips }});
    }
  } catch (e) {
    console.error('Erro ao carregar config:', e.message);
  }
}
loadConfig();

// Hot-reload do JSON
chokidar.watch(CONFIG_PATH, { ignoreInitial: true }).on('all', ()=>{
  log('Mudança detectada no config, recarregando...');
  loadConfig();
});

// ---- MIDI IO --------------------------------------------------------------
const inPorts = easymidi.getInputs();
const outPorts = easymidi.getOutputs();
let input, output;
try {
  input = MIDI_IN_NAME ? new easymidi.Input(MIDI_IN_NAME) : new easymidi.Input(inPorts[0]);
} catch (e) {
  console.error('❌ Não foi possível abrir a entrada MIDI. Use --list e escolha um nome válido.');
  process.exit(1);
}
try {
  if (MIDI_OUT_NAME) output = new easymidi.Output(MIDI_OUT_NAME);
} catch (e) {
  console.warn('⚠️ Não foi possível abrir a saída MIDI (LED/feedback desativado).');
}

log('Usando entrada MIDI:', input.name);
if (output) log('Usando saída MIDI:', output.name);

// ---- Utils ----------------------------------------------------------------
/** Tokeniza string em args respeitando aspas/escapes. */
function tokenizeArgs(str) {
  const tokens = []; let cur = ''; let quote = null; let esc = false;
  for (const ch of str) {
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (quote) { if (ch === quote) { quote = null; continue; } cur += ch; }
    else { if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (/\s/.test(ch)) { if (cur.length) { tokens.push(cur); cur = ''; } }
      else { cur += ch; }
    }
  }
  if (cur.length) tokens.push(cur);
  return tokens;
}

const lastSent = new Map();
function canSend(key, ms){
  const now = Date.now(); const last = lastSent.get(key) || 0;
  if (now - last >= ms) { lastSent.set(key, now); return true; }
  return false;
}

function scaleValue(v, scale) {
  if (!scale) return v;
  const inMin = scale.inMin ?? 0;
  const inMax = scale.inMax ?? 127;
  const outMin = scale.outMin ?? 0;
  const outMax = scale.outMax ?? 127;
  const clamped = Math.max(inMin, Math.min(inMax, v));
  const ratio = (clamped - inMin) / (inMax - inMin || 1);
  let out = outMin + ratio * (outMax - outMin);
  if (typeof scale.round === 'number') {
    const step = Math.max(1, scale.round);
    out = Math.round(out / step) * step;
  }
  return out;
}
function signFrom(v, center=64, dead=0){
  const d = v - center;
  if (Math.abs(d) <= dead) return 0;
  return d > 0 ? 1 : -1;
}
function buildCommand(template, ctx){
  return template
    .replaceAll('{value}', String(ctx.value))
    .replaceAll('{scaled}', String(ctx.scaled))
    .replaceAll('{sign}', String(ctx.sign));
}
function execZ190(cmdString, ips) {
  const args = tokenizeArgs(cmdString.trim());
  const cli = path.resolve(cfg.global.z190Cli || Z190_CLI_PATH);
  const ipsArg = ['--ips', ips.join(',')];
  jlog({ tag:'exec', cmd: cmdString, ips });
  const child = spawn('node', [cli, ...args, ...ipsArg], { stdio: 'inherit' });
  child.on('error', err => console.error('Erro ao executar z190 CLI:', err.message));
}

function matchBinding(msg) {
  return cfg.bindings.find(b => {
    if (b.type !== msg.type) return false;
    if (b.channel != null && Number(b.channel) !== Number(msg.channel)) return false;
    if (msg.type === 'note' || msg.type === 'cc') {
      if (b.number != null && Number(b.number) !== Number(msg.number)) return false;
    }
    return true;
  });
}

/** Estado para CC->Toggle por binding-key */
const toggleState = new Map(); // key -> { on:boolean, last:number }

function chooseAction(bind, ctx){
  // 1) CC → Toggle ? (quando evento é change e binding tem ccToggle)
  if (ctx.eventType==='cc' && bind.ccToggle && (bind.on?.cmd || bind.off?.cmd)) {
    const thr = Number(bind.ccToggle.threshold ?? 64);
    const hyst = Math.max(0, Number(bind.ccToggle.hysteresis ?? 2));
    const invert = !!bind.ccToggle.invert;
    const key = `cc:${bind.channel}:${bind.number}`;
    const prev = toggleState.get(key) || { on:false, last:0 };
    const upEdge = ctx.value >= thr;
    const downEdge = ctx.value <= (thr - hyst);

    let nextOn = prev.on;
    if (!prev.on && upEdge) nextOn = true;
    else if (prev.on && downEdge) nextOn = false;

    toggleState.set(key, { on: nextOn, last: ctx.value });

    if (nextOn !== prev.on) {
      const wantOn = invert ? !nextOn : nextOn;
      return { kind: wantOn ? 'on' : 'off', action: wantOn ? bind.on : bind.off };
    }
    // sem transição -> nenhuma ação agora
    return null;
  }

  // 2) Modo tradicional (noteon/noteoff / onChange)
  if (ctx.kind === 'change' && bind.onChange?.cmd) return { kind:'change', action: bind.onChange };
  if (ctx.kind === 'on' && bind.on?.cmd)           return { kind:'on', action: bind.on };
  if (ctx.kind === 'off' && bind.off?.cmd)         return { kind:'off', action: bind.off };

  return null; // sem ação aplicável
}

function handleWithBind(bind, ctx){
  // selecionar ação primeiro (pra logar "noaction" se for o caso)
  const picked = chooseAction(bind, ctx);
  if (!picked) {
    jlog({
      tag: 'noaction',
      reason: 'binding não possui ação para este tipo de evento',
      binding: { type: bind.type, channel: bind.channel, number: bind.number ?? null, label: bind.label || '' },
      have: { on: !!bind.on?.cmd, off: !!bind.off?.cmd, onChange: !!bind.onChange?.cmd },
      event: ctx
    });
    return;
  }

  // throttle
  const throttle = (picked.action.throttleMs ?? bind.onChange?.throttleMs ?? bind.on?.throttleMs ?? bind.off?.throttleMs ?? cfg.global.debounceMs ?? 20);
  const key = `${bind.type}:${bind.channel}:${bind.number ?? 'x'}`;
  if (!canSend(key, throttle)) {
    jlog({ tag:'skip', reason:'throttle', key, ms: throttle });
    return;
  }

  // executar
  const cmd = buildCommand(picked.action.cmd, ctx);
  jlog({
    tag: 'match',
    label: bind.label || '',
    binding: { type: bind.type, channel: bind.channel, number: bind.number ?? null },
    context: ctx,
    throttleMs: throttle,
    cmd
  });
  execZ190(cmd, cfg.global.ips);
}

// ---- Listeners MIDI -------------------------------------------------------
input.on('noteon', (e)=>{
  const msg = { type: 'note', channel: e.channel, number: e.note, value: e.velocity };
  const bind = matchBinding(msg);
  const scaled = bind ? scaleValue(msg.value, bind.scale) : msg.value;
  const ctx = { kind: 'on', value: msg.value, scaled, sign: signFrom(msg.value, 1, bind?.deadzone||0), eventType:'note' };
  jlog({ tag:'midi', type:'noteon', channel:e.channel, number:e.note, value:e.velocity, scaled:ctx.scaled, sign:ctx.sign });
  if (bind) handleWithBind(bind, ctx);
});

input.on('noteoff', (e)=>{
  const msg = { type: 'note', channel: e.channel, number: e.note, value: 0 };
  const bind = matchBinding(msg);
  const scaled = bind ? scaleValue(0, bind.scale) : 0;
  const ctx = { kind: 'off', value: 0, scaled, sign: 0, eventType:'note' };
  jlog({ tag:'midi', type:'noteoff', channel:e.channel, number:e.note, value:0, scaled:0, sign:0 });
  if (bind) handleWithBind(bind, ctx);
});

input.on('cc', (e)=>{
  const msg = { type: 'cc', channel: e.channel, number: e.controller, value: e.value };
  const bind = matchBinding(msg);
  const scaled = bind ? scaleValue(msg.value, bind.scale) : msg.value;
  const ctx = { kind: 'change', value: msg.value, scaled, sign: signFrom(msg.value, 64, bind?.deadzone||0), eventType:'cc' };
  jlog({ tag:'midi', type:'cc', channel:e.channel, number:e.controller, value:e.value, scaled:ctx.scaled, sign:ctx.sign });
  if (bind) handleWithBind(bind, ctx);
});

input.on('pitch', (e)=>{
  const msg = { type: 'pitch', channel: e.channel, value: e.value };
  const bind = cfg.bindings.find(b => b.type === 'pitch' && (b.channel == null || Number(b.channel) === Number(e.channel)) );
  const scaled = bind ? scaleValue(msg.value, bind.scale || { inMin:0, inMax:16383, outMin:0, outMax:127 }) : msg.value;
  const ctx = { kind: 'change', value: msg.value, scaled, sign: signFrom(msg.value, 8192, bind?.deadzone||0), eventType:'pitch' };
  jlog({ tag:'midi', type:'pitch', channel:e.channel, value:e.value, scaled:ctx.scaled, sign:ctx.sign });
  if (bind) handleWithBind(bind, ctx);
});

input.on('program', (e)=>{
  const msg = { type: 'program', channel: e.channel, value: e.number };
  const bind = cfg.bindings.find(b => b.type === 'program' && (b.channel == null || Number(b.channel) === Number(e.channel)) );
  const scaled = bind ? scaleValue(msg.value, bind.scale) : msg.value;
  const ctx = { kind: 'change', value: msg.value, scaled, sign: 0, eventType:'program' };
  jlog({ tag:'midi', type:'program', channel:e.channel, value:e.number, scaled });
  if (bind) handleWithBind(bind, ctx);
});

process.on('SIGINT', ()=>{
  log('Encerrando...');
  input.close();
  if (output) output.close();
  process.exit(0);
});
