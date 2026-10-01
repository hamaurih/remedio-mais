import { createClient } from "npm:@supabase/supabase-js@2";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const BASES={production:"https://api.cieloecommerce.cielo.com.br",sandbox:"https://apisandbox.cieloecommerce.cielo.com.br"} as const;
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json"}});
const cents=(v:number)=>Math.round(Number(v)*100);
type Body={order_id:string;amount?:number;reason?:string;idempotency_key?:string;mode?:"execute"|"request"};
async function fail(admin:any,id:string,userId:string,message:string){await admin.from("refund_requests").update({status:"failed",error_message:message,processed_by:userId,processed_at:new Date().toISOString()}).eq("id",id);}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
 try{
  const U=Deno.env.get("SUPABASE_URL")!,A=Deno.env.get("SUPABASE_ANON_KEY")!,S=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader=req.headers.get("Authorization");if(!authHeader?.startsWith("Bearer "))return json({error:"Unauthorized"},401);
  const auth=createClient(U,A,{global:{headers:{Authorization:authHeader}}});
  const {data:claims,error:authError}=await auth.auth.getClaims(authHeader.slice(7));const userId=claims?.claims?.sub as string|undefined;
  if(authError||!userId)return json({error:"Unauthorized"},401);
  const body:Body=await req.json().catch(()=>null);if(!body?.order_id)return json({error:"order_id obrigatório"},400);
  if(body.amount!==undefined&&(!Number.isFinite(body.amount)||body.amount<=0))return json({error:"amount deve ser maior que zero"},400);
  const admin=createClient(U,S,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:roles}=await admin.from("user_roles").select("role").eq("user_id",userId);
  const isAdmin=(roles||[]).some((r:any)=>r.role==="admin"),isSeller=(roles||[]).some((r:any)=>r.role==="seller");
  if(!isAdmin&&!isSeller)return json({error:"Sem permissão"},403);
  let canExecute=isAdmin,canRequest=isAdmin;
  if(!isAdmin){const {data:p}=await admin.from("seller_permissions").select("can_request_refund,can_execute_refund").eq("user_id",userId).maybeSingle();canRequest=!!p?.can_request_refund;canExecute=!!p?.can_execute_refund;}
  const {data:order,error:orderError}=await admin.from("orders").select("*").eq("id",body.order_id).maybeSingle();
  if(orderError||!order)return json({error:"Pedido não encontrado"},404);
  if(!order.cielo_payment_id)return json({error:"Pedido sem ID de pagamento Cielo"},400);
  if(!["approved","partially_refunded"].includes(order.payment_status))return json({error:"Pedido não está em estado reembolsável"},400);
  const previous=await admin.from("refund_requests").select("amount").eq("order_id",order.id).eq("status","approved");
  const already=(previous.data||[]).reduce((s:number,r:any)=>s+Number(r.amount||0),0),available=Math.max(0,Number(order.total||0)-already);
  const requested=body.amount===undefined?available:Number(body.amount);
  if(requested<=0||requested>available+0.005)return json({error:"Valor de reembolso excede o saldo disponível"},400);
  const isTotal=Math.abs(requested-available)<0.005,kind=isTotal?"total":"partial",mode=body.mode||"execute";
  const key=body.idempotency_key||crypto.randomUUID();
  const {data:rr,error:rrError}=await admin.from("refund_requests").insert({order_id:order.id,payment_id:String(order.cielo_payment_id),requested_by:userId,reason:body.reason||null,type:kind,amount:requested,status:"pending",idempotency_key:key}).select().single();
  if(rrError)return json({error:rrError.message},409);
  if(mode!=="execute"||!canExecute){
    if(!canRequest){await fail(admin,rr.id,userId,"Sem permissão");return json({error:"Sem permissão para solicitar reembolso"},403);}
    await admin.from("orders").update({status:"reembolso_pendente"}).eq("id",order.id);
    await admin.from("order_events").insert({order_id:order.id,type:"refund_requested",message:"Reembolso solicitado",created_by:userId,metadata:{refund_request_id:rr.id,amount:requested}});
    return json({ok:true,status:"pending",refund_request_id:rr.id});
  }
  const mark=await admin.from("refund_requests").update({status:"processing"}).eq("id",rr.id);if(mark.error)return json({error:"Não foi possível iniciar o reembolso"},500);
  let merchantId=(Deno.env.get("CIELO_MERCHANT_ID")||"").trim(),merchantKey=(Deno.env.get("CIELO_MERCHANT_KEY")||"").trim();
  if(!merchantId||!merchantKey){const [i,k]=await Promise.all([admin.rpc("get_private_payment_secret",{p_name:"CIELO_MERCHANT_ID"}),admin.rpc("get_private_payment_secret",{p_name:"CIELO_MERCHANT_KEY"})]);merchantId=merchantId||String(i.data||"");merchantKey=merchantKey||String(k.data||"");}
  if(!merchantId||!merchantKey){await fail(admin,rr.id,userId,"Cielo não configurada");return json({error:"Cielo não configurada"},503);}
  const {data:settings}=await admin.from("payment_settings").select("environment").eq("id",1).maybeSingle();
  const base=BASES[settings?.environment==="sandbox"?"sandbox":"production"];
  const url=isTotal?`${base}/1/sales/${order.cielo_payment_id}/void`:`${base}/1/sales/${order.cielo_payment_id}/void?amount=${cents(requested)}`;
  const response=await fetch(url,{method:"PUT",headers:{MerchantId:merchantId,MerchantKey:merchantKey,"Content-Type":"application/json"}});
  const gateway=await response.json().catch(()=>({}));
  if(!response.ok){const detail=Array.isArray(gateway)?gateway.map((x:any)=>x.Message||x.Code).join("; "):(gateway?.Message||`HTTP ${response.status}`);await fail(admin,rr.id,userId,String(detail));await admin.from("order_events").insert({order_id:order.id,type:"refund_failed",message:`Falha no reembolso Cielo: ${detail}`,created_by:userId,metadata:{refund_request_id:rr.id}});return json({error:"Falha na Cielo",detail},502);}
  const refundId=String(gateway?.Tid||order.cielo_payment_id),now=new Date().toISOString(),newStatus=isTotal?"refunded":"partially_refunded";
  const ledger=await admin.from("cash_ledger").insert({tenant_id:order.tenant_id,store_id:order.store_id,direction:"outflow",amount:requested,occurred_at:now,payment_method:order.payment_method||"Cielo",source_type:"refund",source_id:rr.id,category:"Estorno",description:`Estorno ${kind} — pedido ${order.order_code||order.id.slice(0,8)}`,status:"posted",idempotency_key:`refund:${rr.id}`});
  if(ledger.error){await admin.from("payment_errors").insert({stage:"refund_financial_posting",message:ledger.error.message,order_id:order.id,payload_summary:{refund_request_id:rr.id,amount:requested}});await fail(admin,rr.id,userId,"Reembolso aprovado na Cielo, mas requer conferência financeira: "+ledger.error.message);return json({error:"Reembolso aprovado na Cielo; lançamento financeiro precisa de conferência"},500);}
  const completed=await admin.from("refund_requests").update({status:"approved",cielo_refund_id:refundId,processed_by:userId,processed_at:now}).eq("id",rr.id);
  if(completed.error)return json({error:"Reembolso aprovado, mas não foi possível registrar o histórico"},500);
  await admin.from("orders").update({payment_status:newStatus,status:isTotal?"reembolsado":order.status,order_status:isTotal?"reembolsado":order.order_status,cielo_status:gateway?.Status??order.cielo_status}).eq("id",order.id);
  const ar=await admin.from("accounts_receivable").select("id,notes").eq("order_id",order.id).maybeSingle();
  if(ar.data){const notes=[ar.data.notes,`Estorno ${kind} de R$ ${requested.toFixed(2)} registrado em ${now}`].filter(Boolean).join("\n");await admin.from("accounts_receivable").update(isTotal?{status:"cancelled",notes}:{notes}).eq("id",ar.data.id);}
  await admin.from("order_events").insert({order_id:order.id,type:"refund_completed",message:`Reembolso ${kind} concluído na Cielo — R$ ${requested.toFixed(2)}`,created_by:userId,metadata:{refund_request_id:rr.id,cielo_refund_id:refundId,amount:requested}});
  await admin.from("admin_notifications").insert({type:"refund_completed",title:"Reembolso concluído",message:`Pedido ${order.order_code||order.id.slice(0,8)} — R$ ${requested.toFixed(2)}`,order_id:order.id,role_target:"admin",priority:"normal",metadata:{refund_request_id:rr.id,cielo_refund_id:refundId}});
  return json({ok:true,status:"approved",refund_request_id:rr.id,cielo_refund_id:refundId});
 }catch(error){return json({error:String(error instanceof Error?error.message:error)},500)}
});