import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type InventoryLifecycleResult = {
  ok: boolean;
  active_items?: number;
  committed_items?: number;
  released_items?: number;
  error?: string;
};

type ReservationState = {
  isErpOrder: boolean;
  statuses: string[];
};

async function loadReservationState(
  admin: SupabaseClient,
  orderId: string,
): Promise<ReservationState | { error: string }> {
  const [{ data: order, error: orderError }, { data: reservations, error: reservationError }] = await Promise.all([
    admin.from("orders").select("source").eq("id", orderId).maybeSingle(),
    admin.from("order_inventory_reservations").select("status").eq("order_id", orderId),
  ]);

  if (orderError) return { error: orderError.message };
  if (reservationError) return { error: reservationError.message };

  return {
    isErpOrder: String((order as any)?.source || "").startsWith("erp_"),
    statuses: (reservations || []).map((row: any) => String(row.status || "")),
  };
}

export async function commitOrderInventoryIfReserved(
  admin: SupabaseClient,
  orderId: string,
): Promise<InventoryLifecycleResult> {
  const before = await loadReservationState(admin, orderId);
  if ("error" in before) return { ok: false, error: before.error };

  // Pedido legado não participa do novo ledger. Mantém compatibilidade.
  if (!before.isErpOrder && before.statuses.length === 0) {
    return { ok: true, active_items: 0, committed_items: 0 };
  }

  if (before.isErpOrder && before.statuses.length === 0) {
    return { ok: false, error: "erp_reservation_missing" };
  }

  const activeBefore = before.statuses.filter((status) => status === "active").length;
  if (activeBefore === 0) {
    const committed = before.statuses.filter((status) => status === "committed").length;
    const unsafeTerminal = before.statuses.some((status) => status === "released" || status === "expired");

    if (committed === before.statuses.length && committed > 0) {
      return { ok: true, active_items: 0, committed_items: committed };
    }

    if (before.isErpOrder && unsafeTerminal) {
      return { ok: false, error: "erp_reservation_no_longer_committable" };
    }

    return { ok: true, active_items: 0, committed_items: committed };
  }

  const { data, error } = await admin.rpc("commit_order_inventory_internal", {
    _order_id: orderId,
  });
  if (error) return { ok: false, error: error.message };

  const after = await loadReservationState(admin, orderId);
  if ("error" in after) return { ok: false, error: after.error };

  const activeAfter = after.statuses.filter((status) => status === "active").length;
  const committedAfter = after.statuses.filter((status) => status === "committed").length;
  if (before.isErpOrder && (activeAfter > 0 || committedAfter !== after.statuses.length)) {
    return { ok: false, error: "erp_inventory_commit_incomplete" };
  }

  return { ok: true, ...(data || {}), active_items: activeAfter, committed_items: committedAfter };
}

export async function releaseOrderInventoryIfReserved(
  admin: SupabaseClient,
  orderId: string,
  reason: "cancelled" | "payment_failed" | "expired" | "manual_test" | "cielo_rejected",
): Promise<InventoryLifecycleResult> {
  const before = await loadReservationState(admin, orderId);
  if ("error" in before) return { ok: false, error: before.error };

  if (before.statuses.length === 0) {
    return { ok: true, active_items: 0, released_items: 0 };
  }

  const activeBefore = before.statuses.filter((status) => status === "active").length;
  if (activeBefore === 0) {
    return {
      ok: true,
      active_items: 0,
      released_items: before.statuses.filter((status) => status === "released" || status === "expired").length,
    };
  }

  const { data, error } = await admin.rpc("release_order_inventory_internal", {
    _order_id: orderId,
    _reason: reason,
  });
  if (error) return { ok: false, error: error.message };

  const after = await loadReservationState(admin, orderId);
  if ("error" in after) return { ok: false, error: after.error };
  const activeAfter = after.statuses.filter((status) => status === "active").length;

  if (before.isErpOrder && activeAfter > 0) {
    return { ok: false, error: "erp_inventory_release_incomplete" };
  }

  return { ok: true, ...(data || {}), active_items: activeAfter };
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

export function isErpOrderSource(source: unknown): boolean {
  return String(source || "").startsWith("erp_");
}
