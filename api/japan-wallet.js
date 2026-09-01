import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { isAuthenticated } from '../lib/auth.js';

const walletNames = ['cash', 'icoca'];
const categoryKeys = ['food','mobile','nhi','transport','household','social','trips','study','bank'];
const tripBuckets = ['transport','stay','food','activities','other'];
function n(value){ const x=Number(value); return Number.isFinite(x)?Math.round(x):0; }
function text(value,max=120){ return String(value??'').trim().slice(0,max); }
function dateValue(value){ const s=text(value,10); return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:new Date().toISOString().slice(0,10); }

async function configRow(sql){
  const rows=await sql`
    SELECT id, COALESCE(extracted_summary,'{}'::jsonb) AS summary
    FROM documents
    WHERE document_type='moneyos_config' AND source_name='MoneyOS private config'
    ORDER BY document_date DESC NULLS LAST, created_at DESC
    LIMIT 1
  `;
  return rows[0]??null;
}
function normalizeWallet(raw={}){
  return {
    cash_jpy:Math.max(0,n(raw.cash_jpy)),
    icoca_jpy:Math.max(0,n(raw.icoca_jpy)),
    ledger:Array.isArray(raw.ledger)?raw.ledger.slice(0,500):[]
  };
}
function publicTrips(summary){
  const trips=Array.isArray(summary?.japan?.trips)?summary.japan.trips:[];
  return trips.map(t=>({id:t.id,name:t.name,start_date:t.start_date,end_date:t.end_date}));
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Pragma','no-cache');
  try{
    if(!isAuthenticated(req)) return res.status(401).json({error:'Unauthorized'});
    if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
    const sql=neon(process.env.DATABASE_URL); const config=await configRow(sql);
    if(!config) return res.status(500).json({error:'MoneyOS-konfigurasjonen mangler'});
    const wallet=normalizeWallet(config.summary?.japan?.wallets);
    const trips=publicTrips(config.summary);
    if(req.method==='GET') return res.status(200).json({...wallet,trips});
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});

    const action=text(req.body?.action,30), amount=Math.max(0,n(req.body?.amount_jpy));
    const entryBase={id:randomUUID(),date:dateValue(req.body?.date),created_at:new Date().toISOString()};
    if(action==='set_balance'){
      const which=text(req.body?.wallet,10); if(!walletNames.includes(which)) return res.status(400).json({error:'Ugyldig lommebok'});
      wallet[`${which}_jpy`]=amount;
      wallet.ledger.unshift({...entryBase,type:'reconcile',wallet:which,amount_jpy:amount,note:'Saldo justert'});
    }else if(action==='transfer'){
      const from=text(req.body?.from,10),to=text(req.body?.to,10); if(!walletNames.includes(from)||!walletNames.includes(to)||from===to||amount<=0) return res.status(400).json({error:'Ugyldig overføring'});
      if(wallet[`${from}_jpy`]<amount) return res.status(409).json({error:'Ikke nok saldo i lommeboken'});
      wallet[`${from}_jpy`]-=amount; wallet[`${to}_jpy`]+=amount;
      wallet.ledger.unshift({...entryBase,type:'transfer',from,to,amount_jpy:amount,note:text(req.body?.note,120)});
    }else if(action==='topup'){
      const which=text(req.body?.wallet,10); if(!walletNames.includes(which)||amount<=0) return res.status(400).json({error:'Ugyldig påfyll'});
      wallet[`${which}_jpy`]+=amount;
      wallet.ledger.unshift({...entryBase,type:'topup',wallet:which,amount_jpy:amount,note:text(req.body?.note,120)});
    }else if(action==='expense'){
      const which=text(req.body?.wallet,10),category=text(req.body?.category_key,20); if(!walletNames.includes(which)||!categoryKeys.includes(category)||amount<=0) return res.status(400).json({error:'Ugyldig kjøp'});
      if(wallet[`${which}_jpy`]<amount) return res.status(409).json({error:'Ikke nok saldo i lommeboken'});
      const tripId=text(req.body?.trip_id,80)||null;
      const tripBucket=tripId?text(req.body?.trip_bucket,20):null;
      if(tripId&&!trips.some(t=>String(t.id)===tripId)) return res.status(400).json({error:'Turen finnes ikke'});
      if(tripId&&!tripBuckets.includes(tripBucket)) return res.status(400).json({error:'Velg hvilken turpost kjøpet tilhører'});
      wallet[`${which}_jpy`]-=amount;
      wallet.ledger.unshift({...entryBase,type:'expense',wallet:which,amount_jpy:amount,category_key:category,note:text(req.body?.note,120)||'Kontantkjøp',trip_id:tripId,trip_bucket:tripBucket});
    }else return res.status(400).json({error:'Ukjent handling'});

    wallet.ledger=wallet.ledger.slice(0,500);
    await sql`
      UPDATE documents
      SET extracted_summary=jsonb_set(COALESCE(extracted_summary,'{}'::jsonb),'{japan,wallets}',${JSON.stringify(wallet)}::jsonb,true)
      WHERE id=${config.id}
    `;
    return res.status(200).json({ok:true,...wallet,trips});
  }catch(error){console.error(error);return res.status(500).json({error:'Kunne ikke oppdatere Japan-lommeboken'});}
}
