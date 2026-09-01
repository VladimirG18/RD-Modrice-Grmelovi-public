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
export function createAnnotator(canvas, toolbar){
  const ctx = canvas.getContext('2d');

  const TOOLS = [
    { id:'arrow',   ic:'↗', name:'Šipka' },
    { id:'rect',    ic:'▭', name:'Obdélník' },
    { id:'ellipse', ic:'◯', name:'Kolečko' },
    { id:'pen',     ic:'✎', name:'Od ruky' },
  ];
  const COLORS = ['#ff3b30','#ffcc00','#34c759','#0a84ff','#ffffff','#111111'];

  let base = null;      // podkladový obrázek/canvas
  let shapes = [];      // hotové tvary
  let cur = null;       // rozkreslený tvar
  let tool = 'arrow';
  let color = COLORS[0];
  let drawing = false;

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
    const clrB  = mkBtn('🗑', 'Smazat kresbu'); clrB.addEventListener('click', () => { shapes = []; cur = null; redraw(); }); toolbar.appendChild(clrB);
  }
  function setTool(t){ tool = t; for(const id in toolBtns) toolBtns[id].classList.toggle('on', id === t); }
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
  function redraw(){
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if(base) ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;  // halo pro čitelnost na světlém i tmavém
    shapes.forEach(drawShape);
    if(cur) drawShape(cur);
    ctx.restore();
  }

  function pos(e){
    const r = canvas.getBoundingClientRect();
    return { x:(e.clientX - r.left) * (canvas.width / r.width), y:(e.clientY - r.top) * (canvas.height / r.height) };
  }
  canvas.addEventListener('pointerdown', e => {
    if(!base) return;
    drawing = true; try { canvas.setPointerCapture(e.pointerId); } catch(_){}
    const p = pos(e), lw = lineW();
    cur = tool === 'pen' ? { type:'pen', color, lw, pts:[p] } : { type:tool, color, lw, x0:p.x, y0:p.y, x1:p.x, y1:p.y };
    redraw();
  });
  canvas.addEventListener('pointermove', e => {
    if(!drawing || !cur) return;
    const p = pos(e);
    if(cur.type === 'pen') cur.pts.push(p); else { cur.x1 = p.x; cur.y1 = p.y; }
    redraw();
  });
  const end = () => {
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

  return {
    setSize(w, h){ canvas.width = w; canvas.height = h; redraw(); },
    setBase(src){ base = src; shapes = []; cur = null; redraw(); },
    reset(){ shapes = []; cur = null; redraw(); },
    hasDrawing(){ return shapes.length > 0; },
    getDataURL(q){ return canvas.toDataURL('image/jpeg', q || 0.72); },
  };
}
