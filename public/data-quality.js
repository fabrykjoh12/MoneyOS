const dqMoney=new Intl.NumberFormat('nb-NO',{maximumFractionDigits:0});
const dqDate=new Intl.DateTimeFormat('nb-NO',{day:'numeric',month:'short'});
let dqData=null,dqLoading=false;
function dqKr(v){return `${dqMoney.format(Number(v||0))} kr`}
function dqEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dqParse(v){return v?new Date(`${String(v).slice(0,10)}T12:00:00`):null}
function dqEnsure(){
  if(document.getElementById('data-quality'))return true;
  const attention=document.querySelector('[data-view-panel="today"] .attention-section');if(!attention)return false;
  const el=document.createElement('section');el.id='data-quality';el.className='dq-section';
  el.innerHTML=`<div class="dq-head"><div><p class="panel-kicker">DATAKVALITET</p><h2>Rydd opp</h2><p>MoneyOS viser bare ting som faktisk kan forbedre regnskapet.</p></div><button id="dq-apply" class="hidden" type="button">Bruk lagrede regler</button></div><div id="dq-summary" class="dq-summary"></div><div id="dq-list" class="dq-list"></div><button id="dq-more" class="dq-more hidden" type="button">Vis alle</button>`;
  attention.insertAdjacentElement('afterend',el);
  document.getElementById('dq-apply')?.addEventListener('click',dqApplyRules);
  document.getElementById('dq-more')?.addEventListener('click',()=>{el.classList.toggle('expanded');document.getElementById('dq-more').textContent=el.classList.contains('expanded')?'Vis færre':'Vis alle'});
  return true;
}
function dqRender(){
  if(!dqData||!dqEnsure())return;
  const c=dqData.counts??{},issues=dqData.issues??[];
  const summary=document.getElementById('dq-summary');
  if(!issues.length) summary.innerHTML='<div class="dq-clean"><span></span><div><strong>Regnskapet ser ryddig ut</strong><p>Ingen bokførte poster trenger manuell opprydding akkurat nå.</p></div></div>';
  else summary.innerHTML=`<div class="dq-count"><strong>${c.fix||0}</strong><span>trenger vurdering</span></div><div class="dq-count"><strong>${c.auto||0}</strong><span>kan fikses av regler</span></div>${c.wait?`<div class="dq-count"><strong>${c.wait}</strong><span>venter på banken</span></div>`:''}`;
  const apply=document.getElementById('dq-apply');apply.classList.toggle('hidden',!(c.auto>0));apply.textContent=c.auto>0?`Bruk regler på ${c.auto}`:'Bruk lagrede regler';
  document.getElementById('dq-list').innerHTML=issues.map((x,i)=>`<button class="dq-item ${dqEsc(x.severity)}${i>=5?' dq-extra':''}" data-dq-id="${dqEsc(x.id)}" type="button" ${x.severity==='wait'?'disabled':''}><span class="dq-dot"></span><div><strong>${dqEsc(x.title)}</strong><p>${dqEsc(x.copy)}</p></div><small>${dqDate.format(dqParse(x.transaction?.transaction_date))}</small>${x.severity!=='wait'?'<b>Rett →</b>':'<b>Avvent</b>'}</button>`).join('');
  document.querySelectorAll('[data-dq-id]:not([disabled])').forEach(btn=>btn.addEventListener('click',()=>{document.querySelector('[data-view="money"]')?.click();setTimeout(()=>document.dispatchEvent(new CustomEvent('moneyos:open-transaction',{detail:{id:btn.dataset.dqId}})),180)}));
  document.getElementById('dq-more').classList.toggle('hidden',issues.length<=5);
}
async function dqApplyRules(){
  const btn=document.getElementById('dq-apply');btn.disabled=true;btn.textContent='Rydder…';
  try{const r=await fetch('/api/data-quality',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'apply_rules'})});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Kunne ikke bruke reglene');btn.textContent=`${body.updated||0} oppdatert`;document.getElementById('refresh')?.click();setTimeout(dqLoad,700)}catch(e){btn.textContent=e.message}finally{setTimeout(()=>{btn.disabled=false},900)}}
async function dqLoad(){if(dqLoading||!dqEnsure())return;const app=document.getElementById('app');if(!app||app.classList.contains('hidden'))return;dqLoading=true;try{const r=await fetch('/api/data-quality',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;dqData=await r.json();dqRender()}finally{dqLoading=false}}
function dqBoot(){const app=document.getElementById('app');const run=()=>{if(app&&!app.classList.contains('hidden'))setTimeout(dqLoad,220)};run();if(app)new MutationObserver(run).observe(app,{attributes:true,attributeFilter:['class']});document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(dqLoad,750))}
dqBoot();
