import { createClient } from "npm:@supabase/supabase-js@2";
import {
  cieloCredentialNames,
  getCieloCredentials,
  getCieloEnvironment,
  type CieloCredentialEnvironment,
} from "../_shared/cielo-credentials.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")||Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ALLOWED=new Set([
  "https://atacadaodosmedicamentos.com.br",
  "https://www.atacadaodosmedicamentos.com.br",
  "http://localhost:5173",
  "http://localhost:8080"
]);

function cors(req:Request){
  const o=req.headers.get("origin")||"";
  return {
    "Access-Control-Allow-Origin":ALLOWED.has(o)?o:"https://atacadaodosmedicamentos.com.br",
    "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Content-Type":"application/json",
    "Cache-Control":"no-store",
    "Pragma":"no-cache",
    "X-Content-Type-Options":"nosniff",
    "Vary":"Origin"
  };
}

function json(req:Request,b:unknown,s=200){
  return new Response(JSON.stringify(b),{status:s,headers:cors(req)});
}

async function requireAdmin(req:Request){
  const h=req.headers.get("Authorization")||"";
  if(!h.startsWith("Bearer ")) return null;
  const c=createClient(SUPABASE_URL,ANON_KEY,{
    global:{headers:{Authorization:h}},
    auth:{persistSession:false}
  });
  const {data,error}=await c.auth.getUser(h.slice(7));
  const id=data?.user?.id;
  if(error||!id) return null;
  const {data:roles}=await admin.from("user_roles").select("role").eq("user_id",id);
  return (roles||[]).some((r:any)=>String(r.role)==="admin")?id:null;
}

async function secretConfigured(name:string){
  const {data,error}=await admin.rpc("get_private_payment_secret",{p_name:name});
  if(error) throw error;
  return Boolean(String(data||"").trim());
}

async function environmentStatus(environment:CieloCredentialEnvironment){
  const n=cieloCredentialNames(environment);
  const [id,key]=await Promise.all([
    secretConfigured(n.idVault),
    secretConfigured(n.keyVault),
  ]);
  return {merchant_id_configured:id,merchant_key_configured:key};
}

async function status(){
  const environment=await getCieloEnvironment(admin);
  const [current,production,sandbox]=await Promise.all([
    environmentStatus(environment),
    environmentStatus("production"),
    environmentStatus("sandbox"),
  ]);
  return {
    environment,
    ...current,
    production,
    sandbox,
  };
}

async function test(){
  const {merchantId,merchantKey,environment}=await getCieloCredentials(admin);
  if(!merchantId||!merchantKey) return {ok:false,status:"missing",environment};

  const base=environment==="sandbox"
    ?"https://apiquerysandbox.cieloecommerce.cielo.com.br"
    :"https://apiquery.cieloecommerce.cielo.com.br";

  try{
    const r=await fetch(`${base}/1/sales/00000000-0000-0000-0000-000000000000`,{
      headers:{MerchantId:merchantId,MerchantKey:merchantKey,Accept:"application/json"}
    });
    const ok=![401,403].includes(r.status);
    const st=ok?"connected":"invalid_credentials";
    await admin.from("payment_settings").update({
      last_connection_test_at:new Date().toISOString(),
      last_connection_status:st
    }).eq("id",1);
    return {ok,status:st,environment,http_status:r.status};
  }catch{
    await admin.from("payment_settings").update({
      last_connection_test_at:new Date().toISOString(),
      last_connection_status:"network_error"
    }).eq("id",1);
    return {ok:false,status:"network_error",environment};
  }
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:cors(req)});
  if(req.method!=="POST") return json(req,{error:"method_not_allowed"},405);
  if(!ANON_KEY||!SERVICE_KEY) return json(req,{error:"server_config_error"},503);
  if(!await requireAdmin(req)) return json(req,{error:"forbidden"},403);

  try{
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||"status");

    if(action==="status") return json(req,{ok:true,...await status()});

    if(action==="save"){
      const environment=await getCieloEnvironment(admin);
      const names=cieloCredentialNames(environment);
      const mid=typeof body?.merchant_id==="string"?body.merchant_id.trim():"";
      const key=typeof body?.merchant_key==="string"?body.merchant_key.trim():"";
      const cur=await environmentStatus(environment);

      if(!mid&&!key) return json(req,{error:"nothing_to_save"},400);
      if(!mid&&!cur.merchant_id_configured) return json(req,{error:"merchant_id_required"},400);
      if(!key&&!cur.merchant_key_configured) return json(req,{error:"merchant_key_required"},400);
      if(mid&&(mid.length<8||mid.length>128)) return json(req,{error:"invalid_merchant_id"},400);
      if(key&&(key.length<8||key.length>256)) return json(req,{error:"invalid_merchant_key"},400);

      if(mid){
        const {error}=await admin.rpc("upsert_private_payment_secret",{
          p_name:names.idVault,p_value:mid
        });
        if(error) throw error;
      }
      if(key){
        const {error}=await admin.rpc("upsert_private_payment_secret",{
          p_name:names.keyVault,p_value:key
        });
        if(error) throw error;
      }
      return json(req,{ok:true,...await status()});
    }

    if(action==="test") return json(req,await test());
    return json(req,{error:"invalid_action"},400);
  }catch(e){
    console.error("manage-cielo-credentials",e instanceof Error?e.message:"unexpected");
    return json(req,{error:"internal_error"},500);
  }
});
