import { supabase } from "@/integrations/supabase/client";

export async function customerAccount<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("customer-account", {
    body: { action, ...payload },
  });

  if (error) {
    let message = error.message || "Falha na operação da conta.";
    try {
      const response: Response | undefined = (error as any)?.context;
      if (response && typeof response.clone === "function") {
        const text = await response.clone().text();
        try {
          const parsed = JSON.parse(text);
          message = parsed?.error || parsed?.message || message;
        } catch {
          if (text) message = text;
        }
      }
    } catch { /* ignore */ }
    throw new Error(message);
  }

  if (!data?.ok) throw new Error(data?.error || "Falha na operação da conta.");
  return data as T;
}
