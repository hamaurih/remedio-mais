import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase=createClient(SUPABASE_URL,SERVICE_KEY);
const DEFAULT_BASE="https://api-sgf-gateway.triersistemas.com.br/sgfpod1";
const RETRYABLE=new Set([429,500,502,503,504,545,554,556]);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function extractList(j:any):any[]{if(Array.isArray(j))return j;return j?.content||j?.data||j?.items||j?.estoques||j?.list||[];}
async function fetchPage(url:string,token:string){let lastStatus=0;for(let attempt=1;attempt<=4;attempt++){try{const r=await fetch(url,{headers:{Authorization:token.toLowerCase().startsWith("bearer ")?token:`Bearer ${token}`,Accept:"application/json"}});lastStatus=r.status;const text=await r.text();if(r.ok){try{return{ok:true,status:r.status,json:JSON.parse(text)}}catch{return{ok:false,status:r.status,error:"invalid_json"}}}if(!RETRYABLE.has(r.status)||attempt===4)return{ok:false,status:r.status,error:`http_${r.status}`};}catch(e:any){if(attempt===4)return{ok:false,status:lastStatus,error:String(e?.message||e)};}await sleep(350*attempt*attempt);}return{ok:false,status:lastStatus,error:"retry_exhausted"};}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return Response.json({error:"method_not_allowed"},{status:405});
  const supplied=req.headers.get("x-stock-delta-key")||"";
  const{data:expectedKey,error:keyError}=await supabase.rpc("get_trier_stock_delta_key_secret");
  if(keyError||!expectedKey||!supplied||supplied!==expectedKey)return Response.json({error:"unauthorized"},{status:401});
  const body=await req.json().catch(()=>({}));
  const maxPages=Math.min(10,Math.max(1,Number(body?.maxPages||5)));
  let{data:state,error:stateError}=await supabase.from("trier_stock_sync_state").select("*").eq("id",1).single();
  if(stateError)return Response.json({error:"state",detail:stateError.message},{status:500});

  const now=new Date();
  if(state.complete){
    const oldEnd=new Date(state.window_end);
    const newEnd=now;
    if(newEnd.getTime()-oldEnd.getTime()<2*60*1000)return Response.json({ok:true,complete:true,note:"stock_window_current",window_end:state.window_end});
    const overlapStart=new Date(oldEnd.getTime()-15*60*1000);
    await supabase.from("trier_stock_sync_state").update({window_start:overlapStart.toISOString(),window_end:newEnd.toISOString(),next_offset:0,complete:false,updated_at:new Date().toISOString()}).eq("id",1);
    state={...state,window_start:overlapStart.toISOString(),window_end:newEnd.toISOString(),next_offset:0,complete:false};
  }

  const{data:token,error:tokenError}=await supabase.rpc("get_trier_api_token_secret");
  if(tokenError||!token)return Response.json({error:"missing_trier_token"},{status:500});
  const{data:settings}=await supabase.from("trier_settings").select("base_url").eq("id",1).single();
  const base=String(settings?.base_url||DEFAULT_BASE).replace(/\/+$/,"");
  const pageSize=Math.min(500,Math.max(50,Number(state.page_size||200)));
  let offset=Number(state.next_offset||0),pages=0,rowsSeen=0,updated=0,positive=0,zero=0,complete=false;

  for(let page=0;page<maxPages;page++){
    const qs=new URLSearchParams({
      dataInicial:new Date(state.window_start).toISOString(),
      dataFinal:new Date(state.window_end).toISOString(),
      primeiroRegistro:String(offset),
      quantidadeRegistros:String(pageSize),
    });
    const r=await fetchPage(`${base}/rest/integracao/estoque/obter-alterados-v1?${qs}`,String(token));
    if(!r.ok){
      await supabase.from("trier_stock_sync_state").update({last_run_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",1);
      await supabase.from("trier_logs").insert({type:"stock_delta",status:"warning",message:`Stock delta paused at ${offset}: Trier ${r.status||r.error}`,details:{offset,status:r.status,error:r.error,window_start:state.window_start,window_end:state.window_end}});
      return Response.json({ok:false,retryable:RETRYABLE.has(Number(r.status)),status:r.status,error:r.error,next_offset:offset});
    }
    const rows=extractList(r.json);
    if(!rows.length){complete=true;break;}
    const{data:applied,error:applyError}=await supabase.rpc("apply_trier_stock_delta",{_payload:rows});
    if(applyError)return Response.json({error:"apply_stock",detail:applyError.message,offset},{status:500});
    pages++; rowsSeen+=rows.length; updated+=Number(applied?.updated_count||0); positive+=Number(applied?.positive_count||0); zero+=Number(applied?.zero_count||0); offset+=rows.length;
    await supabase.from("trier_stock_sync_state").update({next_offset:offset,last_run_at:new Date().toISOString(),last_success_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",1);
    if(rows.length<pageSize){complete=true;break;}
    await sleep(250);
  }

  if(complete)await supabase.from("trier_stock_sync_state").update({complete:true,next_offset:offset,last_run_at:new Date().toISOString(),last_success_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",1);
  await supabase.from("trier_logs").insert({type:"stock_delta",status:"success",message:`Stock delta: ${pages} pages · ${rowsSeen} changes · ${updated} products updated`,details:{pages,rows_seen:rowsSeen,updated,positive,zero,next_offset:offset,complete,window_start:state.window_start,window_end:state.window_end}});
  return Response.json({ok:true,pages,rows_seen:rowsSeen,updated,positive,zero,next_offset:offset,complete,window_start:state.window_start,window_end:state.window_end});
});
