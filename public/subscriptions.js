const subMoney = new Intl.NumberFormat('nb-NO',{maximumFractionDigits:0});
const subMoney2 = new Intl.NumberFormat('nb-NO',{minimumFractionDigits:0,maximumFractionDigits:2});
const subDate = new Intl.DateTimeFormat('nb-NO',{day:'numeric',month:'short'});
let subData=null;
let subLoading=false;

function subN(v){return Number(v??0)}
function subKr(v,p=false){return `${(p?subMoney2:subMoney).format(subN(v))} kr`}
function subEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function subParse(v){if(!v)return null;return new Date(`${String(v).slice(0,10)}T12:00:00`)}
function subCadence(v){return ({monthly:'Månedlig',quarterly:'Kvartalsvis',yearly:'Årlig',weekly:'Ukentlig'})[v]||v||'Fast'}

function ensureSubscriptions(){
  const fixed=document.querySelector('.fixed-section');
  if(!fixed)return false;
  if(!document.getElementById('open-subscriptions')){
    const btn=document.createElement('button');
    btn.id='open-subscriptions';
    btn.type='button';
    btn.className='sub-open';
    btn.textContent='Se alle faste kostnader →';
    btn.addEventListener('click',openSubscriptions);
    fixed.appendChild(btn);
  }
  if(!document.getElementById('subscriptions-backdrop')){
    const back=document.createElement('div');
    back.id='subscriptions-backdrop';
    back.className='subscriptions-backdrop hidden';
    back.innerHTML=`<section class="subscriptions-sheet" role="dialog" aria-modal="true" aria-labelledby="subscriptions-title">
      <div class="sub-head"><div><p class="panel-kicker">FASTE KOSTNADER</p><h2 id="subscriptions-title">Hva koster det å bare fortsette?</h2><p>Kun bekreftede faste kostnader. Mulige trekk som fortsatt trenger avklaring er ikke med.</p></div><button id="close-subscriptions" type="button">Lukk</button></div>
      <div class="sub-summary"><div><span>Per måned</span><strong id="sub-monthly">—</strong></div><div><span>Per år</span><strong id="sub-yearly">—</strong></div><div><span>Antall</span><strong id="sub-count">—</strong></div></div>
      <div class="sub-section-head"><div><span>Rangert etter månedskostnad</span><small>Trykkbar redigering kommer senere</small></div></div>
      <div id="sub-list" class="sub-list"></div>
      <div id="sub-top" class="sub-top"></div>
    </section>`;
    document.body.appendChild(back);
    document.getElementById('close-subscriptions')?.addEventListener('click',closeSubscriptions);
    back.addEventListener('click',e=>{if(e.target===back)closeSubscriptions()});
  }
  return true;
}

async function loadSubscriptions(){
  if(subLoading)return;
  const app=document.getElementById('app');if(!app||app.classList.contains('hidden'))return;
  subLoading=true;
  try{const r=await fetch('/api/dashboard',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;subData=await r.json();ensureSubscriptions();renderSubscriptions();}
  finally{subLoading=false}
}

function renderSubscriptions(){
  if(!subData||!ensureSubscriptions())return;
  const items=[...(subData.fixed_costs??[])].sort((a,b)=>subN(b.monthly_amount)-subN(a.monthly_amount));
  const monthly=items.reduce((s,x)=>s+subN(x.monthly_amount),0);
  document.getElementById('sub-monthly').textContent=subKr(monthly,true);
  document.getElementById('sub-yearly').textContent=subKr(monthly*12);
  document.getElementById('sub-count').textContent=String(items.length);
  document.getElementById('sub-list').innerHTML=items.map((x,i)=>{const due=subParse(x.next_due_date);return `<div class="sub-row"><div class="sub-rank">${String(i+1).padStart(2,'0')}</div><div><strong>${subEsc(x.name)}</strong><span>${subEsc(x.category||'Fast kostnad')} · ${subCadence(x.cadence)}${due?` · neste ${subDate.format(due)}`:''}</span></div><div class="sub-amount"><strong>${subKr(x.monthly_amount,true)}</strong><span>${subKr(subN(x.monthly_amount)*12)}/år</span></div></div>`}).join('')||'<div class="sub-empty">Ingen bekreftede faste kostnader.</div>';
  const top=items.slice(0,3);const topSum=top.reduce((s,x)=>s+subN(x.monthly_amount),0);
  document.getElementById('sub-top').innerHTML=top.length?`<p><strong>De tre største står for ${monthly>0?Math.round(topSum/monthly*100):0}% av de faste kostnadene.</strong> ${top.map(x=>subEsc(x.name)).join(', ')} koster samlet ${subKr(topSum,true)} per måned.</p>`:'';
}

function openSubscriptions(){if(!subData){loadSubscriptions().then(openSubscriptions);return}renderSubscriptions();document.getElementById('subscriptions-backdrop')?.classList.remove('hidden');document.body.classList.add('sheet-open')}
function closeSubscriptions(){document.getElementById('subscriptions-backdrop')?.classList.add('hidden');document.body.classList.remove('sheet-open')}

function bootSubscriptions(){
  const app=document.getElementById('app');if(!app)return;
  const run=()=>{if(!app.classList.contains('hidden'))loadSubscriptions()};
  run();new MutationObserver(run).observe(app,{attributes:true,attributeFilter:['class']});
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(loadSubscriptions,250));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSubscriptions()});
}
bootSubscriptions();
