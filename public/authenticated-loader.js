(()=>{
  const loaded=new Set(),loading=new Map();
  const groups={
    today:{
      styles:['simple-home.css'],
      scripts:['dashboard-cache.js','simple-home.js']
    },
    money:{
      styles:['months.css','subscriptions.css','transaction-editor.css','budget-system.css','active-month.css','pending-budget.css','budget-guidance.css','budget-funding.css','budget-health.css','budget-ready.css','budget-template.css','month-handoff.css','month-close.css','budget-history.css','true-expense-funding.css','budget-runway.css','budget-envelopes.css'],
      scripts:['dashboard-cache.js','budget-lock-guard.js','months.js','subscriptions.js','transaction-editor.js','budget-system.js','active-month.js','active-month-drilldown.js','pending-budget.js','budget-guidance.js','budget-funding.js','budget-health.js','budget-ready.js','budget-template.js','month-handoff.js','month-close.js','budget-history.js','true-expense-funding.js','budget-runway.js','budget-envelopes.js']
    },
    plans:{
      styles:['japan-budget.css','japan-actual.css','trip-budgets.css','japan-wallet.css','japan-bank-transfer.css','japan-runway-v2.css','japan-pace.css','japan-flex.css','japan-costs.css','purchase-check.css','scenario-planner.css','monthly-margin.css'],
      scripts:['dashboard-cache.js','japan-budget.js','japan-actual.js','trip-budgets.js','japan-wallet.js','japan-bank-transfer.js','japan-runway-v2.js','japan-runway-freshness.js','japan-home-sync.js','japan-pace.js','japan-flex.js','japan-costs.js','purchase-check.js','scenario-planner.js','monthly-margin.js','money-search-japan-status.js']
    }
  };
  function addStyle(href){if(document.querySelector(`link[data-moneyos-feature="${href}"]`)||[...document.styleSheets].some(s=>String(s.href||'').endsWith('/'+href)))return;const link=document.createElement('link');link.rel='stylesheet';link.href=`/${href}`;link.dataset.moneyosFeature=href;document.head.appendChild(link)}
  function addScript(src){return new Promise(resolve=>{if(document.querySelector(`script[data-moneyos-feature="${src}"]`)||document.querySelector(`script[src="/${src}"]`)){resolve();return}const s=document.createElement('script');s.src=`/${src}`;s.dataset.moneyosFeature=src;if(!['dashboard-cache.js','budget-lock-guard.js'].includes(src))s.type='module';s.onload=resolve;s.onerror=()=>{console.error(`MoneyOS feature failed: ${src}`);resolve()};document.body.appendChild(s)})}
  const pause=(ms=120)=>new Promise(r=>setTimeout(r,ms));
  async function loadGroup(name){if(!groups[name]||loaded.has(name))return;if(loading.has(name))return loading.get(name);const task=(async()=>{groups[name].styles.forEach(addStyle);for(const src of groups[name].scripts){await addScript(src);await pause()}loaded.add(name);document.dispatchEvent(new CustomEvent('moneyos:features-loaded',{detail:{view:name}}))})().finally(()=>loading.delete(name));loading.set(name,task);return task}
  window.MoneyOSLoadFeatures=loadGroup;
  document.addEventListener('click',event=>{const target=event.target?.closest?.('[data-view],[data-go]');if(!target)return;const view=target.dataset.view||target.dataset.go;if(groups[view])setTimeout(()=>loadGroup(view),80)});
  const app=document.getElementById('app');
  const loadHome=()=>{if(app&&!app.classList.contains('hidden'))loadGroup('today')};
  loadHome();
  if(app)new MutationObserver(loadHome).observe(app,{attributes:true,attributeFilter:['class']});
})();