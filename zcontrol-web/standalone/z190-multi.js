/**
 * z190-multi.js — Controle PXW-Z190 via Web Remote (Savona)
 * Versão: v1.14 (2025-11-05)
 *
 * Novidades v1.14:
 * - wb-k-snap: detecção de "straddle/oscillation" (ex.: 3779 ↔ 3814 com alvo 3800).
 *   Quando o alvo fica entre dois degraus estáveis e nenhum entra na tolerância,
 *   escolhemos o valor mais próximo e paramos (sem enviar novos ticks).
 * - Entra no dither imediatamente ao detectar "cruzamento" do alvo.
 * - Mantidos fixes da v1.13: dither NÃO envia ticks quando já está dentro da tolerância.
 *
 * Requisitos: Node 18+ e Playwright (npx playwright install chromium)
 */

const VERSION = 'v1.14 (2025-11-05)';
console.log(`z190-multi.js ${VERSION}`);

process.on('unhandledRejection', (r)=>console.error('[unhandledRejection]', r));
process.on('uncaughtException', (e)=>console.error('[uncaughtException]', e));

const { chromium } = require('playwright');

// ===== CAMERAS =====
const CAMS = [
  { ip: '192.168.9.105', user: 'admin', pass: 'ABCD1234' },
  // { ip: '192.168.9.106', user: 'admin', pass: 'ABCD1234' },
];

// ===== utils =====
const sleep = (ms)=> new Promise(r=>setTimeout(r, ms));
function print(out){
  try {
    console.table(out.map(r=>({
      ip:r.ip, ok:r.ok,
      summary: r.data?.summary ?? (r.data?.kelvin!=null ? `mode=${r.data.mode} kelvin=${r.data.kelvin}` : ''),
      error:r.error||''
    })));
  } catch {}
  console.log('\nDETALHES:\n'+JSON.stringify(out,null,2));
}
function toNumberMaybe(x){
  if (x==null) return null;
  if (typeof x==='number' && Number.isFinite(x)) return x;
  if (typeof x==='string'){ const n=Number(x.replace(/[^\d.-]/g,'')); return Number.isFinite(n)?n:null; }
  if (typeof x==='object'){
    for (const k of ['_n','cam','value','current','Kelvin','kelvin','K','now']) {
      if (k in x) { const n=toNumberMaybe(x[k]); if (n!=null) return n; }
    }
  }
  return null;
}

// ===== contexto/browser =====
async function createCtx(cam){
  const browser = await chromium.launch({ headless:true });
  const ctx = await browser.newContext({ httpCredentials:{ username:cam.user, password:cam.pass } });
  const page = await ctx.newPage();
  return { browser, ctx, page };
}
async function destroyCtx(c){ try{await c?.ctx?.close();}catch{} try{await c?.browser?.close();}catch{} }
async function gotoRM(page, ip){
  await page.goto(`http://${ip}/rmt.html`, { waitUntil:'domcontentloaded', timeout:30000 }).catch(()=>{});
  await page.waitForURL(/\/rm(t)?\.html$/i, { timeout:15000 }).catch(()=>{});
  await page.waitForLoadState('networkidle', { timeout:15000 }).catch(()=>{});
}
async function waitSavonaClient(page){
  await page.waitForFunction(()=>{ try{ return !!(window.client&&window.client.property&&window.client.system&&window.client.notify); }catch{return false;} },{timeout:20000});
}
async function withSavona(cam, ctxRef, op){
  const needHard = (e)=>/Target page|Target closed|Execution context|Navigation|Protocol error|closed/i.test(String(e||''));
  for (let i=0;i<3;i++){
    try{
      if (!ctxRef.current){
        ctxRef.current = await createCtx(cam);
        await gotoRM(ctxRef.current.page, cam.ip);
        await waitSavonaClient(ctxRef.current.page);
      } else {
        const ok = await ctxRef.current.page.evaluate(()=>{ try{ return !!(window.client&&window.client.property&&window.client.system); }catch{return false;} }).catch(()=>false);
        if (!ok){ await gotoRM(ctxRef.current.page, cam.ip); await waitSavonaClient(ctxRef.current.page); }
      }
      return await op(ctxRef.current.page);
    }catch(e){
      if (needHard(e)){ await destroyCtx(ctxRef.current); ctxRef.current=null; if (i===2) throw e; await sleep(150); }
      else { throw e; }
    }
  }
}
async function savonaCall(cam, ctxRef, fn, payload){
  return withSavona(cam, ctxRef, (page)=>page.evaluate(({fn,payload})=>new Promise(res=>{
    const parts=fn.split('.'); let t=window.client; for (const p of parts.slice(0,-1)) t=t[p];
    const m = parts.at(-1); t[m]({ params: payload, onresponse: r=>res(r && (r.result||r.error)) });
  }),{fn,payload}));
}
const setValue =(cam,ctxRef,p)=>savonaCall(cam,ctxRef,'property.SetValue',p);
const updateValue=(cam,ctxRef,p)=>savonaCall(cam,ctxRef,'property.UpdateValue',p);
const getValues =(cam,ctxRef,n)=>savonaCall(cam,ctxRef,'property.GetValue',n);

// ===== leitura WB =====
async function readKelvinRaw(cam, ctxRef){
  return getValues(cam, ctxRef, {
    "Camera.WhiteBalance.ColorTemperature.MemoryValue":["*"],
    "Camera.WhiteBalance.ColorTemperature.Value":["*"],
    "Camera.WhiteBalance.Mode":["*"],
    "Camera.WhiteBalance.SettingMethod":["*"]
  });
}
function extractKelvinFromRawByMode(raw){
  const mode = raw?.["Camera.WhiteBalance.Mode"] ?? null;
  const mem  = raw?.["Camera.WhiteBalance.ColorTemperature.MemoryValue"];
  const val  = raw?.["Camera.WhiteBalance.ColorTemperature.Value"];
  if (mode && mem && typeof mem==='object' && !Array.isArray(mem)){
    const k = toNumberMaybe(mem[mode]); if (k!=null) return { mode, kelvin:k };
  }
  const kVal = toNumberMaybe(val); if (kVal!=null) return { mode, kelvin:kVal };
  const kMem = toNumberMaybe(mem); if (kMem!=null) return { mode, kelvin:kMem };
  return { mode, kelvin:null };
}
async function readKelvin(cam, ctxRef){ const raw=await readKelvinRaw(cam, ctxRef); const r=extractKelvinFromRawByMode(raw); return { ...r, raw }; }

// ===== execução multi =====
async function runAll(fn){
  const out=[];
  for (const cam of CAMS){
    const row={ ip:cam.ip, ok:false, data:null, error:null };
    const ctxRef={ current:null };
    try{
      await withSavona(cam, ctxRef, async()=>{});
      row.data = await fn({ cam, ctxRef });
      row.ok = true;
    }catch(e){ row.error=String(e); }
    finally{ await destroyCtx(ctxRef.current); ctxRef.current=null; }
    out.push(row);
  }
  print(out);
}

// ===== comandos básicos =====
async function cmdColorBars(arg){
  const on = (arg||'').toLowerCase()==='on';
  await runAll(async ({cam,ctxRef})=>{
    const before = await getValues(cam, ctxRef, {"Camera.ColorBar.Enabled":["*"],"Camera.ColorBar.Type":["*"]});
    const set = await setValue(cam, ctxRef, { "Camera.ColorBar.Enabled": on, "Camera.ColorBar.Type":"100%" });
    const after = await getValues(cam,ctxRef,{"Camera.ColorBar.Enabled":["*"],"Camera.ColorBar.Type":["*"]});
    return { summary:`colorbars=${on?'on':'off'}`, before, set, after };
  });
}
async function cmdRec(arg){
  const start = /^(on|start)$/i.test(arg||'');
  await runAll(async ({cam,ctxRef})=>{
    const method = start?'Start':'Stop';
    const resp = await savonaCall(cam, ctxRef, 'clip.recorder.'+method, ["main"]);
    return { summary:`rec ${method.toLowerCase()}`, resp };
  });
}
async function cmdND(mode, value){
  const m=(mode||'').toLowerCase();
  await runAll(async ({cam,ctxRef})=>{
    const out={};
    if (m==='manual' && value!=null){ out.setMode=await setValue(cam,ctxRef,{"Camera.NDFilter.SettingMethod":{"cam":"Manual"}}); out.setVal=await setValue(cam,ctxRef,{"Camera.NDFilter.Value":{"cam":Number(value)}}); }
    else if (m==='auto'){ out.setMode=await setValue(cam,ctxRef,{"Camera.NDFilter.SettingMethod":"Automatic"}); }
    else { out.summary='Uso: nd manual <valor> | nd auto'; }
    out.after = await getValues(cam,ctxRef,{"Camera.NDFilter.SettingMethod":["cam"],"Camera.NDFilter.Value":["*"]});
    return out;
  });
}
async function cmdIris(mode, fnum){
  const m=(mode||'').toLowerCase();
  await runAll(async ({cam,ctxRef})=>{
    const out={};
    if (m==='auto'){ out.mode=await setValue(cam,ctxRef,{"Camera.Iris.SettingMethod":"Automatic"}); }
    else if (m==='manual'){ out.mode=await setValue(cam,ctxRef,{"Camera.Iris.SettingMethod":"Manual"}); if (fnum) out.value=await setValue(cam,ctxRef,{"Camera.Iris.Value":{"_n":Number(fnum)},"Camera.Iris.Close.Enabled":false}); }
    else { out.summary='Uso: iris auto | iris manual <f>'; }
    out.after=await getValues(cam,ctxRef,{"Camera.Iris.SettingMethod":["*"],"Camera.Iris.Value":["*"],"Camera.Iris.Close.Enabled":["*"]});
    return out;
  });
}
async function cmdShutter(speedStr){
  await runAll(async ({cam,ctxRef})=>{
    const set = await setValue(cam,ctxRef,{"Camera.Shutter.ECS.Enabled":false,"Camera.Shutter.Mode":"Speed","Camera.Shutter.Value":String(speedStr||"1/50")});
    const after = await getValues(cam,ctxRef,{"Camera.Shutter.Enabled":["*"],"Camera.Shutter.Mode":["*"],"Camera.Shutter.Value":["*"]});
    return { summary:`shutter ${speedStr||'1/50'}`, set, after };
  });
}
async function cmdGain(dbStr){
  await runAll(async ({cam,ctxRef})=>{
    const set = await setValue(cam,ctxRef,{"Camera.Gain.Value":String(dbStr||"6dB")});
    const after = await getValues(cam,ctxRef,{"Camera.Gain.Value":["*"],"Camera.Gain.SettingMethod":["*"]});
    return { summary:`gain ${dbStr||'6dB'}`, set, after };
  });
}
async function cmdWBMode(modeStr){
  await runAll(async ({cam,ctxRef})=>{
    const set = await setValue(cam,ctxRef,{"Camera.WhiteBalance.Mode":String(modeStr||"Preset")});
    const after = await getValues(cam,ctxRef,{"Camera.WhiteBalance.Mode":["*"]});
    return { summary:`wb-mode ${modeStr}`, set, after };
  });
}

// ===== WB leitura e setters =====
async function cmdWBRead(){
  await runAll(async ({cam,ctxRef})=>{
    const r = await readKelvin(cam, ctxRef);
    return { mode:r.mode, kelvin:r.kelvin, raw:r.raw };
  });
}
async function cmdWBSlider(val){
  await runAll(async ({cam,ctxRef})=>{
    const n=Number(val||0);
    const set = await setValue(cam,ctxRef,{"P.Control.ColorTemperature.Slider":n});
    const after = await readKelvin(cam,ctxRef);
    return { summary:`slider=${n}`, mode:after.mode, kelvin:after.kelvin, afterRaw:after.raw, set };
  });
}
async function cmdWBAbs(absStr, modeOpt){
  const n=Number(absStr);
  if (!Number.isFinite(n) || n<0 || n>50000){ console.error('Uso: wb-abs <0..50000> [Preset|Memory A|Memory B]'); process.exit(1); }
  await runAll(async ({cam,ctxRef})=>{
    if (modeOpt) await setValue(cam,ctxRef,{"Camera.WhiteBalance.Mode":String(modeOpt)});
    const set = await setValue(cam,ctxRef,{"P.Control.ColorTemperature.Slider":n});
    const after = await readKelvin(cam,ctxRef);
    return { summary:`abs=${n}`, mode:after.mode, kelvin:after.kelvin, afterRaw:after.raw, set };
  });
}
async function cmdWBStep(deltaStr){
  const d=Number(deltaStr||0);
  if (![1,-1].includes(d)){ console.error('Uso: wb-step +1|-1'); process.exit(1); }
  await runAll(async ({cam,ctxRef})=>{
    const upd = await updateValue(cam,ctxRef,{"Camera.WhiteBalance.ColorTemperature.Value":d});
    const after = await readKelvin(cam,ctxRef);
    return { summary:`step=${d}`, mode:after.mode, kelvin:after.kelvin, afterRaw:after.raw, upd };
  });
}

// escrita direta em banco (pode falhar em algumas unidades)
async function setKelvinForBank(cam,ctxRef,bank,K){
  const tries=[];
  tries.push({ tag:'setMode',   resp: await setValue(cam,ctxRef,{"Camera.WhiteBalance.Mode":String(bank)}) });
  tries.push({ tag:'setMethod', resp: await setValue(cam,ctxRef,{"Camera.WhiteBalance.SettingMethod":"Manual"}) });

  tries.push({ tag:`MemoryValue ${bank}:number`, resp: await setValue(cam,ctxRef,{"Camera.WhiteBalance.ColorTemperature.MemoryValue":{[bank]:K}}) });
  let after=await readKelvin(cam,ctxRef); if (after.mode===bank && after.kelvin===K) return { ok:true, tries, after };

  tries.push({ tag:`MemoryValue ${bank}:"number"`, resp: await setValue(cam,ctxRef,{"Camera.WhiteBalance.ColorTemperature.MemoryValue":{[bank]:String(K)}}) });
  after=await readKelvin(cam,ctxRef); if (after.mode===bank && after.kelvin===K) return { ok:true, tries, after };

  tries.push({ tag:`MemoryValue ${bank}:{_n}`, resp: await setValue(cam,ctxRef,{"Camera.WhiteBalance.ColorTemperature.MemoryValue":{[bank]:{_n:K}}}) });
  after=await readKelvin(cam,ctxRef); if (after.mode===bank && after.kelvin===K) return { ok:true, tries, after };

  tries.push({ tag:`MemoryValue ${bank}:{cam}`, resp: await setValue(cam,ctxRef,{"Camera.WhiteBalance.ColorTemperature.MemoryValue":{[bank]:{cam:K}}}) });
  after=await readKelvin(cam,ctxRef); if (after.mode===bank && after.kelvin===K) return { ok:true, tries, after };

  tries.push({ tag:'P.Control.ColorTemperature.Slider', resp: await setValue(cam,ctxRef,{"P.Control.ColorTemperature.Slider":K}) });
  after=await readKelvin(cam,ctxRef); if (after.mode===bank && after.kelvin===K) return { ok:true, tries, after };

  return { ok:false, tries, after };
}
async function cmdWBSet(kStr, bankOpt){
  const K=Number(kStr);
  if (!Number.isFinite(K)||K<0||K>50000){ console.error('Uso: wb-set <0..50000> [Preset|Memory A|Memory B]'); process.exit(1); }
  await runAll(async ({cam,ctxRef})=>{
    let current = await readKelvin(cam,ctxRef);
    const bank = bankOpt?String(bankOpt):(current.mode||'Preset');
    const attempt = await setKelvinForBank(cam,ctxRef,bank,K);
    const finalRead = await readKelvin(cam,ctxRef);
    return { bank, target:K, result:attempt, final:finalRead, ok: attempt.ok && finalRead.mode===bank && finalRead.kelvin===K };
  });
}

// ===== wb-k-quick =====
async function cmdWBKelvinQuick(kStr, bankOpt, maxStepsStr, sleepMsStr){
  const K=Number(kStr); if(!Number.isFinite(K)){ console.error('Uso: wb-k-quick <kelvin> <"Memory A|Memory B"> [maxSteps=120] [sleepMs=120]'); process.exit(1); }
  const MAXSTEPS=Math.max(1,Number(maxStepsStr||120)); const SLEEP=Math.max(0,Number(sleepMsStr||120));
  await runAll(async ({cam,ctxRef})=>{
    const out={ target:K, maxSteps:MAXSTEPS, sleepMs:SLEEP, steps:0, trace:[] };
    let state=await readKelvin(cam,ctxRef);
    const bank=(bankOpt?String(bankOpt):state.mode)||'Memory A';
    if(!/^(Memory A|Memory B)$/i.test(bank)){ out.summary=`banco inválido: ${bank}`; out.ok=false; out.start=state; return out; }
    await setValue(cam,ctxRef,{"Camera.WhiteBalance.Mode":bank});
    await setValue(cam,ctxRef,{"Camera.WhiteBalance.SettingMethod":"Manual"});
    state=await readKelvin(cam,ctxRef); out.start=state;
    while(out.steps<MAXSTEPS){
      const dir=(K>state.kelvin)?+1:-1;
      await updateValue(cam,ctxRef,{"Camera.WhiteBalance.ColorTemperature.Value":dir});
      if(SLEEP) await sleep(SLEEP);
      state=await readKelvin(cam,ctxRef);
      out.steps++; out.trace.push({step:out.steps,mode:state.mode,kelvin:state.kelvin});
      console.log(`[quick] ${cam.ip} step=${out.steps} kelvin=${state.kelvin}`);
      if(state.mode!==bank){ out.summary=`Banco mudou para ${state.mode}`; break; }
      if(state.kelvin===K){ out.summary=`hit=${K}`; break; }
    }
    out.final=state;
    return out;
  });
}

// ===== helpers p/ snap =====
function within(k, K, tol){ return Math.abs(K-k)<=tol; }
function crossed(prev, curr, K){
  if (prev==null || curr==null) return false;
  return (prev-K)*(curr-K) < 0;
}
function detectToggleAroundTarget(hist, K){
  // procura alternância A↔B com o alvo no meio
  if (hist.length < 6) return null;
  const last = hist.slice(-8);
  const uniq = [...new Set(last)];
  if (uniq.length!==2) return null;
  const [a,b]=uniq.sort((x,y)=>x-y);
  if (!(a<K && K<b)) return null;
  // checa padrão intercalado
  let alterna=true;
  for (let i=2;i<last.length;i++){
    if (last[i]!==last[i-2]){ alterna=false; break; }
  }
  if (!alterna) return null;
  return { low:a, high:b, step:(b-a) };
}

// ===== wb-k-gentle =====
async function cmdWBKelvinGentle(kStr, bankOpt, tolStr, stepStr, chunkStr, sleepMsStr, maxLoopsStr, consecutiveStr){
  const K=Number(kStr); if(!Number.isFinite(K)){ console.error('Uso: wb-k-gentle <kelvin> <"Memory A|Memory B"> [tol=5] [step=1] [chunk=1] [sleepMs=120] [maxLoops=1200] [confirm=3]'); process.exit(1); }
  const TOL=Math.max(0,Number(tolStr||5));
  let STEP=Math.max(1,Number(stepStr||1));
  let CHUNK=Math.max(1,Number(chunkStr||1));
  let SLEEP=Math.max(0,Number(sleepMsStr||120));
  const MAXLOOPS=Math.max(1,Number(maxLoopsStr||1200));
  const NEED_CONSEC=Math.max(1,Number(consecutiveStr||3));
  console.log(`[gentle] target=${K} tol=±${TOL} step=${STEP} chunk=${CHUNK} sleep=${SLEEP}ms maxLoops=${MAXLOOPS} confirm=${NEED_CONSEC}`);
  await runAll(async ({cam,ctxRef})=>{
    const out={ target:K, tol:TOL, step:STEP, chunk:CHUNK, sleepMs:SLEEP, maxLoops:MAXLOOPS, confirm:NEED_CONSEC, loops:0, heartbeat:[] };
    let state=await readKelvin(cam,ctxRef);
    const bank=(bankOpt?String(bankOpt):state.mode)||'Memory A';
    await setValue(cam,ctxRef,{"Camera.WhiteBalance.Mode":bank});
    await setValue(cam,ctxRef,{"Camera.WhiteBalance.SettingMethod":"Manual"});
    state=await readKelvin(cam,ctxRef); out.start=state;

    let consecOK=0, lastKelvin=state.kelvin, stall=0;
    if (state.kelvin==null){ out.summary='Kelvin não lido'; out.final=state; return out; }

    if (within(state.kelvin, K, TOL)){
      for(let i=0;i<NEED_CONSEC;i++){ await sleep(80); const chk=await readKelvin(cam,ctxRef); if (chk.mode===bank && within(chk.kelvin, K, TOL)) consecOK++; }
      out.summary = consecOK>=NEED_CONSEC ? `ok @${state.kelvin}` : `na faixa mas instável`;
      out.final=state; return out;
    }

    while(out.loops<MAXLOOPS){
      out.loops++;
      if (out.loops%20===0){ console.log(`[gentle] ${cam.ip} loop=${out.loops} kelvin=${state.kelvin}`); out.heartbeat.push({loop:out.loops,kelvin:state.kelvin}); }

      const dir=(K>state.kelvin)?+STEP:-STEP;
      for(let j=0;j<CHUNK;j++){ await updateValue(cam,ctxRef,{"Camera.WhiteBalance.ColorTemperature.Value": (dir>0?+1:-1) }); }
      if (SLEEP) await sleep(SLEEP);

      const prev=state.kelvin;
      state=await readKelvin(cam,ctxRef);
      if (state.mode!==bank){ out.summary=`Banco mudou para ${state.mode}`; break; }

      if (state.kelvin===prev){
        stall++;
        await setValue(cam,ctxRef,{"Camera.WhiteBalance.SettingMethod":"Automatic"});
        await sleep(60);
        await setValue(cam,ctxRef,{"Camera.WhiteBalance.SettingMethod":"Manual"});
        await updateValue(cam,ctxRef,{"Camera.WhiteBalance.ColorTemperature.Value": (dir>0? +1 : -1)});
        await sleep(Math.min(400, SLEEP+120));
        state=await readKelvin(cam,ctxRef);
        if (stall>=5 && state.kelvin===prev){ out.summary='Sem progresso (stall)'; break; }
      } else {
        stall=0;
      }

      if (within(state.kelvin, K, TOL)){
        // CONFIRMA SEM ENVIAR MAIS TICKS
        let ok=1;
        for (let i=1;i<NEED_CONSEC;i++){
          await sleep(100);
          const chk=await readKelvin(cam,ctxRef);
          if (chk.mode===bank && within(chk.kelvin, K, TOL)) ok++;
        }
        out.summary = ok>=NEED_CONSEC ? `ok @${state.kelvin}` : `na faixa mas instável`;
        out.final=state;
        break;
      }

      const diffNow = Math.abs(K-state.kelvin);
      const diffPrev= Math.abs(K-prev);
      if (diffNow>=diffPrev){
        if (CHUNK>1) CHUNK=Math.max(1,Math.floor(CHUNK/2));
        SLEEP = Math.min(300, SLEEP+20);
      }
      lastKelvin=state.kelvin;
    }
    out.final=state;
    return out;
  });
}

// ===== wb-k-snap =====
async function cmdWBKelvinSnap(kStr, bankOpt, tolStr, confirmStr){
  const K=Number(kStr); if(!Number.isFinite(K)){ console.error('Uso: wb-k-snap <kelvin> <"Memory A|Memory B"> [tol=4] [confirm=3]'); process.exit(1); }
  const TOL=Math.max(0, Number(tolStr||4));
  const CONF=Math.max(1, Number(confirmStr||3));

  await runAll(async ({cam,ctxRef})=>{
    const out={ target:K, tol:TOL, confirm:CONF, steps:0, phase:'coarse', progress:false, hist:[] };
    let state=await readKelvin(cam,ctxRef);
    const bank=(bankOpt?String(bankOpt):state.mode)||'Memory A';
    await setValue(cam,ctxRef,{"Camera.WhiteBalance.Mode":bank});
    await setValue(cam,ctxRef,{"Camera.WhiteBalance.SettingMethod":"Manual"});
    state=await readKelvin(cam,ctxRef); out.start=state;

    let noMove=0;
    let prev=null;

    // 1) aproximação
    while(!within(state.kelvin, K, TOL) && out.steps<500){
      const delta = K - state.kelvin;
      let mult = Math.abs(delta)>120 ? 4 : Math.abs(delta)>30 ? 2 : 1;
      const tickDir = delta>0 ? +1 : -1;
      for (let t=0;t<mult;t++){ await updateValue(cam,ctxRef,{"Camera.WhiteBalance.ColorTemperature.Value":tickDir}); }
      await sleep(100 + (mult-1)*60);

      prev=state.kelvin;
      state=await readKelvin(cam,ctxRef);
      out.steps++; out.progress ||= (state.kelvin!==prev);
      out.hist.push(state.kelvin);
      if (out.hist.length>16) out.hist.shift();
      console.log(`[snap/coarse] ${cam.ip} step=${out.steps} kelvin=${state.kelvin}`);

      // se cruzou o alvo, sai da coarse para dither/lock
      if (crossed(prev, state.kelvin, K)) break;

      if (state.kelvin===prev){
        noMove++;
        if (noMove>=10){
          await setValue(cam,ctxRef,{"Camera.WhiteBalance.SettingMethod":"Automatic"});
          await sleep(60);
          await setValue(cam,ctxRef,{"Camera.WhiteBalance.SettingMethod":"Manual"});
          const dir = (K>state.kelvin)? +1 : -1;
          for (let r=0;r<6;r++){ await updateValue(cam,ctxRef,{"Camera.WhiteBalance.ColorTemperature.Value":dir}); }
          await sleep(180);
          state=await readKelvin(cam,ctxRef);
          noMove=0;
        }
        if (out.steps===60 && !out.progress){
          const dir = (K>state.kelvin)? +1 : -1;
          for (let r=0;r<30;r++){ await updateValue(cam,ctxRef,{"Camera.WhiteBalance.ColorTemperature.Value":dir}); await sleep(20); }
          await sleep(180);
          state=await readKelvin(cam,ctxRef);
        }
      } else {
        noMove=0;
      }
    }

    // 1.5) trava de estrangulamento: alvo entre dois degraus (toggle A↔B)
    const togg = detectToggleAroundTarget(out.hist, K);
    if (togg && !within(state.kelvin, K, TOL)){
      const dLow  = Math.abs(K - togg.low);
      const dHigh = Math.abs(K - togg.high);
      const choose = (dHigh<=dLow) ? togg.high : togg.low;
      out.phase='lock';
      out.summary = `lock(straddle) escolher=${choose} (low=${togg.low} high=${togg.high} step=${togg.step})`;
      out.final = { mode:bank, kelvin: choose, raw: state.raw };
      return out; // PARA AQUI — não envia mais ticks
    }

    // 2) dither (com v1.13 guard: não manda tick dentro da tolerância)
    out.phase='dither';
    let consec=0, wait=90, last=state.kelvin, toggSign=+1;
    for (let i=0;i<200;i++){
      if (within(state.kelvin, K, TOL)){
        consec++;
        if (consec>=CONF){ out.summary=`ok @${state.kelvin}`; out.final=state; return out; }
        await sleep(120);
        const chk=await readKelvin(cam,ctxRef);
        state=chk; last=state.kelvin;
        continue; // não envia mais ±1 se já está na faixa
      } else {
        consec=0;
      }

      // Se ficar alternando 2 estados que abraçam o alvo, aplica lock
      out.hist.push(state.kelvin); if (out.hist.length>16) out.hist.shift();
      const togg2 = detectToggleAroundTarget(out.hist, K);
      if (togg2){
        const dLow  = Math.abs(K - togg2.low);
        const dHigh = Math.abs(K - togg2.high);
        const choose = (dHigh<=dLow) ? togg2.high : togg2.low;
        out.summary = `lock(straddle/dither) escolher=${choose} (low=${togg2.low} high=${togg2.high} step=${togg2.step})`;
        out.final = { mode:bank, kelvin: choose, raw: state.raw };
        return out;
      }

      const dir = (K>state.kelvin)? +1 : -1;
      await updateValue(cam,ctxRef,{"Camera.WhiteBalance.ColorTemperature.Value": dir });
      await sleep(wait);
      state=await readKelvin(cam,ctxRef);
      console.log(`[snap/dither] ${cam.ip} i=${i+1} kelvin=${state.kelvin}`);
      last=state.kelvin;
      wait = Math.min(220, wait + (toggSign>0? 10:0));
      toggSign*=-1;
    }
    out.summary='dither timeout'; out.final=state; return out;
  });
}

// ===== Zoom =====
async function cmdZoom(vel){ const v=Number(vel||0); await runAll(async ({cam,ctxRef})=>({ summary:`zoom ${v}`, upd: await updateValue(cam,ctxRef,{"Camera.Zoom.Velocity":v}) })); }
async function cmdZoomStop(){ return cmdZoom(0); }

// ===== dispatch =====
(async ()=>{
  const [,,cmd,...args]=process.argv;
  switch((cmd||'').toLowerCase()){
    case 'colorbars':   return cmdColorBars(args[0]);
    case 'rec':         return cmdRec(args[0]);
    case 'nd':          return cmdND(args[0], args[1]);
    case 'iris':        return cmdIris(args[0], args[1]);
    case 'shutter':     return cmdShutter(args[0]);
    case 'gain':        return cmdGain(args[0]);

    case 'wb-mode':     return cmdWBMode(args.join(' '));
    case 'wb-read':     return cmdWBRead();

    case 'wb-set':      return cmdWBSet(args[0], args[1]);               // escrita direta (pode falhar)
    case 'wb-k':        return cmdWBSet(args[0], args[1]);               // alias
    case 'wb-step':     return cmdWBStep(args[0]);
    case 'wb-slider':   return cmdWBSlider(args[0]);
    case 'wb-abs':      return cmdWBAbs(args[0], args[1]);

    case 'wb-k-quick':  return cmdWBKelvinQuick(args[0], args[1], args[2], args[3]);
    case 'wb-k-gentle': return cmdWBKelvinGentle(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7]);
    case 'wb-k-snap':   return cmdWBKelvinSnap(args[0], args[1], args[2], args[3]);   // v1.14 com straddle lock

    case 'zoom':        return cmdZoom(args[0]);
    case 'zoom-stop':   return cmdZoomStop();

    default:
      console.log(`z190-multi.js ${VERSION} — Comandos:

  colorbars on|off
  rec on|off
  nd manual <valor> | nd auto
  iris auto | iris manual <f-number>
  shutter <speed>          (ex: 1/100)
  gain <dB>                (ex: 9dB)

  wb-mode "<Preset|Memory A|Memory B>"
  wb-read

  wb-k-quick  <kelvin> <"Memory A|Memory B"> [maxSteps=120] [sleepMs=120]
  wb-k-gentle <kelvin> <"Memory A|Memory B"> [tol=5] [step=1] [chunk=1] [sleepMs=120] [maxLoops=1200] [confirm=3]
  wb-k-snap   <kelvin> <"Memory A|Memory B"> [tol=4] [confirm=3]   <-- v1.14: straddle lock + cruzamento->dither
  wb-set      <kelvin> [Preset|Memory A|Memory B]
  wb-step     +1|-1
  wb-slider   <int>
  wb-abs      <0..50000> [Preset|Memory A|Memory B]

  zoom <vel>  (-8..-1 wide, 0 stop, 1..8 tele)
  zoom-stop
`);
  }
})();
