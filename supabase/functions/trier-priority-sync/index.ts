import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const DEFAULT_BASE = "https://api-sgf-gateway.triersistemas.com.br/sgfpod1";
const RETRYABLE = new Set([429, 500, 502, 503, 504, 545, 554, 556]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function firstNonEmpty(...values: any[]) {
  for (const value of values) if (value !== undefined && value !== null && value !== "") return value;
  return null;
}
function codeOf(t: any) { const v = firstNonEmpty(t.codigo,t.id,t.codProduto,t.codigoProduto,t.codigo_produto,t.produtoId,t.idProduto); return v == null ? "" : String(v); }
function barcodeOf(t: any) { const v = firstNonEmpty(t.codigoBarras,t.ean,t.barcode,t.codigo_barra,t.codigo_barras); return v == null ? "" : String(v); }
function stockOf(t: any): number | null { const v = firstNonEmpty(t.quantidadeEstoque,t.estoque,t.saldoEstoque,t.quantidade_estoque,t.qtdEstoque,t.saldo); if (v == null) return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function priceOf(t: any): number | null { const v=firstNonEmpty(t.valorVendaEcommerce,t.valorVenda,t.precoVenda,t.preco,t.valor_venda,t.preco_venda,t.valor); if(v==null)return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function boolOf(v: any): boolean | null { if(v===true||v===false)return v; if(v===1||v==="1"||String(v).toLowerCase()==="true")return true; if(v===0||v==="0"||String(v).toLowerCase()==="false")return false; return null; }
function extractList(json:any):any[]{ if(Array.isArray(json))return json; return json?.content||json?.data||json?.items||json?.produtos||json?.list||[]; }

async function fetchJson(url:string, token:string) {
  let lastStatus=0;
  for(let attempt=1; attempt<=4; attempt++) {
    try {
      const res=await fetch(url,{headers:{Authorization: token.toLowerCase().startsWith("bearer ")?token:`Bearer ${token}`,Accept:"application/json"}});
      lastStatus=res.status;
      const text=await res.text();
      if(res.ok){ try{return {ok:true,status:res.status,json:JSON.parse(text)}}catch{return {ok:false,status:res.status,error:"invalid_json"}} }
      if(!RETRYABLE.has(res.status)||attempt===4)return {ok:false,status:res.status,error:`http_${res.status}`};
    } catch(e:any) {
      if(attempt===4)return {ok:false,status:lastStatus,error:String(e?.message||e)};
    }
    await sleep(300*attempt*attempt);
  }
  return {ok:false,status:lastStatus,error:"retry_exhausted"};
}

async function findProduct(base:string, branch:string, token:string, p:any) {
  const attempts:{key:string,value:string}[]=[];
  const barcode=String(p.barcode||p.trier_barcode||"").trim();
  const trierId=String(p.trier_product_id||"").trim();
  if(barcode) attempts.push({key:"codigoBarras",value:barcode});
  if(trierId){ attempts.push({key:"codigo",value:trierId}); attempts.push({key:"codigoProduto",value:trierId}); }
  for(const a of attempts){
    const qs=new URLSearchParams({codFilial:branch,primeiroRegistro:"0",quantidadeRegistros:"5",processaCustoMedio:"false",[a.key]:a.value});
    const r=await fetchJson(`${base}/rest/integracao/produto/obter-todos-v1?${qs}`,token);
    if(!r.ok){ if(r.status===545||r.status===554)return {failed:true,error:`sgf_${r.status}`}; continue; }
    const list=extractList(r.json);
    const item=list.find((t:any)=> a.key==="codigoBarras" ? barcodeOf(t)===barcode : codeOf(t)===trierId) || (list.length===1?list[0]:null);
    if(item)return {item,lookup:a.key};
  }
  return {item:null};
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return Response.json({error:"method_not_allowed"},{status:405});

  const supplied=req.headers.get("x-priority-sync-key")||"";
  const {data:expectedKey,error:keyError}=await supabase.rpc("get_trier_priority_sync_key_secret");
  if(keyError||!expectedKey||!supplied||supplied!==expectedKey)return Response.json({error:"unauthorized"},{status:401});

  const input=await req.json().catch(()=>({}));
  const limit=Math.min(250,Math.max(1,Number(input?.limit||120)));
  const now=new Date().toISOString();

  const {data:settings,error:settingsError}=await supabase.from("trier_settings").select("base_url,branch_code,auto_sync_paused").eq("id",1).single();
  if(settingsError)return Response.json({error:"settings",detail:settingsError.message},{status:500});

  const {data:token,error:tokenError}=await supabase.rpc("get_trier_api_token_secret");
  if(tokenError||!token)return Response.json({error:"missing_trier_token"},{status:500});

  const {data:due,error:dueError}=await supabase.from("product_sync_priority")
    .select("product_id,priority_tier,priority_reason,next_sync_at,last_trier_sync_at")
    .lte("priority_tier",4)
    .lte("next_sync_at",now)
    .eq("manual_disabled",false)
    .is("archived_at",null)
    .order("priority_tier",{ascending:true})
    .order("last_trier_sync_at",{ascending:true,nullsFirst:true})
    .limit(limit);
  if(dueError)return Response.json({error:"priority_query",detail:dueError.message},{status:500});
  if(!due?.length)return Response.json({ok:true,checked:0,updated:0,failed:0,not_found:0,note:"no_due_products"});

  const ids=due.map((x:any)=>x.product_id);
  const priorityById=new Map(due.map((x:any)=>[x.product_id,x]));
  const {data:products,error:productsError}=await supabase.from("products")
    .select("id,name,barcode,trier_barcode,trier_product_id,stock,stock_quantity,trier_stock_quantity,price,promo_price,lock_base_price,lock_manual_stock,manual_disabled,trier_active,force_active,archived_at")
    .in("id",ids);
  if(productsError)return Response.json({error:"products_query",detail:productsError.message},{status:500});

  const base=String(settings.base_url||DEFAULT_BASE).replace(/\/+$/,"");
  const branch=String(settings.branch_code||"1");
  let checked=0,updated=0,failed=0,notFound=0,deactivated=0;
  const tierStats:Record<string,number>={};
  let cursor=0;

  async function worker(){
    while(cursor<(products||[]).length){
      const p=(products||[])[cursor++];
      const meta:any=priorityById.get(p.id);
      const tier=String(meta?.priority_tier||"?"); tierStats[tier]=(tierStats[tier]||0)+1;
      if(p.lock_manual_stock===true){
        // Still allow price refresh but never alter locked stock.
      }
      checked++;
      const found=await findProduct(base,branch,String(token),p);
      if(found.failed){failed++;continue;}
      const t=found.item;
      if(!t){notFound++; await supabase.from("products").update({last_trier_sync_at:new Date().toISOString()}).eq("id",p.id); continue;}

      const patch:any={last_trier_sync_at:new Date().toISOString(),source:"trier"};
      const realStock=stockOf(t);
      const freshActive=boolOf(t.ativo);
      if(p.lock_manual_stock!==true && realStock!==null){
        const normalized=Math.max(0,Math.trunc(realStock));
        patch.stock=normalized;
        patch.stock_quantity=normalized;
        patch.trier_stock_quantity=normalized;
        patch.last_stock_sync_at=patch.last_trier_sync_at;
      }
      if(freshActive!==null)patch.trier_active=freshActive;

      if(p.lock_base_price!==true){
        const price=priceOf(t);
        if(price!==null&&price>0){patch.price=price;patch.price_origin="trier";}
      }

      const listType=String(t.tipoLista??"").trim();
      const saleObservation=String(t.observacaoVenda??"").trim();
      if(listType)patch.medicine_list_type=listType;
      if(saleObservation)patch.sale_observation=saleObservation;
      const ean=barcodeOf(t);
      if(ean&&!p.barcode)patch.barcode=ean;

      const before=Number(p.stock||0);
      const {error:updateError}=await supabase.from("products").update(patch).eq("id",p.id);
      if(updateError){failed++;continue;}
      if(before>0&&realStock!==null&&realStock<=0)deactivated++;
      updated++;
    }
  }

  await Promise.all(Array.from({length:6},()=>worker()));

  await supabase.from("trier_logs").insert({
    type:"priority_sync",status:failed?"warning":"success",
    message:`Priority sync: ${checked} checked · ${updated} updated · ${failed} failed · ${notFound} not found`,
    details:{checked,updated,failed,not_found:notFound,deactivated,tier_stats:tierStats}
  });

  return Response.json({ok:true,checked,updated,failed,not_found:notFound,deactivated,tier_stats:tierStats});
});
