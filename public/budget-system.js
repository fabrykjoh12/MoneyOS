const bsMoney = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const bsMonthFmt = new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric' });
let bsData = null;
let bsLoading = false;
let bsMonth = new Date().toISOString().slice(0, 7);
let bsFundDraft = [];

function bsN(v){ return Number(v ?? 0); }
function bsKr(v){ return `${bsMoney.format(bsN(v))} kr`; }
function bsEsc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function bsMonthDate(key){ const [y,m]=String(key).split('-').map(Number); return new Date(y,m-1,1,12); }
function bsTitle(v){ return v ? v[0].toUpperCase()+v.slice(1) : v; }
function bsPct(used,budget){ return budget>0 ? Math.min(100, Math.max(0, used/budget*100)) : 0; }
function bsBucketLabel(bucket){ return ({fixed:'Faste',essential:'Nødvendig',flex:'Fri pott',excluded:'Utenfor budsjett'})[bucket] || bucket; }

function bsEnsure(){
  const panel=document.querySelector('[data-view-panel="money"] .money-shell');
  const balance=panel?.querySelector('.money-balance');
  if(!panel||!balance||document.getElementById('budget-system'))return !!panel;
  const el=document.createElement('section');
  el.id='budget-system';el.className='bs-section';
  el.innerHTML=`
    <div class="bs-head">
      <div><p class="panel-kicker">BUDSJETT</p><h2>Hva kan pengene dine gjøre?</h2><p>Faktiske penger finansierer planen. Fremtidig inntekt vises bare som et separat estimat.</p></div>
      <div class="bs-head-actions"><input id="bs-month" type="month"><button id="bs-edit" type="button">Rediger plan</button></div>
    </div>
    <div class="bs-hero">
      <div class="bs-hero-main"><span>TRYGT TILGJENGELIG NÅ</span><strong id="bs-funded">—</strong><p id="bs-funded-copy">—</p></div>
      <div class="bs-hero-grid">
        <div><span>Planinntekt</span><strong id="bs-income">—</strong><small>estimat, ikke finansiert</small></div>
        <div><span>Faste</span><strong id="bs-fixed">—</strong><small>bekreftede recurring</small></div>
        <div><span>True expenses</span><strong id="bs-sinking">—</strong><small>månedlig avsetning</small></div>
        <div class="bs-flex-stat"><span>Til andre ting</span><strong id="bs-flex">—</strong><small id="bs-flex-copy">—</small></div>
      </div>
    </div>
    <div class="bs-buckets" id="bs-buckets"></div>
    <div class="bs-columns">
      <article class="bs-card"><div class="bs-card-head"><div><p class="panel-kicker">NØDVENDIG VARIABELT</p><h3>Det som må fungere i hverdagen</h3></div></div><div id="bs-essential-list" class="bs-lines"></div></article>
      <article class="bs-card"><div class="bs-card-head"><div><p class="panel-kicker">FRI POTT</p><h3>Én grense, flere valg</h3><p>Restaurant, shopping og fritid deler samme pott.</p></div></div><div id="bs-flex-list" class="bs-lines"></div></article>
    </div>
    <article class="bs-card bs-funds"><div class="bs-card-head"><div><p class="panel-kicker">TRUE EXPENSES</p><h3>Gjør store regninger små</h3><p>Reiser, årlige regninger og større kjøp fordeles over tid.</p></div><button id="bs-edit-funds" type="button">Administrer</button></div><div id="bs-fund-list" class="bs-fund-list"></div></article>
    <p class="bs-method">Metode: cash-envelope + flex. Transfers og refusjoner skal ikke spise budsjettet. Rollover brukes selektivt, og fremtidig variabel inntekt finansierer aldri en kategori før pengene faktisk finnes.</p>`;
  balance.insertAdjacentElement('afterend',el);
  document.getElementById('bs-month').value=bsMonth;
  document.getElementById('bs-month')?.addEventListener('change',e=>{bsMonth=e.target.value||bsMonth;bsLoad(true);});
  document.getElementById('bs-edit')?.addEventListener('click',bsOpenPlan);
  document.getElementById('bs-edit-funds')?.addEventListener('click',bsOpenFunds);
  bsEnsurePlanModal();bsEnsureFundsModal();
  return true;
}

function bsEnsurePlanModal(){
  if(document.getElementById('bs-plan-backdrop'))return;
  const el=document.createElement('div');el.id='bs-plan-backdrop';el.className='bs-backdrop hidden';
  el.innerHTML=`<section class="bs-modal" role="dialog" aria-modal="true"><div class="bs-modal-head"><div><p class="panel-kicker">MÅNEDSPLAN</p><h2 id="bs-plan-title">—</h2><p>Planinntekt er et scenario. Bare saldoen du faktisk har regnes som finansiert.</p></div><button id="bs-plan-close" type="button">Lukk</button></div>
    <form id="bs-plan-form">
      <div class="bs-plan-top"><label>Planinntekt denne måneden<input id="bs-plan-income" type="number" min="0" step="100" placeholder="Ikke satt"><small>Bruk et konservativt beløp. Tomt = ingen inntekt antas.</small></label><label>Spare-/reserve-mål<input id="bs-plan-savings" type="number" min="0" step="100"><small>Trekkes før den frie potten beregnes.</small></label></div>
      <label class="bs-check"><input id="bs-flex-rollover" type="checkbox"><span><strong>La fri pott rulle videre</strong><small>Av som standard. True expenses bør rulle; vanlig forbruk trenger ikke.</small></span></label>
      <div class="bs-plan-table-head"><span>Kategori</span><span>Type</span><span>Månedsmål</span><span>Rollover</span></div>
      <div id="bs-plan-categories" class="bs-plan-categories"></div>
      <div class="bs-modal-actions"><button id="bs-use-suggestions" type="button">Bruk historiske forslag</button><span></span><button id="bs-plan-cancel" type="button">Avbryt</button><button type="submit">Lagre plan</button></div><p id="bs-plan-error" class="bs-error"></p>
    </form></section>`;
  document.body.appendChild(el);
  ['bs-plan-close','bs-plan-cancel'].forEach(id=>document.getElementById(id)?.addEventListener('click',bsClosePlan));
  el.addEventListener('click',e=>{if(e.target===el)bsClosePlan();});
  document.getElementById('bs-plan-form')?.addEventListener('submit',bsSavePlan);
  document.getElementById('bs-use-suggestions')?.addEventListener('click',bsUseSuggestions);
}

function bsEnsureFundsModal(){
  if(document.getElementById('bs-funds-backdrop'))return;
  const el=document.createElement('div');el.id='bs-funds-backdrop';el.className='bs-backdrop hidden';
  el.innerHTML=`<section class="bs-modal"><div class="bs-modal-head"><div><p class="panel-kicker">TRUE EXPENSES</p><h2>Fremtidige kostnader</h2><p>Sett målbeløp og dato. MoneyOS regner ut hvor mye du bør sette av per måned.</p></div><button id="bs-funds-close" type="button">Lukk</button></div><div id="bs-funds-editor"></div><button id="bs-add-fund" class="bs-add-fund" type="button">+ Legg til kostnad</button><div class="bs-modal-actions"><span></span><span></span><button id="bs-funds-cancel" type="button">Avbryt</button><button id="bs-funds-save" type="button">Lagre</button></div><p id="bs-funds-error" class="bs-error"></p></section>`;
  document.body.appendChild(el);
  ['bs-funds-close','bs-funds-cancel'].forEach(id=>document.getElementById(id)?.addEventListener('click',bsCloseFunds));
  el.addEventListener('click',e=>{if(e.target===el)bsCloseFunds();});
  document.getElementById('bs-add-fund')?.addEventListener('click',()=>{bsFundDraft.push({id:`fund-${Date.now()}`,name:'',target_amount_nok:0,saved_nok:0,target_date:'',monthly_nok:null,is_active:true});bsRenderFundEditor();});
  document.getElementById('bs-funds-save')?.addEventListener('click',bsSaveFunds);
}

function bsRender(){
  if(!bsData||!bsEnsure())return;
  const d=bsData,o=d.overview??{};
  document.getElementById('bs-month').value=d.month;
  document.getElementById('bs-funded').textContent=bsKr(o.safe_to_spend);
  document.getElementById('bs-funded-copy').textContent=`Dette er MoneyOS sitt finansierte beløp frem til neste lønn etter kjente regninger, mål og buffer.`;
  document.getElementById('bs-income').textContent=d.planning_income_nok==null?'Ikke satt':bsKr(d.planning_income_nok);
  document.getElementById('bs-fixed').textContent=bsKr(d.fixed_monthly_total);
  document.getElementById('bs-sinking').textContent=bsKr(d.sinking_monthly_total);
  const flex=d.flex_budget_nok;
  document.getElementById('bs-flex').textContent=flex==null?'Sett planinntekt':bsKr(flex);
  document.getElementById('bs-flex-copy').textContent=flex==null?'ingen fremtidig inntekt antas':`${bsKr(d.flex_spent_nok)} brukt hittil`;

  const essentialRemaining=d.essential_target_total-d.essential_spent_total;
  const flexRemaining=flex==null?null:flex+bsN(d.flex_carry_nok)-d.flex_spent_nok;
  const buckets=[
    {name:'Faste',copy:'Bekreftede abonnementer og regninger',budget:d.fixed_monthly_total,used:null,tone:'fixed'},
    {name:'Nødvendig',copy:'Mat, transport, helse og andre hverdagsbehov',budget:d.essential_target_total,used:d.essential_spent_total,tone:'essential'},
    {name:'True expenses',copy:'Månedlig avsetning til ujevne kostnader',budget:d.sinking_monthly_total,used:null,tone:'sinking'},
    {name:'Fri pott',copy:'Restaurant, shopping, fritid og spontane valg',budget:flex,used:d.flex_spent_nok,tone:'flex'}
  ];
  document.getElementById('bs-buckets').innerHTML=buckets.map(b=>{
    const rem=b.budget==null?null:b.used==null?b.budget:b.budget-b.used;
    const pct=b.budget&&b.used!=null?bsPct(b.used,b.budget):0;
    return `<div class="bs-bucket ${b.tone}"><div class="bs-bucket-top"><div><span>${bsEsc(b.name)}</span><p>${bsEsc(b.copy)}</p></div><strong>${b.budget==null?'—':bsKr(b.budget)}</strong></div>${b.used!=null&&b.budget!=null?`<div class="bs-track"><span style="width:${pct.toFixed(1)}%"></span></div><div class="bs-bucket-meta"><span>${bsKr(b.used)} brukt</span><b class="${rem<0?'over':''}">${bsKr(rem)} igjen</b></div>`:`<div class="bs-bucket-meta"><span>${b.budget==null?'Planinntekt mangler':'Satt av per måned'}</span></div>`}</div>`;
  }).join('');

  const entries=Object.entries(d.categories??{});
  const essential=entries.filter(([,x])=>x.bucket==='essential');
  document.getElementById('bs-essential-list').innerHTML=essential.map(([name,x])=>{
    const actual=bsN(d.actual_by_category?.[name]),available=bsN(x.target_nok)+bsN(d.carry_by_category?.[name])-actual;
    return `<div class="bs-line"><div><strong>${bsEsc(name)}</strong><span>Forslag fra historikk ${bsKr(x.suggested_nok)}${x.rollover?' · rollover':''}</span></div><div><b class="${available<0?'over':''}">${bsKr(available)} igjen</b><small>${bsKr(actual)} / ${bsKr(x.target_nok)}</small></div></div>`;
  }).join('')||'<p class="bs-empty">Ingen nødvendige variable kategorier.</p>';

  const flexEntries=entries.filter(([,x])=>x.bucket==='flex').sort((a,b)=>bsN(d.actual_by_category?.[b[0]])-bsN(d.actual_by_category?.[a[0]]));
  document.getElementById('bs-flex-list').innerHTML=flexEntries.map(([name,x])=>`<div class="bs-line"><div><strong>${bsEsc(name)}</strong><span>Historisk median ${bsKr(x.suggested_nok)}</span></div><div><b>${bsKr(d.actual_by_category?.[name])}</b><small>brukt</small></div></div>`).join('')||'<p class="bs-empty">Ingen fleksible kategorier.</p>';

  const funds=d.sinking_funds??[];
  document.getElementById('bs-fund-list').innerHTML=funds.length?funds.map(f=>{
    const pct=f.target_amount_nok>0?Math.min(100,bsN(f.saved_nok)/bsN(f.target_amount_nok)*100):0;
    return `<div class="bs-fund"><div class="bs-fund-main"><div><strong>${bsEsc(f.name)}</strong><span>${f.target_date?`mål ${bsEsc(f.target_date)}`:'ingen måldato'} · ${bsKr(f.monthly_contribution_nok)}/mnd</span></div><b>${bsKr(f.saved_nok)} / ${bsKr(f.target_amount_nok)}</b></div><div class="bs-track"><span style="width:${pct.toFixed(1)}%"></span></div></div>`;
  }).join(''):'<p class="bs-empty">Ingen true expenses ennå. Legg inn f.eks. fly hjem, ny laptop eller en årlig regning.</p>';
}

function bsOpenPlan(){
  if(!bsData)return;
  document.getElementById('bs-plan-title').textContent=bsTitle(bsMonthFmt.format(bsMonthDate(bsData.month)));
  document.getElementById('bs-plan-income').value=bsData.planning_income_nok??'';
  document.getElementById('bs-plan-savings').value=bsData.savings_target_nok||'';
  document.getElementById('bs-flex-rollover').checked=bsData.flex_rollover===true;
  const root=document.getElementById('bs-plan-categories');
  root.innerHTML=Object.entries(bsData.categories??{}).map(([name,x])=>`<div class="bs-plan-row" data-bs-cat="${bsEsc(name)}"><div><strong>${bsEsc(name)}</strong><small>Historisk median ${bsKr(x.suggested_nok)}</small></div><select class="bs-cat-bucket"><option value="fixed"${x.bucket==='fixed'?' selected':''}>Faste</option><option value="essential"${x.bucket==='essential'?' selected':''}>Nødvendig</option><option value="flex"${x.bucket==='flex'?' selected':''}>Fri pott</option><option value="excluded"${x.bucket==='excluded'?' selected':''}>Utenfor</option></select><input class="bs-cat-target" type="number" min="0" step="100" value="${Math.round(bsN(x.target_nok))}"><input class="bs-cat-roll" type="checkbox"${x.rollover?' checked':''}></div>`).join('');
  document.getElementById('bs-plan-error').textContent='';
  document.getElementById('bs-plan-backdrop').classList.remove('hidden');document.body.classList.add('sheet-open');
}
function bsClosePlan(){document.getElementById('bs-plan-backdrop')?.classList.add('hidden');document.body.classList.remove('sheet-open');}
function bsUseSuggestions(){document.querySelectorAll('.bs-plan-row').forEach(row=>{const name=row.dataset.bsCat;const x=bsData.categories?.[name];const bucket=row.querySelector('.bs-cat-bucket').value;if(bucket==='essential')row.querySelector('.bs-cat-target').value=Math.round(bsN(x?.suggested_nok));});}
async function bsSavePlan(e){
  e.preventDefault();const error=document.getElementById('bs-plan-error');error.textContent='';
  const category_targets={};document.querySelectorAll('.bs-plan-row').forEach(row=>{category_targets[row.dataset.bsCat]={bucket:row.querySelector('.bs-cat-bucket').value,target_nok:Number(row.querySelector('.bs-cat-target').value||0),rollover:row.querySelector('.bs-cat-roll').checked};});
  const incomeRaw=document.getElementById('bs-plan-income').value;
  const payload={action:'save_plan',month:bsData.month,planning_income_nok:incomeRaw===''?null:Number(incomeRaw),savings_target_nok:Number(document.getElementById('bs-plan-savings').value||0),flex_rollover:document.getElementById('bs-flex-rollover').checked,category_targets};
  try{const r=await fetch('/api/budget-system',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Kunne ikke lagre');bsClosePlan();await bsLoad(true);document.getElementById('refresh')?.click();}
  catch(err){error.textContent=err.message;}
}

function bsOpenFunds(){bsFundDraft=(bsData?.sinking_funds??[]).map(x=>({...x}));bsRenderFundEditor();document.getElementById('bs-funds-error').textContent='';document.getElementById('bs-funds-backdrop').classList.remove('hidden');document.body.classList.add('sheet-open');}
function bsCloseFunds(){document.getElementById('bs-funds-backdrop')?.classList.add('hidden');document.body.classList.remove('sheet-open');}
function bsRenderFundEditor(){
  document.getElementById('bs-funds-editor').innerHTML=bsFundDraft.length?bsFundDraft.map((f,i)=>`<div class="bs-fund-edit" data-fund-index="${i}"><div class="bs-fund-edit-main"><input class="bs-fund-name" placeholder="Navn" value="${bsEsc(f.name||'')}"><button class="bs-fund-remove" type="button">Fjern</button></div><div class="bs-fund-edit-grid"><label>Målbeløp<input class="bs-fund-target" type="number" min="0" step="100" value="${bsN(f.target_amount_nok)||''}"></label><label>Allerede satt av<input class="bs-fund-saved" type="number" min="0" step="100" value="${bsN(f.saved_nok)||''}"></label><label>Måldato<input class="bs-fund-date" type="date" value="${bsEsc(f.target_date||'')}"></label><label>Fast månedlig (valgfritt)<input class="bs-fund-monthly" type="number" min="0" step="100" value="${f.monthly_nok??''}"></label></div></div>`).join(''):'<p class="bs-empty">Legg til den første fremtidige kostnaden.</p>';
  document.querySelectorAll('.bs-fund-remove').forEach(btn=>btn.addEventListener('click',()=>{const row=btn.closest('[data-fund-index]');bsFundDraft.splice(Number(row.dataset.fundIndex),1);bsRenderFundEditor();}));
}
function bsReadFundDraft(){return [...document.querySelectorAll('.bs-fund-edit')].map((row,i)=>({id:bsFundDraft[i]?.id||`fund-${Date.now()}-${i}`,name:row.querySelector('.bs-fund-name').value,target_amount_nok:Number(row.querySelector('.bs-fund-target').value||0),saved_nok:Number(row.querySelector('.bs-fund-saved').value||0),target_date:row.querySelector('.bs-fund-date').value||null,monthly_nok:row.querySelector('.bs-fund-monthly').value===''?null:Number(row.querySelector('.bs-fund-monthly').value),is_active:true}));}
async function bsSaveFunds(){const error=document.getElementById('bs-funds-error');error.textContent='';try{const r=await fetch('/api/budget-system',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save_funds',month:bsData.month,sinking_funds:bsReadFundDraft()})});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Kunne ikke lagre');bsCloseFunds();await bsLoad(true);}catch(err){error.textContent=err.message;}}

async function bsLoad(force=false){
  if(bsLoading||!bsEnsure())return;const app=document.getElementById('app');if(!app||app.classList.contains('hidden'))return;bsLoading=true;
  try{const r=await fetch(`/api/budget-system?month=${encodeURIComponent(bsMonth)}`,{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;bsData=await r.json();bsRender();}
  finally{bsLoading=false;}
}
function bsBoot(){const app=document.getElementById('app');const run=()=>{if(app&&!app.classList.contains('hidden'))setTimeout(bsLoad,320)};run();if(app)new MutationObserver(run).observe(app,{attributes:true,attributeFilter:['class']});document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(()=>bsLoad(true),900));setTimeout(bsLoad,1400);}
bsBoot();
