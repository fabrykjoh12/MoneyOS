(()=>{
  const nextFetch=window.fetch.bind(window),locked=new Map();
  function keyFromUrl(input){try{const raw=typeof input==='string'||input instanceof URL?input:input?.url,u=new URL(raw,location.href);return u.pathname==='/api/budget-system'?u.searchParams.get('month'):null}catch{return null}}
  function currentMonth(){return document.getElementById('bs-month')?.value||null}
  function paint(){const month=currentMonth(),btn=document.getElementById('bs-edit');if(!btn||!month)return;const isLocked=locked.get(month)===true;btn.disabled=isLocked;btn.textContent=isLocked?'Måneden er låst':'Rediger plan';btn.title=isLocked?'Åpne måneden igjen i Månedsavslutning før planen endres.':''}
  function remember(month,value){if(month)locked.set(month,!!value);setTimeout(paint,0)}
  window.fetch=async function moneyosBudgetGuard(input,init={}){
    const method=String(init.method||(typeof Request!=='undefined'&&input instanceof Request?input.method:'GET')||'GET').toUpperCase(),month=keyFromUrl(input);
    if(method==='POST'){
      let body=null;try{body=typeof init.body==='string'?JSON.parse(init.body):null}catch{}
      const action=body?.action,target=body?.month||month;
      if(['save_plan','apply_template'].includes(action)&&locked.get(target)===true){return new Response(JSON.stringify({error:'Måneden er låst. Åpne den igjen før planen endres.'}),{status:409,headers:{'Content-Type':'application/json'}})}
      const response=await nextFetch(input,init);
      if(response.ok&&action==='close_month')remember(target,true);
      if(response.ok&&action==='reopen_month')remember(target,false);
      return response;
    }
    const response=await nextFetch(input,init);
    if(method==='GET'&&month&&response.ok){response.clone().json().then(body=>remember(month,!!body?.month_closure)).catch(()=>{})}
    return response;
  };
  document.addEventListener('change',e=>{if(e.target?.id==='bs-month')setTimeout(paint,50)});
  new MutationObserver(paint).observe(document.documentElement,{childList:true,subtree:true});
})();