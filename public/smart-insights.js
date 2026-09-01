const siMoney = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
const siPct = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 });
let siLoading = false;

function siN(v){ return Number(v ?? 0); }
function siKr(v){ return `${siMoney.format(siN(v))} kr`; }
function siEsc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

const merchantRules = [
  [/\brema\b/i,'REMA 1000'],
  [/\bmeny\b/i,'MENY'],
  [/\beasypark\b/i,'EasyPark'],
  [/apple\.com|apple com|apple\.com\/bill/i,'Apple'],
  [/anthropic|claude/i,'Claude'],
  [/openai|chatgpt/i,'ChatGPT'],
  [/adobe/i,'Adobe'],
  [/higgsfield/i,'Higgsfield'],
  [/supabase/i,'Supabase'],
  [/google.*one/i,'Google One'],
  [/youtube.*premium|youtubeprem/i,'YouTube Premium'],
  [/paddle.*geogues|geogues/i,'Geogues'],
  [/circle\s*k|1-2-3|st1/i,'Drivstoff'],
  [/clas.?ohlson/i,'Clas Ohlson'],
  [/elkj[oø]p/i,'Elkjøp'],
  [/gina\s*tricot/i,'Gina Tricot'],
  [/normal\b/i,'Normal'],
  [/phoenix\s*sushi/i,'Phoenix Sushi'],
  [/la\s*baguett/i,'La Baguette'],
  [/telia/i,'Telia'],
  [/telenor/i,'Telenor']
];

function normalizeMerchant(raw){
  const value=String(raw??'').trim();
  if(!value) return value;
  for(const [pattern,name] of merchantRules){ if(pattern.test(value)) return name; }
  return value
    .replace(/^visa\s+\d+\s+/i,'')
    .replace(/^varekjøp(?: i butikk)?\s+/i,'')
    .replace(/^ubetjent varekjøp\s+/i,'')
    .replace(/\s+dato\s+\d{1,2}\.\d{1,2}.*$/i,'')
    .replace(/\s{2,}/g,' ')
    .trim();
}

function normalizeVisibleMerchants(){
  document.querySelectorAll('.transaction-row .row-title, .category-transaction-row strong:first-child').forEach(el=>{
    const original=el.textContent?.trim();
    const normalized=normalizeMerchant(original);
    if(original && normalized && original!==normalized){
      el.dataset.originalMerchant=original;
      el.textContent=normalized;
      el.title=original;
    }
  });
}

function ensureInsights(){
  if(document.getElementById('smart-insights')) return true;
  const attention=document.querySelector('.attention-section');
  if(!attention) return false;
  const section=document.createElement('section');
  section.id='smart-insights';
  section.className='smart-insights';
  section.innerHTML=`
    <div class="si-head">
      <div><p class="panel-kicker">MONEYOS SER</p><h2>Hva skiller seg ut?</h2></div>
      <span>Automatisk · kun fra data</span>
    </div>
    <div id="si-list" class="si-list"><div class="si-empty">Analyserer økonomien…</div></div>`;
  attention.insertAdjacentElement('afterend',section);
  return true;
}

function monthRows(data){ return Array.isArray(data.monthly_breakdown)?data.monthly_breakdown:[]; }

function makeInsights(data){
  const insights=[];
  const months=monthRows(data);
  const current=months[0];
  const previous=months[1];

  if(current && previous && siN(previous.expenses)>0){
    const diff=siN(current.expenses)-siN(previous.expenses);
    const pct=Math.round(Math.abs(diff)/siN(previous.expenses)*100);
    if(Math.abs(diff)>=1000){
      insights.push({
        tone:diff>0?'warn':'good',
        eyebrow:'MÅNED MOT MÅNED',
        title:`Du har brukt ${siKr(Math.abs(diff))} ${diff>0?'mer':'mindre'} enn måneden før.`,
        copy:`Det tilsvarer ${siPct.format(pct)} % ${diff>0?'høyere':'lavere'} bokført forbruk. Trykk Penger for å se hvilke kategorier som forklarer forskjellen.`
      });
    }
  }

  if(current?.categories){
    const cats=Object.entries(current.categories).map(([name,amount])=>({name,amount:siN(amount)})).sort((a,b)=>b.amount-a.amount);
    const top=cats[0];
    const total=siN(current.expenses);
    if(top && total>0){
      const share=Math.round(top.amount/total*100);
      insights.push({
        tone:share>=40?'neutral':'good',
        eyebrow:'STØRSTE DRIVER',
        title:`${top.name} står for ${share} % av månedens utgifter.`,
        copy:`${siKr(top.amount)} er bokført i denne kategorien. Store engangskjøp kan derfor gjøre måneden dyr uten at det betyr at vanlig hverdagsforbruk har økt tilsvarende.`
      });
    }
  }

  const fixed=siN(data.cost_summary?.fixed_monthly_total);
  if(fixed>0){
    insights.push({
      tone:'neutral',
      eyebrow:'FASTE KOSTNADER',
      title:`Bekreftede faste kostnader er ${siKr(fixed)} per måned.`,
      copy:`Det tilsvarer omtrent ${siKr(fixed*12)} per år hvis de samme kostnadene fortsetter.`
    });
  }

  const reviews=data.review_candidates??[];
  if(reviews.length){
    insights.push({
      tone:'warn',
      eyebrow:'TRENGER AVKLARING',
      title:`${reviews.length} mulig faste kostnader er ikke bekreftet.`,
      copy:'De påvirker ikke fremtidsberegningen før de er bekreftet, slik at MoneyOS ikke later som usikre trekk er sikre.'
    });
  }

  const j=data.japan_plan??{};
  const flexible=(j.budget?.living_categories??[]).filter(x=>x.kind==='flexible').reduce((s,x)=>s+siN(x.amount_jpy),0);
  if(flexible>0){
    const yenFmt=new Intl.NumberFormat('nb-NO',{maximumFractionDigits:0});
    insights.push({
      tone:'good',
      eyebrow:'JAPAN · FRI POTT',
      title:`Du har satt av ¥${yenFmt.format(flexible)} per måned til valgfrie ting.`,
      copy:`Det er omtrent ¥${yenFmt.format(flexible/30*7)} per uke til sosialt, spise ute, shopping og småturer.`
    });
  }

  return insights.slice(0,4);
}

function renderInsights(data){
  if(!ensureInsights()) return;
  const root=document.getElementById('si-list');
  const items=makeInsights(data);
  root.innerHTML=items.length?items.map(x=>`<article class="si-card ${x.tone}"><div class="si-marker"></div><div><span>${siEsc(x.eyebrow)}</span><h3>${siEsc(x.title)}</h3><p>${siEsc(x.copy)}</p></div></article>`).join(''):'<div class="si-empty">Ingen tydelige avvik å vise akkurat nå.</div>';
}

async function loadInsights(){
  if(siLoading) return;
  const app=document.getElementById('app');
  if(!app || app.classList.contains('hidden')) return;
  siLoading=true;
  try{
    const r=await fetch('/api/dashboard',{credentials:'same-origin',cache:'no-store'});
    if(!r.ok) return;
    const data=await r.json();
    renderInsights(data);
    normalizeVisibleMerchants();
  }finally{ siLoading=false; }
}

function bootSmartInsights(){
  const app=document.getElementById('app');
  if(!app) return;
  const run=()=>{ if(!app.classList.contains('hidden')) loadInsights(); };
  run();
  new MutationObserver(()=>normalizeVisibleMerchants()).observe(document.body,{subtree:true,childList:true});
  new MutationObserver(run).observe(app,{attributes:true,attributeFilter:['class']});
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(loadInsights,250));
}

bootSmartInsights();
