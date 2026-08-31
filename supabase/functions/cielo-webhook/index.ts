import { createClient } from "npm:@supabase/supabase-js@2";
import { getCieloCredentials } from "../_shared/cielo-credentials.ts";
import { CIELO_BASES, mapCieloStatus, type CieloEnv } from "../_shared/cielo.ts";
import { safeError, maskId } from "../_shared/mask.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4096;
function ok(){return new Response("ok",{status:200,headers:{"Content-Type":"text/plain","Cache-Control":"no-store"}})}
function timingSafeEqual(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}

Deno.serve(async(req)=>{
  if(req.method!=="POST") return ok();
  const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
  const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const WEBHOOK_SECRET=Deno.env.get("CIELO_WEBHOOK_SECRET")||"";
  const admin=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const {merchantId:MERCHANT_ID,merchantKey:MERCHANT_KEY}=await getCieloCredentials(admin);
    if(!MERCHANT_ID||!MERCHANT_KEY) return ok();
    const contentLength=Number(req.headers.get("content-length")||0); if(contentLength>MAX_BODY_BYTES) return ok();
    if(WEBHOOK_SECRET){const supplied=req.headers.get("x-cielo-webhook-secret")||"";if(!timingSafeEqual(supplied,WEBHOOK_SECRET)){safeError("[cielo-webhook] invalid webhook secret");return ok();}}
    const raw=await req.text(); if(raw.length>MAX_BODY_BYTES) return ok();
    let payload:any={}; try{payload=raw?JSON.parse(raw):{}}catch{return ok();}
    const paymentId=String(payload?.PaymentId||payload?.paymentId||"").trim(); const changeType=Number(payload?.ChangeType??payload?.changeType);
    if(!UUID_RE.test(paymentId)||!Number.isInteger(changeType)||changeType<0||changeType>99) return ok();
    const {data:pset}=await admin.from("payment_settings").select("environment").eq("id",1).maybeSingle();
    const env:CieloEnv=((pset as any)?.environment==="sandbox"?"sandbox":"production");
    const r=await fetch(`${CIELO_BASES[env].query}/1/sales/${paymentId}`,{headers:{MerchantId:MERCHANT_ID,MerchantKey:MERCHANT_KEY,"Content-Type":"application/json"}});
    if(!r.ok){safeError("[cielo-webhook] rejected/unverifiable notification",{status:r.status,paymentId:maskId(paymentId)});return ok();}
    const data=await r.json(); const statusCode=Number(data?.Payment?.Status??0); const newStatus=mapCieloStatus(statusCode); const amount=Number(data?.Payment?.Amount??0)/100; const merchantOrderId=data?.MerchantOrderId as string|undefined;
    const externalId=`cielo:${paymentId}:${changeType}`;
    const {error:insErr}=await admin.from("payment_events").insert({gateway:"cielo",event_type:`change_${changeType}`,external_id:externalId,payload:{PaymentId:paymentId,ChangeType:changeType}});
    if(insErr?.code==="23505"||insErr?.message?.toLowerCase().includes("duplicate")) return ok(); if(insErr)return ok();
    const filters=[`cielo_payment_id.eq.${paymentId}`]; if(merchantOrderId&&UUID_RE.test(merchantOrderId))filters.unshift(`id.eq.${merchantOrderId}`);
    const {data:order}=await admin.from("orders").select("*").or(filters.join(",")).maybeSingle();
    if(!order){await admin.from("payment_events").update({processed:true}).eq("external_id",externalId);return ok();}
    if(newStatus==="approved"&&Math.abs(amount-Number(order.total))>0.5){
      await admin.from("payment_errors").insert({stage:"webhook_amount",error_code:"amount_mismatch",message:"Valor confirmado pela Cielo diverge do total do pedido",payload_summary:{paymentId:maskId(paymentId),paid:amount,expected:Number(order.total)},order_id:order.id});
      await admin.from("orders").update({payment_status:"payment_review",cielo_payment_id:paymentId,cielo_status:statusCode}).eq("id",order.id);
      await admin.from("admin_notifications").insert({type:"payment_review",title:"Pagamento em revisão — divergência de valor",message:`Pedido #${String(order.id).slice(0,6)} com divergência de valor confirmada pela Cielo.`,order_id:order.id});
      await admin.from("payment_events").update({processed:true,order_id:order.id}).eq("external_id",externalId); return ok();
    }
    const firstApproval=newStatus==="approved"&&order.payment_status!=="approved";
    const update:Record<string,unknown>={payment_status:newStatus,cielo_payment_id:paymentId,cielo_status:statusCode};
    if(firstApproval){update.order_status="pago";update.status="em_atendimento";update.paid_at=new Date().toISOString();}
    if((newStatus==="cancelled"||newStatus==="rejected")&&!order.cancelled_at)update.cancelled_at=new Date().toISOString();
    await admin.from("orders").update(update).eq("id",order.id); await admin.from("payment_events").update({processed:true,order_id:order.id}).eq("external_id",externalId);
    if(firstApproval){
      await admin.from("admin_notifications").insert({type:"order_paid",title:"Produto vendido",message:`Pedido #${String(order.id).slice(0,6)} pago e confirmado pela Cielo.`,order_id:order.id});
      try{const {data:tset}=await admin.from("trier_settings").select("auto_send_orders_enabled").eq("id",1).maybeSingle();if((tset as any)?.auto_send_orders_enabled&&order.sales_channel==="site")fetch(`${SUPABASE_URL}/functions/v1/send-order-to-trier`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SERVICE}`,"x-internal-source":"cielo-webhook"},body:JSON.stringify({order_id:order.id})}).catch(()=>{});}catch{}
      fetch(`${SUPABASE_URL}/functions/v1/meta-conversions-api`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SERVICE}`,"x-internal-source":"cielo-webhook"},body:JSON.stringify({action:"purchase",order_id:order.id})}).catch(()=>{});
    }
    return ok();
  }catch(e){safeError("[cielo-webhook] unexpected",{message:e instanceof Error?e.message:"unknown"});return ok();}
});
