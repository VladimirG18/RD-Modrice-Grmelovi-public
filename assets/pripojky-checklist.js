/* Checklist úkolů u jednotlivých přípojek (elektřina/plyn/voda/kanalizace) –
   odškrtávání se ukládá do localStorage, sdílené napříč podstránkami. */
(function(){
  const KEY = 'rdmodrice-stavba-checklist-v1';
  let state = {};
  try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch(e){ state = {}; }

  document.querySelectorAll('.clitem[data-id]').forEach(div=>{
    const id = div.getAttribute('data-id');
    const cb = div.querySelector('input[type=checkbox]');
    cb.checked = !!state[id];
    if(cb.checked) div.classList.add('done');
    const toggle = (fromLabel)=>{
      if(fromLabel) cb.checked = !cb.checked;
      state[id] = cb.checked;
      div.classList.toggle('done', cb.checked);
      try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){}
    };
    cb.addEventListener('click', e=>{ e.stopPropagation(); toggle(false); });
    div.addEventListener('click', ()=> toggle(true));
  });
})();
