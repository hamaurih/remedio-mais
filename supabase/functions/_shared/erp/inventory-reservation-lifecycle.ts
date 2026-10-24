import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type InventoryLifecycleResult = {
  ok: boolean;
  active_items?: number;
  committed_items?: number;
  released_items?: number;
  error?: string;
};

export async function commitOrderInventoryIfReserved(
  admin: SupabaseClient,
  orderId: string,
): Promise<InventoryLifecycleResult> {
  const { data, error } = await admin.rpc("commit_order_inventory_internal", {
    _order_id: orderId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, ...(data || {}) };
}

export async function releaseOrderInventoryIfReserved(
  admin: SupabaseClient,
  orderId: string,
  reason: "cancelled" | "payment_failed" | "expired" | "manual_test" | "cielo_rejected",
): Promise<InventoryLifecycleResult> {
  const { data, error } = await admin.rpc("release_order_inventory_internal", {
    _order_id: orderId,
    _reason: reason,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, ...(data || {}) };
}

export async function settleOrderInventoryForPayment(
  admin: SupabaseClient,
  orderId: string,
  paymentStatus: string,
): Promise<InventoryLifecycleResult> {
  const status = String(paymentStatus || "").trim().toLowerCase();

  if (status === "approved") {
    return commitOrderInventoryIfReserved(admin, orderId);
  }

  if (status === "rejected" || status === "cancelled") {
    return releaseOrderInventoryIfReserved(admin, orderId, "cielo_rejected");
  }

  return { ok: true, active_items: 0 };
}


export async function releaseInventoryBeforeOrderDelete(
  admin: SupabaseClient,
  orderId: string,
  reason: "payment_failed" | "cancelled" = "payment_failed",
): Promise<InventoryLifecycleResult> {
  const result = await releaseOrderInventoryIfReserved(admin, orderId, reason);
  if (!result.ok) return result;

  const { error } = await admin.from("orders").delete().eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  return result;
}
