const teMoney = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const teDate = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
let teRows = [];
let teCategories = [];
let teCurrent = null;
let teLoading = false;

function teEsc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function teKr(v){ return `${teMoney.format(Number(v ?? 0))} kr`; }
function teInitials(v){ const s=String(v||'').trim(); if(!s) return '•'; const p=s.split(/\s+/); return (p.length===1?p[0].slice(0,2):p[0][0]+p[p.length-1][0]).toUpperCase(); }
function teMerchant(raw, description=''){
  const s=String(raw || description || '').trim();
  const l=s.toLowerCase();
  if(/rema/.test(l)) return 'REMA 1000';
  if(/easypark/.test(l)) return 'EasyPark';
  if(/apple\.com|apple com|apple/.test(l)) return 'Apple';
  if(/anthropic|claude/.test(l)) return 'Claude';
  if(/openai|chatgpt/.test(l)) return 'ChatGPT';
  if(/youtube/.test(l)) return 'YouTube Premium';
  if(/google.*one/.test(l)) return 'Google One';
  if(/adobe/.test(l)) return 'Adobe';
  if(/supabase/.test(l)) return 'Supabase';
  if(/higgsfield/.test(l)) return 'Higgsfield';
  if(/meny/.test(l)) return 'MENY';
  if(/circle k/.test(l)) return 'Circle K';
  if(/telia/.test(l)) return 'Telia';
  if(/telenor/.test(l)) return 'Telenor';
  return s || 'Transaksjon';
}

function teEnsureSheet(){
  if(document.getElementById('te-backdrop')) return;
  const el=document.createElement('div');
  el.id='te-backdrop';
  el.className='te-backdrop hidden';
  el.innerHTML=`<section class="te-sheet" role="dialog" aria-modal="true" aria-labelledby="te-title">
    <div class="te-head"><div><p class="panel-kicker">TRANSAKSJON</p><h2 id="te-title">—</h2><p id="te-meta">—</p></div><button id="te-close" type="button">Lukk</button></div>
    <div class="te-amount" id="te-amount">—</div>
    <div id="te-pending" class="te-warning hidden">Reservert transaksjon. Vent til banken har bokført den før du endrer noe.</div>
    <form id="te-form">
      <label>Merchant<input id="te-merchant" maxlength="160" /></label>
      <label>Kategori<select id="te-category"></select></label>
      <label>Type<select id="te-type"><option value="expense">Utgift</option><option value="income">Inntekt</option><option value="transfer">Intern overføring</option></select></label>
      <div class="te-raw"><span>Bankens råtekst</span><p id="te-description">—</p></div>
      <div class="te-actions"><button id="te-cancel" type="button">Avbryt</button><button id="te-save" type="submit">Lagre endring</button></div>
      <p id="te-error" class="te-error"></p>
    </form>
  </section>`;
  document.body.appendChild(el);
  document.getElementById('te-close')?.addEventListener('click',teClose);
  document.getElementById('te-cancel')?.addEventListener('click',teClose);
  el.addEventListener('click',e=>{if(e.target===el)teClose();});
  document.getElementById('te-form')?.addEventListener('submit',teSave);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')teClose();});
}

async function teLoad(){
  if(teLoading) return;
  teLoading=true;
  try{
    const r=await fetch('/api/transactions?limit=120',{credentials:'same-origin',cache:'no-store'});
    if(!r.ok) return;
    const body=await r.json();
    teRows=body.transactions??[];
    teCategories=body.categories??[];
    teRender();
  }finally{teLoading=false;}
}

function teRender(){
  const root=document.getElementById('transaction-list');
  if(!root||!teRows.length) return;
  const input=document.getElementById('money-search');
  const q=String(input?.value||'').trim().toLowerCase();
  const rows=q?teRows.filter(x=>[x.merchant,x.description,x.category,x.account,teMerchant(x.merchant,x.description)].some(v=>String(v??'').toLowerCase().includes(q))):teRows;
  const count=document.getElementById('transaction-count'); if(count) count.textContent=`${rows.length} vist`;
  root.innerHTML=rows.map(x=>{
    const label=teMerchant(x.merchant,x.description);
    const sign=x.transaction_type==='income'?'+':x.transaction_type==='transfer'?'↔ ':'−';
    return `<button class="transaction-row te-row" data-te-id="${teEsc(x.id)}" type="button">
      <div class="transaction-date">${teDate.format(new Date(`${String(x.transaction_date).slice(0,10)}T12:00:00`)).replace(/\.\s?/g,' ')}</div>
      <div class="merchant-mark">${teEsc(teInitials(label))}</div>
      <div><div class="row-title">${teEsc(label)}</div><div class="row-sub">${teEsc(x.category||'Annet')} · ${teEsc(x.account||'')}${x.is_pending?' · Reservert':''}</div></div>
      <div class="amount ${teEsc(x.transaction_type)}">${sign}${teKr(x.amount)}</div>
    </button>`;
  }).join('') || '<div class="row-sub">Ingen treff.</div>';
  root.querySelectorAll('[data-te-id]').forEach(b=>b.addEventListener('click',()=>teOpen(b.dataset.teId)));
}

function teOpen(id){
  teEnsureSheet();
  teCurrent=teRows.find(x=>String(x.id)===String(id)); if(!teCurrent) return;
  const label=teMerchant(teCurrent.merchant,teCurrent.description);
  document.getElementById('te-title').textContent=label;
  document.getElementById('te-meta').textContent=`${teCurrent.account||'Ukjent konto'} · ${teDate.format(new Date(`${String(teCurrent.transaction_date).slice(0,10)}T12:00:00`))}`;
  document.getElementById('te-amount').textContent=`${teCurrent.transaction_type==='income'?'+':teCurrent.transaction_type==='expense'?'−':'↔ '}${teKr(teCurrent.amount)}`;
  document.getElementById('te-merchant').value=teCurrent.merchant||label||'';
  const select=document.getElementById('te-category');
  select.innerHTML=teCategories.map(c=>`<option value="${teEsc(c)}"${c===teCurrent.category?' selected':''}>${teEsc(c)}</option>`).join('');
  document.getElementById('te-type').value=teCurrent.transaction_type||'expense';
  document.getElementById('te-description').textContent=teCurrent.description||'Ingen råtekst';
  document.getElementById('te-error').textContent='';
  const pending=!!teCurrent.is_pending;
  document.getElementById('te-pending').classList.toggle('hidden',!pending);
  document.getElementById('te-save').disabled=pending;
  document.getElementById('te-merchant').disabled=pending;
  document.getElementById('te-category').disabled=pending;
  document.getElementById('te-type').disabled=pending;
  document.getElementById('te-backdrop').classList.remove('hidden');
  document.body.classList.add('sheet-open');
}

function teClose(){ document.getElementById('te-backdrop')?.classList.add('hidden'); document.body.classList.remove('sheet-open'); teCurrent=null; }

async function teSave(e){
  e.preventDefault(); if(!teCurrent||teCurrent.is_pending) return;
  const save=document.getElementById('te-save'); const error=document.getElementById('te-error');
  save.disabled=true; save.textContent='Lagrer…'; error.textContent='';
  try{
    const payload={id:teCurrent.id,merchant:document.getElementById('te-merchant').value.trim(),category:document.getElementById('te-category').value,transaction_type:document.getElementById('te-type').value};
    const r=await fetch('/api/transactions',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const body=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(body.error||'Kunne ikke lagre');
    teClose();
    await teLoad();
    document.getElementById('refresh')?.click();
    setTimeout(teLoad,600);
  }catch(err){ error.textContent=err.message; }
  finally{save.disabled=false;save.textContent='Lagre endring';}
}

function teBoot(){
  teEnsureSheet();
  const app=document.getElementById('app');
  const run=()=>{if(app&&!app.classList.contains('hidden'))setTimeout(teLoad,120);};
  run();
  if(app)new MutationObserver(run).observe(app,{attributes:true,attributeFilter:['class']});
  document.getElementById('money-search')?.addEventListener('input',()=>setTimeout(teRender,0));
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(teLoad,650));
}

teBoot();
