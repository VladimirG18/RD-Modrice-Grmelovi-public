/* ============================================================
   Jednoduchý „malovací" nástroj do náhledu (annotate).
   Nakreslí přes obrázek šipky / obdélníky / kolečka / čáry od ruky,
   ať jde v požadavku přesně označit, čeho se úprava týká.
   Kresba se skládá nad podkladový obrázek do jednoho canvasu, takže
   výsledek (getDataURL) obsahuje podklad i s kresbou.

   createAnnotator(canvas, toolbar) – postaví panel nástrojů do `toolbar`
   a obsluhuje kreslení na `canvas`. Vrací:
     setSize(w,h)   – rozlišení canvasu (= rozměr podkladu),
     setBase(src)   – podklad (Image nebo Canvas), vymaže kresbu,
     reset()        – smaže kresbu (podklad nechá),
     hasDrawing()   – je něco nakresleno?,
     getDataURL(q)  – JPEG data URL podkladu + kresby.
   ============================================================ */
export function createAnnotator(canvas, toolbar, opts = {}){
  const ctx = canvas.getContext('2d');

  const TOOLS = [
    { id:'arrow',   ic:'↗', name:'Šipka' },
    { id:'rect',    ic:'▭', name:'Obdélník' },
    { id:'ellipse', ic:'◯', name:'Kolečko' },
    { id:'pen',     ic:'✎', name:'Od ruky' },
  ];
  // volitelný „špendlík": klepnutím do náhledu se přes callback (raycast v modelu)
  // zjistí přesný bod a název dílu; zobrazí se značka a data se vrátí do požadavku.
  const hasPin = typeof opts.onPick === 'function';
  if(hasPin) TOOLS.push({ id:'pin', ic:'📍', name:'Špendlík – označ přesné místo' });
  const COLORS = ['#ff3b30','#ffcc00','#34c759','#0a84ff','#ffffff','#111111'];

  let base = null;      // podkladový obrázek/canvas
  let shapes = [];      // hotové tvary
  let cur = null;       // rozkreslený tvar
  let tool = 'arrow';
  let color = COLORS[0];
  let drawing = false;
  let pinMark = null;   // {x,y,label,data} – jeden špendlík (přesné místo úpravy)

  // zoom (přiblížení kvůli přesnějšímu kreslení) + posun scrollem v obalu
  let zoom = 1;
  const ZMIN = 1, ZMAX = 6;
  const wrap = () => canvas.parentElement;       // .req-canvas-wrap (scrollovací obal)
  let zoomLabel = null;
  function applyZoom(){
    canvas.style.width = (zoom * 100) + '%';     // podklad se roztáhne, obal scrolluje
    canvas.style.maxWidth = 'none';
    if(zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%';
  }
  // přiblížení/oddálení se středem v bodě (cx,cy) v souřadnicích obalu (viewport)
  function setZoom(z, cx, cy){
    const w = wrap(); if(!w) { zoom = Math.min(ZMAX, Math.max(ZMIN, z)); applyZoom(); return; }
    const r = w.getBoundingClientRect();
    if(cx == null){ cx = r.width / 2; cy = r.height / 2; }
    const nx = (w.scrollLeft + cx) / (canvas.offsetWidth || 1);   // relativní pozice v podkladu (0..1)
    const ny = (w.scrollTop + cy) / (canvas.offsetHeight || 1);
    zoom = Math.min(ZMAX, Math.max(ZMIN, Math.round(z * 100) / 100));
    applyZoom();
    // po změně šířky obnovit scroll tak, aby bod pod kurzorem zůstal na místě
    w.scrollLeft = nx * canvas.offsetWidth - cx;
    w.scrollTop  = ny * canvas.offsetHeight - cy;
  }

  const lineW = () => Math.max(2.5, Math.round(canvas.width / 200));

  /* ---- panel nástrojů ---- */
  const toolBtns = {}, colorBtns = {};
  const mkBtn = (html, title, cls) => {
    const b = document.createElement('button');
    b.type = 'button'; b.innerHTML = html; b.title = title; if(cls) b.className = cls;
    return b;
  };
  const sep = () => { const s = document.createElement('span'); s.className = 'sep'; return s; };
  if(toolbar){
    toolbar.innerHTML = '';
    TOOLS.forEach(t => { const b = mkBtn(t.ic, t.name); b.addEventListener('click', () => setTool(t.id)); toolbar.appendChild(b); toolBtns[t.id] = b; });
    toolbar.appendChild(sep());
    COLORS.forEach(c => { const b = mkBtn('', c, 'col'); b.style.background = c; b.addEventListener('click', () => setColor(c)); toolbar.appendChild(b); colorBtns[c] = b; });
    toolbar.appendChild(sep());
    const undoB = mkBtn('↶', 'Zpět'); undoB.addEventListener('click', () => { shapes.pop(); redraw(); }); toolbar.appendChild(undoB);
    const clrB  = mkBtn('🗑', 'Smazat kresbu'); clrB.addEventListener('click', () => { shapes = []; cur = null; pinMark = null; redraw(); }); toolbar.appendChild(clrB);
    toolbar.appendChild(sep());
    // ruka (posun po přiblíženém obrázku) – je to „nástroj" jako ostatní
    const panB = mkBtn('✋', 'Posun (táhni po obrázku)'); panB.addEventListener('click', () => setTool('pan')); toolbar.appendChild(panB); toolBtns['pan'] = panB;
    // zoom
    const zoomOut = mkBtn('−', 'Oddálit'); zoomOut.addEventListener('click', () => setZoom(zoom - 0.5)); toolbar.appendChild(zoomOut);
    zoomLabel = document.createElement('span'); zoomLabel.className = 'zoomlbl'; zoomLabel.textContent = '100%'; toolbar.appendChild(zoomLabel);
    const zoomIn  = mkBtn('+', 'Přiblížit'); zoomIn.addEventListener('click', () => setZoom(zoom + 0.5)); toolbar.appendChild(zoomIn);
    const zoomRst = mkBtn('⤢', 'Zpět na celý obrázek'); zoomRst.addEventListener('click', () => setZoom(1)); toolbar.appendChild(zoomRst);
  }
  function setTool(t){ tool = t; for(const id in toolBtns) toolBtns[id].classList.toggle('on', id === t); if(canvas) canvas.style.cursor = t === 'pan' ? 'grab' : 'crosshair'; }
  function setColor(c){ color = c; for(const k in colorBtns) colorBtns[k].classList.toggle('on', k === c); }
  setTool('arrow'); setColor(color);

  /* ---- kreslení ---- */
  function path(s){
    if(s.type === 'pen'){
      ctx.beginPath(); s.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    } else if(s.type === 'rect'){
      ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
    } else if(s.type === 'ellipse'){
      ctx.beginPath();
      ctx.ellipse((s.x0 + s.x1)/2, (s.y0 + s.y1)/2, Math.abs(s.x1 - s.x0)/2, Math.abs(s.y1 - s.y0)/2, 0, 0, Math.PI*2);
      ctx.stroke();
    } else if(s.type === 'arrow'){
      const ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0), h = s.lw * 4.2;
      ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x1 - h*Math.cos(ang - 0.42), s.y1 - h*Math.sin(ang - 0.42));
      ctx.lineTo(s.x1 - h*Math.cos(ang + 0.42), s.y1 - h*Math.sin(ang + 0.42));
      ctx.closePath(); ctx.fill();
    }
  }
  function drawShape(s){
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.lw;
    path(s);
  }
  // špendlík – terčík na přesném místě + „bublina" nad ním s hlavičkou a popiskem dílu
  function drawPin(m){
    const s = Math.max(9, Math.round(canvas.width / 48));   // velikost podle rozlišení podkladu
    const cx = m.x, cy = m.y - s * 2.0;                     // hlavička nad zaměřeným bodem
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
    // terčík na přesném bodě
    ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = Math.max(2, s * 0.18);
    ctx.beginPath(); ctx.arc(m.x, m.y, s * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(m.x, m.y, s * 0.09, 0, Math.PI * 2); ctx.fillStyle = '#ff3b30'; ctx.fill();
    // stopka + hlavička
    ctx.beginPath(); ctx.moveTo(m.x, m.y - s * 0.5); ctx.lineTo(cx, cy + s * 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.fillStyle = '#ff3b30'; ctx.fill();
    ctx.lineWidth = Math.max(2, s * 0.22); ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.36, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
    // popisek dílu vedle špendlíku (canvas umí diakritiku – používá systémové fonty)
    if(m.label){
      ctx.save();
      const fs = Math.max(12, Math.round(s * 1.15));
      ctx.font = `600 ${fs}px "Inter","Segoe UI",system-ui,sans-serif`;
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(m.label).width;
      const padX = fs * 0.5, padY = fs * 0.34, bh = fs + padY * 2;
      let bx = cx + s * 1.25, by = cy - bh / 2;
      if(bx + tw + padX * 2 > canvas.width) bx = cx - s * 1.25 - (tw + padX * 2);   // nevejde-li se doprava, dej doleva
      bx = Math.max(2, Math.min(bx, canvas.width - tw - padX * 2 - 2));
      by = Math.max(2, Math.min(by, canvas.height - bh - 2));
      ctx.fillStyle = 'rgba(17,21,28,.86)';
      if(ctx.roundRect){ ctx.beginPath(); ctx.roundRect(bx, by, tw + padX * 2, bh, 6); ctx.fill(); }
      else ctx.fillRect(bx, by, tw + padX * 2, bh);
      ctx.fillStyle = '#fff';
      ctx.fillText(m.label, bx + padX, by + bh / 2 + 0.5);
      ctx.restore();
    }
  }
  function redraw(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if(base) ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;  // halo pro čitelnost na světlém i tmavém
    shapes.forEach(drawShape);
    if(cur) drawShape(cur);
    ctx.restore();
    if(pinMark) drawPin(pinMark);
  }

  function pos(e){
    const r = canvas.getBoundingClientRect();
    return { x:(e.clientX - r.left) * (canvas.width / r.width), y:(e.clientY - r.top) * (canvas.height / r.height) };
  }
  let pan = null;   // {x,y,sl,st} – posun po přiblíženém obrázku
  canvas.addEventListener('pointerdown', e => {
    if(!base) return;
    try { canvas.setPointerCapture(e.pointerId); } catch(_){}
    if(tool === 'pan'){
      const w = wrap();
      pan = { x:e.clientX, y:e.clientY, sl:w?w.scrollLeft:0, st:w?w.scrollTop:0 };
      canvas.style.cursor = 'grabbing';
      return;
    }
    if(tool === 'pin'){
      const p = pos(e);
      const nx = p.x / (canvas.width || 1), ny = p.y / (canvas.height || 1);
      let data = null;
      try { data = opts.onPick(nx, ny); } catch(_){ data = null; }
      if(data){ pinMark = { x:p.x, y:p.y, label:data.label || '', data }; }
      else if(opts.onPickMiss) opts.onPickMiss();
      redraw();
      return;
    }
    drawing = true;
    const p = pos(e), lw = lineW();
    cur = tool === 'pen' ? { type:'pen', color, lw, pts:[p] } : { type:tool, color, lw, x0:p.x, y0:p.y, x1:p.x, y1:p.y };
    redraw();
  });
  canvas.addEventListener('pointermove', e => {
    if(pan){ const w = wrap(); if(w){ w.scrollLeft = pan.sl - (e.clientX - pan.x); w.scrollTop = pan.st - (e.clientY - pan.y); } return; }
    if(!drawing || !cur) return;
    const p = pos(e);
    if(cur.type === 'pen') cur.pts.push(p); else { cur.x1 = p.x; cur.y1 = p.y; }
    redraw();
  });
  const end = () => {
    if(pan){ pan = null; canvas.style.cursor = 'grab'; return; }
    if(!drawing) return; drawing = false;
    if(cur){
      const big = cur.type === 'pen' ? cur.pts.length > 1 : Math.hypot(cur.x1 - cur.x0, cur.y1 - cur.y0) > 5;
      if(big) shapes.push(cur);
    }
    cur = null; redraw();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);
  // kolečko myši = přiblížení/oddálení směrem ke kurzoru
  canvas.addEventListener('wheel', e => {
    if(!base) return;
    e.preventDefault();
    const w = wrap(); const r = w ? w.getBoundingClientRect() : canvas.getBoundingClientRect();
    setZoom(zoom + (e.deltaY < 0 ? 0.4 : -0.4), e.clientX - r.left, e.clientY - r.top);
  }, { passive:false });

  return {
    setSize(w, h){ canvas.width = w; canvas.height = h; redraw(); },
    setBase(src){ base = src; shapes = []; cur = null; pinMark = null; zoom = 1; applyZoom(); if(wrap()){ wrap().scrollLeft = 0; wrap().scrollTop = 0; } redraw(); },
    reset(){ shapes = []; cur = null; pinMark = null; redraw(); },
    hasDrawing(){ return shapes.length > 0 || !!pinMark; },
    getPin(){ return pinMark ? pinMark.data : null; },
    getDataURL(q){ return canvas.toDataURL('image/jpeg', q || 0.72); },
  };
}
