/* Sdílené chování stránek: přepínání světlého/tmavého režimu
   + zvýraznění aktivní položky v navigaci. */
(function(){
  const KEY = 'rdmodrice-theme';

  function apply(theme){
    if(theme === 'light' || theme === 'dark'){
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      // "auto" – podle systému
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    }
  }

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch(e){}
  apply(saved);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{
    let s = null;
    try { s = localStorage.getItem(KEY); } catch(e){}
    if(!s) apply(null);
  });

  function currentIsDark(){
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  window.addEventListener('DOMContentLoaded', ()=>{
    const btn = document.querySelector('.theme-btn');
    if(btn){
      const setIcon = ()=>{ btn.textContent = currentIsDark() ? '☀️' : '🌙'; };
      setIcon();
      btn.addEventListener('click', ()=>{
        const next = currentIsDark() ? 'light' : 'dark';
        try { localStorage.setItem(KEY, next); } catch(e){}
        apply(next);
        setIcon();
      });
    }
    // aktivní odkaz v navigaci (podstránky typu pripojky-voda.html patří pod pripojky.html)
    const here = location.pathname.split('/').pop() || 'index.html';
    const parent = here.replace(/-[\w-]+\.html$/, '.html');
    const links = [...document.querySelectorAll('.navlinks a')];
    const cur = links.find(a => a.getAttribute('href') === here)
             || links.find(a => a.getAttribute('href') === parent);
    if(cur){
      cur.setAttribute('aria-current','page');
      const g = cur.closest('.navgroup');
      if(g) g.classList.add('has-current');
    }
    initNav();
  });

  /* Rozbalovací skupiny (počítač) a panel s celou navigací (mobil, tlačítko ☰). */
  function initNav(){
    const header = document.querySelector('.site-header');
    const toggle = document.querySelector('.nav-toggle');
    const groups = [...document.querySelectorAll('.navgroup')];
    if(!header || !groups.length) return;

    const closeGroups = (except)=>{
      groups.forEach(g=>{
        if(g === except) return;
        g.classList.remove('open');
        const b = g.querySelector('.navgroup-btn');
        if(b) b.setAttribute('aria-expanded','false');
      });
    };
    const setPanel = (open)=>{
      header.classList.toggle('nav-open', open);
      if(toggle) toggle.setAttribute('aria-expanded', String(open));
    };

    groups.forEach(g=>{
      const btn = g.querySelector('.navgroup-btn');
      if(!btn) return;
      btn.addEventListener('click', ()=>{
        const open = !g.classList.contains('open');
        closeGroups(g);
        g.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
    });
    if(toggle) toggle.addEventListener('click', ()=> setPanel(!header.classList.contains('nav-open')));

    document.addEventListener('click', e=>{
      if(!e.target.closest('.navgroup')) closeGroups(null);
      if(!e.target.closest('.navlinks') && !e.target.closest('.nav-toggle')) setPanel(false);
    });
    document.addEventListener('keydown', e=>{
      if(e.key !== 'Escape') return;
      const openGroup = groups.find(g => g.classList.contains('open'));
      if(openGroup){
        closeGroups(null);
        const b = openGroup.querySelector('.navgroup-btn');
        if(b) b.focus();
      }
      if(header.classList.contains('nav-open')){ setPanel(false); if(toggle) toggle.focus(); }
    });
  }
})();
