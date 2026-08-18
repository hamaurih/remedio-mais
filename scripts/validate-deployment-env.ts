import fs from "node:fs";

const STAGING_PROJECT_REF = "jzltdocmvvdlyaukwzix";

function readTrackedEnv(name: string): string {
  try {
    const text = fs.readFileSync(".env", "utf8");
    const match = text.match(new RegExp(`^${name}=[\\"']?([^\\n\\r\\"']+)[\\"']?`, "m"));
    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

const vercelEnv = process.env.VERCEL_ENV || "local";
const supabaseUrl = process.env.VITE_SUPABASE_URL || readTrackedEnv("VITE_SUPABASE_URL");
const projectId = process.env.VITE_SUPABASE_PROJECT_ID || readTrackedEnv("VITE_SUPABASE_PROJECT_ID");
const pointsToStaging = supabaseUrl.includes(STAGING_PROJECT_REF) || projectId === STAGING_PROJECT_REF;

if (vercelEnv === "production" && pointsToStaging) {
  console.error("\n[deployment-env] BLOQUEADO: build de PRODUÇÃO está apontando para o Supabase de HOMOLOGAÇÃO.\nConfigure VITE_SUPABASE_URL / VITE_SUPABASE_PROJECT_ID da Production antes de publicar.\n");
  process.exit(1);
}

if (vercelEnv === "preview" && !pointsToStaging) {
  console.warn("[deployment-env] Atenção: Preview não está apontando para o Supabase de homologação.");
}

console.log(`[deployment-env] ambiente=${vercelEnv} backend=${pointsToStaging ? "staging" : "non-staging"}`);
