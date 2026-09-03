(()=>{
  const app=document.getElementById('app');
  if(!app)return;
  let started=false;
  const styles=[
    'purchase-check.css','monthly-margin.css','smart-insights.css','subscriptions.css','money-search.css','transaction-editor.css','scenario-planner.css','japan-actual.css','trip-budgets.css','japan-wallet.css','japan-bank-transfer.css','japan-runway-v2.css','japan-pace.css','japan-flex.css','data-quality.css','japan-costs.css','budget-system.css','active-month.css','active-month-home.css','pending-budget.css','budget-guidance.css','budget-funding.css','budget-health.css','budget-ready.css','budget-template.css','month-handoff.css','month-close.css','budget-history.css','true-expense-funding.css','budget-runway.css','home-runway.css','budget-envelopes.css'
  ];
  const scripts=[
    'dashboard-cache.js','budget-lock-guard.js','months.js','purchase-check.js','monthly-margin.js','smart-insights.js','subscriptions.js','money-search.js','transaction-editor.js','scenario-planner.js','japan-actual.js','trip-budgets.js','japan-wallet.js','japan-bank-transfer.js','japan-runway-v2.js','japan-runway-freshness.js','japan-home-sync.js','japan-pace.js','japan-flex.js','money-search-japan-status.js','data-quality.js','japan-costs.js','budget-system.js','active-month.js','active-month-home.js','active-month-drilldown.js','pending-budget.js','budget-guidance.js','budget-funding.js','budget-health.js','budget-ready.js','budget-template.js','month-handoff.js','month-close.js','budget-history.js','true-expense-funding.js','budget-runway.js','home-runway.js','budget-envelopes.js'
  ];
  function addStyle(href){if(document.querySelector(`link[data-moneyos-feature="${href}"]`))return;const link=document.createElement('link');link.rel='stylesheet';link.href=`/${href}`;link.dataset.moneyosFeature=href;document.head.appendChild(link)}
  function addScript(src){return new Promise(resolve=>{if(document.querySelector(`script[data-moneyos-feature="${src}"]`)){resolve();return}const s=document.createElement('script');s.src=`/${src}`;s.dataset.moneyosFeature=src;if(src.endsWith('.js')&&!['dashboard-cache.js','budget-lock-guard.js'].includes(src))s.type='module';s.onload=resolve;s.onerror=()=>{console.error(`MoneyOS feature failed: ${src}`);resolve()};document.body.appendChild(s)})}
  async function start(){if(started||app.classList.contains('hidden'))return;started=true;styles.forEach(addStyle);for(const src of scripts){await addScript(src);await new Promise(r=>(window.requestIdleCallback?requestIdleCallback(()=>r(),{timeout:150}):setTimeout(r,25)))}}
  start();
  new MutationObserver(()=>start()).observe(app,{attributes:true,attributeFilter:['class']});
})();