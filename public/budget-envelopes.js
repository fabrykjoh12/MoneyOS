const beMoney = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const beLabels = {
  fixed_nok: ['Faste', 'Abonnementer og bekreftede faste kostnader'],
  essential_nok: ['Nødvendig', 'Mat, transport, helse og nødvendig hverdag'],
  true_expenses_nok: ['True Expenses', 'Ujevne kostnader og sinking funds'],
  savings_nok: ['Sparing', 'Spare- og reservemål for måneden'],
  flex_nok: ['Fri pott', 'Restaurant, shopping, fritid og andre valg']
};
let beData = null;
let beBusy = false;

function beN(v){ return Number(v ?? 0); }
function beKr(v){ return `${beMoney.format(beN(v))} kr`; }
function beMonth(){ return document.getElementById('bf-month')?.value || (()=>{const d=new Date();d.setMonth(d.getMonth()+1,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`})() }
function bePct(a,b){ return b > 0 ? Math.min(100, Math.max(0, a / b * 100)) : (a > 0 ? 100 : 0); }
function beEnsure(){
  const funding = document.getElementById('budget-funding');
  if(!funding || document.getElementById('budget-envelopes')) return !!funding;
  const el = document.createElement('section');
  el.id = 'budget-envelopes';
  el.className = 'be-section';
  el.innerHTML = `
    <div class="be-head">
      <div><p class="panel-kicker">HVER KRONE HAR EN JOBB</p><h2>Jobbfordeling for måneden</h2><p>Dette er den eksplisitte fordelingen av månedsreserven — ikke bare et totalbeløp.</p></div>
      <button id="be-edit" type="button">Flytt mellom jobber</button>
    </div>
    <div id="be-legacy" class="be-legacy hidden"></div>
    <div class="be-total"><div><span>RESERVERT TIL MÅNEDEN</span><strong id="be-total">—</strong></div><div><span>DEKKER PLANJOBBER</span><strong id="be-covered">—</strong></div><div><span>UTEN JOBB</span><strong id="be-unassigned">—</strong></div></div>
    <div id="be-jobs" class="be-jobs"></div>
    <p id="be-note" class="be-note"></p>`;
  const levels = funding.querySelector('.bf-levels');
  if(levels) levels.insertAdjacentElement('afterend', el); else funding.appendChild(el);
  document.getElementById('be-edit')?.addEventListener('click', beOpen);
  beEnsureModal();
  const month = document.getElementById('bf-month');
  if(month && !month.dataset.beBound){ month.dataset.beBound='1'; month.addEventListener('change',()=>setTimeout(beLoad,250)); }
  return true;
}
function beEnsureModal(){
  if(document.getElementById('be-backdrop')) return;
  const el = document.createElement('div');
  el.id='be-backdrop'; el.className='be-backdrop hidden';
  el.innerHTML=`<section class="be-modal" role="dialog" aria-modal="true">
    <div class="be-modal-head"><div><p class="panel-kicker">OMFORDEL RESERVEN</p><h2>Flytt penger mellom jobber</h2><p>Total månedsreserve endres ikke her. Bruk «Finansier neste måned» for å øke eller redusere totalen.</p></div><button id="be-close" type="button">Lukk</button></div>
    <div id="be-editor" class="be-editor"></div>
    <div class="be-modal-total"><span>Skal fortsatt være reservert</span><strong id="be-modal-total">—</strong></div>
    <div class="be-modal-total secondary"><span>Blir uten spesifikk jobb</span><strong id="be-modal-unassigned">—</strong></div>
    <div class="be-actions"><button id="be-cancel" type="button">Avbryt</button><button id="be-save" type="button">Lagre jobbfordeling</button></div><p id="be-error" class="be-error"></p>
  </section>`;
  document.body.appendChild(el);
  ['be-close','be-cancel'].forEach(id=>document.getElementById(id)?.addEventListener('click',beClose));
  el.addEventListener('click',e=>{ if(e.target===el) beClose(); });
  document.getElementById('be-save')?.addEventListener('click',beSave);
}
function beRender(){
  if(!beData || !beEnsure()) return;
  const jobs=beData.funding_buckets??{}, goals=beData.funding_goals??{}, covered=beData.funding_covered_buckets??{}, gaps=beData.funding_gaps??{};
  document.getElementById('be-total').textContent=beKr(beData.funded_nok);
  document.getElementById('be-covered').textContent=beKr(beData.funded_covered_nok);
  document.getElementById('be-unassigned').textContent=beKr(jobs.unassigned_nok);
  document.getElementById('be-unassigned').classList.toggle('warn',beN(jobs.unassigned_nok)>0);
  document.getElementById('be-edit').disabled=beN(beData.funded_nok)<=0;
  document.getElementById('be-jobs').innerHTML=Object.entries(beLabels).map(([key,[label,copy]])=>{
    const funded=beN(jobs[key]), goal=beN(goals[key]), gap=beN(gaps[key]), pct=bePct(beN(covered[key]),goal);
    const complete=goal<=0 || gap<=0.01;
    return `<div class="be-job ${complete?'done':''}"><div class="be-job-main"><div><strong>${label}</strong><span>${copy}</span></div><div><b>${beKr(funded)}</b><small>av ${beKr(goal)}</small></div></div><div class="be-track"><i style="width:${pct}%"></i></div><div class="be-job-meta"><span>${goal<=0?'Ikke i denne månedsplanen':complete?'Dekket':`${beKr(gap)} mangler`}</span><span>${Math.round(pct)}%</span></div></div>`;
  }).join('');
  const legacy=document.getElementById('be-legacy');
  if(beData.funding_legacy_derived){
    legacy.classList.remove('hidden');
    legacy.innerHTML=`<div><strong>Eldre reserve · jobbene er foreløpig avledet</strong><p>MoneyOS har fordelt den gamle totalsummen etter prioritet: faste → nødvendig → True Expenses → sparing → fri pott. Lagre for å gjøre dette eksplisitt i privat konfigurasjon.</p></div><button id="be-migrate" type="button">Lagre jobbfordeling</button>`;
    document.getElementById('be-migrate')?.addEventListener('click',beMigrate);
  } else legacy.classList.add('hidden');
  const note=document.getElementById('be-note');
  note.textContent=beN(jobs.unassigned_nok)>0?`${beKr(jobs.unassigned_nok)} er fortsatt reservert til måneden, men mangler en konkret jobb. Integritetskontrollen vil behandle dette som noe som bør ryddes opp.`:'Hele månedsreserven har en eksplisitt jobb.';
}
function beOpen(){
  if(!beData || beN(beData.funded_nok)<=0) return;
  beEnsureModal();
  const jobs=beData.funding_buckets??{},goals=beData.funding_goals??{};
  document.getElementById('be-editor').innerHTML=Object.entries(beLabels).map(([key,[label,copy]])=>`<label><div><strong>${label}</strong><span>${copy} · mål ${beKr(goals[key])}</span></div><div class="be-input"><input data-be-key="${key}" type="number" min="0" max="${beN(goals[key])}" step="100" value="${beN(jobs[key])}"><span>kr</span></div></label>`).join('');
  document.getElementById('be-modal-total').textContent=beKr(beData.funded_nok);
  document.getElementById('be-error').textContent='';
  document.querySelectorAll('[data-be-key]').forEach(input=>input.addEventListener('input',beUpdateModal));
  beUpdateModal();
  document.getElementById('be-backdrop').classList.remove('hidden');
  document.body.classList.add('sheet-open');
}
function beUpdateModal(){
  if(!beData) return;
  const sum=[...document.querySelectorAll('[data-be-key]')].reduce((s,input)=>s+Math.max(0,beN(input.value)),0);
  const unassigned=Math.max(0,beN(beData.funded_nok)-sum);
  const over=sum-beN(beData.funded_nok);
  document.getElementById('be-modal-unassigned').textContent=over>0?`${beKr(over)} for mye`:beKr(unassigned);
  document.getElementById('be-modal-unassigned').classList.toggle('warn',Math.abs(over)>0.01||unassigned>0.01);
  const save=document.getElementById('be-save'); if(save) save.disabled=over>0.01;
}
function beClose(){ document.getElementById('be-backdrop')?.classList.add('hidden'); document.body.classList.remove('sheet-open'); }
async function bePost(payload){
  const r=await fetch('/api/budget-funding',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({month:beMonth(),...payload})});
  const body=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(body.error||'Kunne ikke oppdatere jobbfordelingen');
  beData=body; beRender();
  document.getElementById('refresh')?.click();
  document.dispatchEvent(new CustomEvent('moneyos:budget-updated'));
  return body;
}
async function beSave(){
  const error=document.getElementById('be-error'),save=document.getElementById('be-save');
  const buckets={};
  let sum=0;
  document.querySelectorAll('[data-be-key]').forEach(input=>{const v=Math.max(0,beN(input.value));buckets[input.dataset.beKey]=v;sum+=v;});
  if(sum>beN(beData.funded_nok)+0.01){error.textContent='Jobbene kan ikke bruke mer enn den eksisterende månedsreserven.';return}
  buckets.unassigned_nok=Math.max(0,beN(beData.funded_nok)-sum);
  save.disabled=true;save.textContent='Lagrer…';error.textContent='';
  try{await bePost({action:'set_bucket_funding',buckets});beClose()}catch(err){error.textContent=err.message}finally{save.disabled=false;save.textContent='Lagre jobbfordeling'}
}
async function beMigrate(){
  const btn=document.getElementById('be-migrate'); if(btn){btn.disabled=true;btn.textContent='Lagrer…'}
  try{await bePost({action:'migrate_month_allocation'})}catch(err){if(btn){btn.disabled=false;btn.textContent=err.message}}
}
async function beLoad(){
  if(beBusy)return;
  const app=document.getElementById('app');if(!app||app.classList.contains('hidden'))return;
  beBusy=true;
  try{
    for(let i=0;i<25&&!beEnsure();i++)await new Promise(r=>setTimeout(r,80));
    const r=await fetch(`/api/budget-funding?month=${encodeURIComponent(beMonth())}`,{credentials:'same-origin',cache:'no-store'});
    if(r.ok){beData=await r.json();beRender()}
  }finally{beBusy=false}
}
function beBoot(){
  const app=document.getElementById('app');
  const run=()=>{if(app&&!app.classList.contains('hidden'))setTimeout(beLoad,800)};
  run();if(app)new MutationObserver(run).observe(app,{attributes:true,attributeFilter:['class']});
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(beLoad,1300));
  document.addEventListener('moneyos:budget-updated',()=>setTimeout(beLoad,450));
  setTimeout(beLoad,2100);
}
beBoot();
