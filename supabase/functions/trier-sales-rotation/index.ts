import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase=createClient(SUPABASE_URL,SERVICE_KEY);
const DEFAULT_BASE="https://api-sgf-gateway.triersistemas.com.br/sgfpod1";
const RETRYABLE=new Set([429,500,502,503,504,545,554,556]);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

function isoDate(d:Date){return d.toISOString().slice(0,10);}
function extractList(j:any):any[]{if(Array.isArray(j))return j;return j?.content||j?.data||j?.items||j?.vendas||j?.list||[];}
async function fetchPage(url:string,token:string){let lastStatus=0;for(let attempt=1;attempt<=4;attempt++){try{const r=await fetch(url,{headers:{Authorization:token.toLowerCase().startsWith("bearer ")?token:`Bearer ${token}`,Accept:"application/json"}});lastStatus=r.status;const text=await r.text();if(r.ok){try{return{ok:true,status:r.status,json:JSON.parse(text)}}catch{return{ok:false,status:r.status,error:"invalid_json"}}}if(!RETRYABLE.has(r.status)||attempt===4)return{ok:false,status:r.status,error:`http_${r.status}`};}catch(e:any){if(attempt===4)return{ok:false,status:lastStatus,error:String(e?.message||e)};}await sleep(400*attempt*attempt);}return{ok:false,status:lastStatus,error:"retry_exhausted"};}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return Response.json({error:"method_not_allowed"},{status:405});
  const supplied=req.headers.get("x-rotation-sync-key")||"";
  const{data:expectedKey,error:keyError}=await supabase.rpc("get_trier_rotation_sync_key_secret");
  if(keyError||!expectedKey||!supplied||supplied!==expectedKey)return Response.json({error:"unauthorized"},{status:401});

  const body=await req.json().catch(()=>({}));
  const maxPages=Math.min(10,Math.max(1,Number(body?.maxPages||5)));
  const today=isoDate(new Date());

  let{data:state,error:stateError}=await supabase.from("trier_rotation_sync_state").select("*").eq("id",1).single();
  if(stateError)return Response.json({error:"state",detail:stateError.message},{status:500});

  if(state.complete){
    if(String(state.period_end)>=today)return Response.json({ok:true,complete:true,note:"rotation_already_current",period_end:state.period_end});
    const previousEnd=new Date(`${state.period_end}T00:00:00Z`); previousEnd.setUTCDate(previousEnd.getUTCDate()-1);
    const periodStart=isoDate(previousEnd);
    await supabase.from("trier_rotation_sync_state").update({period_start:periodStart,period_end:today,next_offset:0,complete:false,updated_at:new Date().toISOString()}).eq("id",1);
    state={...state,period_start:periodStart,period_end:today,next_offset:0,complete:false};
  }

  const{data:token,error:tokenError}=await supabase.rpc("get_trier_api_token_secret");
  if(tokenError||!token)return Response.json({error:"missing_trier_token"},{status:500});
  const{data:settings}=await supabase.from("trier_settings").select("base_url").eq("id",1).single();
  const base=String(settings?.base_url||DEFAULT_BASE).replace(/\/+$/,"");
  const pageSize=Math.min(500,Math.max(50,Number(state.page_size||200)));
  let offset=Number(state.next_offset||0),pages=0,salesSeen=0,itemsSeen=0,insertedOrSeen=0,complete=false;

  for(let page=0;page<maxPages;page++){
    const qs=new URLSearchParams({primeiroRegistro:String(offset),quantidadeRegistros:String(pageSize),dataEmissaoInicial:String(state.period_start),dataEmissaoFinal:String(state.period_end),xmlNfe:"false"});
    const result=await fetchPage(`${base}/rest/integracao/venda/obter-v1?${qs}`,String(token));
    if(!result.ok){
      await supabase.from("trier_rotation_sync_state").update({last_run_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",1);
      await supabase.from("trier_logs").insert({type:"rotation_sync",status:"warning",message:`Rotation sync paused at offset ${offset}: Trier ${result.status||result.error}`,details:{offset,status:result.status,error:result.error,period_start:state.period_start,period_end:state.period_end}});
      return Response.json({ok:false,retryable:RETRYABLE.has(Number(result.status)),status:result.status,error:result.error,next_offset:offset,period_start:state.period_start,period_end:state.period_end});
    }

    const sales=extractList(result.json);
    if(!sales.length){complete=true;break;}
    const rows:any[]=[];
    sales.forEach((sale:any,saleIndex:number)=>{
      const soldAt=String(sale.dataEmissao||"").slice(0,10);
      if(!soldAt)return;
      const branch=String(sale.codFilial??"");
      const note=String(sale.numeroNota??sale.numeroNotaFiscal??sale.numeroCupomFiscal??`${offset+saleIndex}`);
      const time=String(sale.horaEmissao??"");
      const saleRef=`${branch}|${note}|${soldAt}|${time}`;
      const items=Array.isArray(sale.itens)?sale.itens:[];
      items.forEach((item:any,itemIndex:number)=>{
        const productId=String(item.codigoProduto??"").trim();
        const quantity=Number(item.quantidadeProdutos??item.quantidade??0);
        if(!productId||!Number.isFinite(quantity)||quantity<=0)return;
        rows.push({sale_key:`${saleRef}|${productId}|${itemIndex}`,sale_ref:saleRef,trier_product_id:productId,sold_at:soldAt,quantity,branch_code:branch||null});
      });
    });

    for(let i=0;i<rows.length;i+=500){
      const chunk=rows.slice(i,i+500);
      const{error}=await supabase.from("trier_sales_rotation_items").upsert(chunk,{onConflict:"sale_key",ignoreDuplicates:true});
      if(error)return Response.json({error:"rotation_insert",detail:error.message,offset},{status:500});
    }

    pages++; salesSeen+=sales.length; itemsSeen+=rows.length; insertedOrSeen+=rows.length; offset+=sales.length;
    await supabase.from("trier_rotation_sync_state").update({next_offset:offset,last_run_at:new Date().toISOString(),last_success_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",1);
    if(sales.length<pageSize){complete=true;break;}
    await sleep(350);
  }

  const{data:rotationCount,error:refreshError}=await supabase.rpc("refresh_trier_product_rotation");
  if(refreshError)return Response.json({error:"rotation_refresh",detail:refreshError.message},{status:500});
  if(complete)await supabase.from("trier_rotation_sync_state").update({complete:true,next_offset:offset,last_run_at:new Date().toISOString(),last_success_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",1);

  await supabase.from("trier_logs").insert({type:"rotation_sync",status:"success",message:`Rotation sync: ${pages} pages · ${salesSeen} sales · ${itemsSeen} items`,details:{pages,sales_seen:salesSeen,items_seen:itemsSeen,next_offset:offset,complete,period_start:state.period_start,period_end:state.period_end,rotation_products:rotationCount}});
  return Response.json({ok:true,pages,sales_seen:salesSeen,items_seen:itemsSeen,next_offset:offset,complete,period_start:state.period_start,period_end:state.period_end,rotation_products:rotationCount});
});
