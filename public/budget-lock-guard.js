(()=>{
  const nextFetch=window.fetch.bind(window),locked=new Map(),cache=new Map(),inFlight=new Map(),TTL=2500;
  function info(input){try{const raw=typeof input==='string'||input instanceof URL?input:input?.url,u=new URL(raw,location.href);if(u.origin!==location.origin||u.pathname!=='/api/budget-system')return null;return{url:u,month:u.searchParams.get('month')}}catch{return null}}
  function currentMonth(){return document.getElementById('bs-month')?.value||null}
  function paint(){
    const month=currentMonth(),btn=document.getElementById('bs-edit');if(!btn||!month)return;
    const isLocked=locked.get(month)===true,nextText=isLocked?'Måneden er låst':'Rediger plan',nextTitle=isLocked?'Åpne måneden igjen i Månedsavslutning før planen endres.':'';
    if(btn.disabled!==isLocked)btn.disabled=isLocked;
    if(btn.textContent!==nextText)btn.textContent=nextText;
    if(btn.title!==nextTitle)btn.title=nextTitle;
  }
  function remember(month,value){if(month)locked.set(month,!!value);setTimeout(paint,0)}
  function invalidate(){cache.clear();inFlight.clear()}
  window.moneyosInvalidateBudgetCache=invalidate;
  async function rememberResponse(month,response){if(!month||!response?.ok)return;response.clone().json().then(body=>remember(month,!!body?.month_closure)).catch(()=>{})}
  window.fetch=async function moneyosBudgetGuard(input,init={}){
    const method=String(init.method||(typeof Request!=='undefined'&&input instanceof Request?input.method:'GET')||'GET').toUpperCase(),meta=info(input),month=meta?.month;
    if(method==='POST'){
      let body=null;try{body=typeof init.body==='string'?JSON.parse(init.body):null}catch{}
      const action=body?.action,target=body?.month||month;
      if(['save_plan','apply_template'].includes(action)&&locked.get(target)===true){return new Response(JSON.stringify({error:'Måneden er låst. Åpne den igjen før planen endres.'}),{status:409,headers:{'Content-Type':'application/json'}})}
      const response=await nextFetch(input,init);
      if(response.ok){invalidate();if(action==='close_month')remember(target,true);if(action==='reopen_month')remember(target,false)}
      return response;
    }
    if(method!=='GET'||!meta||init.signal)return nextFetch(input,init);
    const key=meta.url.href,now=Date.now(),hit=cache.get(key);
    if(hit&&now<hit.expires){const response=hit.response.clone();rememberResponse(month,response);return response}
    if(inFlight.has(key)){const response=(await inFlight.get(key)).clone();rememberResponse(month,response);return response}
    const promise=nextFetch(input,init).then(response=>{if(response.ok)cache.set(key,{response:response.clone(),expires:Date.now()+TTL});return response}).finally(()=>inFlight.delete(key));
    inFlight.set(key,promise);const response=await promise;rememberResponse(month,response);return response.clone();
  };
  document.addEventListener('change',e=>{if(e.target?.id==='bs-month')setTimeout(paint,50)});
  document.addEventListener('moneyos:budget-updated',()=>{invalidate();setTimeout(paint,0)});
  document.addEventListener('moneyos:transaction-updated',invalidate);
  document.addEventListener('moneyos:features-loaded',e=>{if(e.detail?.view==='money')setTimeout(paint,50)});
  document.addEventListener('click',e=>{if(e.target?.closest?.('#refresh'))invalidate()},true);
})();