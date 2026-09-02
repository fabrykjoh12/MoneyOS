(()=>{
  const nativeFetch=window.fetch.bind(window);
  let cached=null;
  let expiresAt=0;
  let inFlight=null;
  const TTL=4000;

  function isDashboardRequest(input,init={}){
    try{
      const raw=typeof input==='string'||input instanceof URL?input:input?.url;
      const url=new URL(raw,window.location.href);
      const method=String(init.method||(typeof Request!=='undefined'&&input instanceof Request?input.method:'GET')||'GET').toUpperCase();
      return method==='GET'&&url.origin===window.location.origin&&url.pathname==='/api/dashboard'&&!init.signal;
    }catch{return false}
  }
  function invalidate(){cached=null;expiresAt=0;inFlight=null}
  window.moneyosInvalidateDashboardCache=invalidate;
  window.fetch=async function moneyosFetch(input,init={}){
    if(!isDashboardRequest(input,init))return nativeFetch(input,init);
    const now=Date.now();
    if(cached&&now<expiresAt)return cached.clone();
    if(inFlight){const response=await inFlight;return response.clone()}
    inFlight=nativeFetch(input,init).then(response=>{
      if(response.ok){cached=response.clone();expiresAt=Date.now()+TTL}
      return response;
    }).finally(()=>{inFlight=null});
    const response=await inFlight;
    return response.clone();
  };
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#refresh,#logout'))invalidate();
  },true);
  document.addEventListener('moneyos:budget-updated',invalidate);
  document.addEventListener('moneyos:transaction-updated',invalidate);
})();
