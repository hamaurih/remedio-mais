import { createClient } from "npm:@supabase/supabase-js@2";
import { getCieloCredentials } from "../_shared/cielo-credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CIELO_QUERY = {
  production: "https://apiquery.cieloecommerce.cielo.com.br",
  sandbox: "https://apiquerysandbox.cieloecommerce.cielo.com.br",
} as const;
const STATUS: Record<number,string> = {0:"pending",1:"authorized",2:"approved",3:"rejected",10:"cancelled",11:"refunded",12:"pending",13:"cancelled",20:"pending"};
function json(body: unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}})}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  try{
    const SUPABASE_URL=Deno.env.get("SUPABASE_URL"), ANON=Deno.env.get("SUPABASE_ANON_KEY"), SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!SUPABASE_URL||!ANON||!SERVICE) return json({error:"Configuração interna indisponível"},503);
    const authHeader=req.headers.get("Authorization");
    if(!authHeader?.startsWith("Bearer ")) return json({error:"Unauthorized"},401);
    const token=authHeader.slice(7);
    const auth=createClient(SUPABASE_URL,ANON,{global:{headers:{Authorization:authHeader}}});
    const {data:userData,error:userError}=await auth.auth.getUser(token); const userId=userData?.user?.id;
    if(userError||!userId) return json({error:"Unauthorized"},401);
    const admin=createClient(SUPABASE_URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
    const {merchantId:MERCHANT_ID,merchantKey:MERCHANT_KEY}=await getCieloCredentials(admin);
    if(!MERCHANT_ID||!MERCHANT_KEY) return json({error:"Cielo não configurada"},503);
    const body=await req.json().catch(()=>({})); const orderId=body?.order_id;
    if(!orderId) return json({error:"order_id obrigatório"},400);
    const {data:order,error:orderError}=await admin.from("orders").select("*").eq("id",orderId).maybeSingle();
    if(orderError) return json({error:"Falha ao consultar pedido"},500); if(!order) return json({error:"Pedido não encontrado"},404);
    const {data:roles}=await admin.from("user_roles").select("role").eq("user_id",userId);
    const privileged=(roles||[]).some((r:any)=>["admin","gerente"].includes(String(r.role)));
    if(!privileged&&order.user_id!==userId) return json({error:"Forbidden"},403);
    if(!order.cielo_payment_id) return json({order_id:order.id,payment_status:order.payment_status,cielo_status:order.cielo_status});
    const {data:settings}=await admin.from("payment_settings").select("environment").eq("id",1).maybeSingle();
    const env=settings?.environment==="sandbox"?"sandbox":"production";
    let response:Response;
    try{response=await fetch(`${CIELO_QUERY[env]}/1/sales/${encodeURIComponent(order.cielo_payment_id)}`,{headers:{MerchantId:MERCHANT_ID,MerchantKey:MERCHANT_KEY,Accept:"application/json"}})}
    catch{return json({order_id:order.id,payment_status:order.payment_status,cielo_status:order.cielo_status,reconciliation:"gateway_unreachable"})}
    if(!response.ok) return json({order_id:order.id,payment_status:order.payment_status,cielo_status:order.cielo_status,reconciliation:"gateway_error",gateway_http_status:response.status});
    const data=await response.json().catch(()=>({})); const code=Number(data?.Payment?.Status??order.cielo_status??0); const paymentStatus=STATUS[code]??"pending";
    const paidAmount=Number(data?.Payment?.Amount??0)/100; const expected=Number(order.total??0);
    if(paymentStatus==="approved" && Math.abs(paidAmount-expected)>0.5){
      await admin.from("payment_errors").insert({stage:"reconciliation_amount",error_code:"amount_mismatch",message:"Valor confirmado pela Cielo diverge do total do pedido",payload_summary:{paid:paidAmount,expected},order_id:order.id});
      await admin.from("orders").update({payment_status:"payment_review",cielo_status:code}).eq("id",order.id);
      await admin.from("admin_notifications").insert({type:"payment_review",title:"Pagamento em revisão — divergência de valor",message:`Pedido #${String(order.id).slice(0,6)} requer conferência.`,order_id:order.id});
      return json({order_id:order.id,payment_status:"payment_review",cielo_status:code,reconciliation:"amount_mismatch"});
    }
    const firstApproval=paymentStatus==="approved"&&order.payment_status!=="approved";
    const update:Record<string,unknown>={payment_status:paymentStatus,cielo_status:code};
    if(firstApproval){update.order_status="pago";update.status="em_atendimento";update.paid_at=new Date().toISOString()}
    else if(["cancelled","rejected"].includes(paymentStatus)&&!order.cancelled_at) update.cancelled_at=new Date().toISOString();
    const {error:updateError}=await admin.from("orders").update(update).eq("id",order.id); if(updateError) return json({error:"Falha ao atualizar conciliação"},500);
    if(firstApproval){
      await admin.from("admin_notifications").insert({type:"order_paid",title:"Produto vendido",message:`Pedido #${String(order.id).slice(0,6)} pago e confirmado pela Cielo.`,order_id:order.id});
      try{const {data:tset}=await admin.from("trier_settings").select("auto_send_orders_enabled").eq("id",1).maybeSingle(); if((tset as any)?.auto_send_orders_enabled&&order.sales_channel==="site") fetch(`${SUPABASE_URL}/functions/v1/send-order-to-trier`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SERVICE}`,"x-internal-source":"check-cielo-status"},body:JSON.stringify({order_id:order.id})}).catch(()=>{});}catch{}
      fetch(`${SUPABASE_URL}/functions/v1/meta-conversions-api`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${SERVICE}`,"x-internal-source":"check-cielo-status"},body:JSON.stringify({action:"purchase",order_id:order.id})}).catch(()=>{});
    }
    return json({order_id:order.id,payment_status:paymentStatus,cielo_status:code,reconciliation:"ok"});
  }catch(e){console.error("[check-cielo] unexpected",e instanceof Error?e.message:"unknown");return json({error:"Falha interna de conciliação"},500)}
});
