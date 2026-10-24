export type OrderCanaryMode = "off" | "observe";

export type OrderCanaryConfig = {
  mode: OrderCanaryMode;
  percent: number;
  channels: Set<string>;
  salt: string;
};

export type OrderCanaryItem = {
  variant_id?: string | null;
  requires_prescription?: boolean | null;
  controlled?: boolean | null;
};

export type OrderCanaryDecision = {
  route: "legacy";
  would_route: "legacy" | "erp";
  mode: OrderCanaryMode;
  candidate: boolean;
  selected: boolean;
  bucket: number | null;
  percent: number;
  reason:
    | "mode_off"
    | "channel_not_enabled"
    | "delivery_not_eligible"
    | "variant_not_eligible"
    | "regulated_item_not_eligible"
    | "cart_too_large"
    | "percent_zero"
    | "not_selected"
    | "selected_observe_only";
};

function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function parseOrderCanaryConfig(env: Record<string, string | undefined>): OrderCanaryConfig {
  const requestedMode = String(env.ERP_ORDER_CANARY_MODE || "off").trim().toLowerCase();
  const mode: OrderCanaryMode = requestedMode === "observe" ? "observe" : "off";
  const channels = new Set(
    String(env.ERP_ORDER_CANARY_CHANNELS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  return {
    mode,
    percent: clampPercent(env.ERP_ORDER_CANARY_PERCENT),
    channels,
    salt: String(env.ERP_ORDER_CANARY_SALT || "erp-order-canary-v1"),
  };
}

export function deterministicCanaryBucket(stableKey: string, salt: string): number {
  const input = `${salt}:${stableKey}`;
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % 10000;
}

export function evaluateOrderCanary(args: {
  config: OrderCanaryConfig;
  stableKey: string;
  channel: string;
  deliveryType: "pickup" | "delivery";
  items: OrderCanaryItem[];
}): OrderCanaryDecision {
  const channel = String(args.channel || "").trim().toLowerCase();
  const items = Array.isArray(args.items) ? args.items : [];

  const base = {
    route: "legacy" as const,
    mode: args.config.mode,
    percent: args.config.percent,
  };

  if (args.config.mode === "off") {
    return { ...base, would_route: "legacy", candidate: false, selected: false, bucket: null, reason: "mode_off" };
  }

  if (!args.config.channels.has(channel)) {
    return { ...base, would_route: "legacy", candidate: false, selected: false, bucket: null, reason: "channel_not_enabled" };
  }

  // Primeiro canário futuro: somente retirada, sem frete/endereço.
  if (args.deliveryType !== "pickup") {
    return { ...base, would_route: "legacy", candidate: false, selected: false, bucket: null, reason: "delivery_not_eligible" };
  }

  if (items.some((item) => Boolean(item?.variant_id))) {
    return { ...base, would_route: "legacy", candidate: false, selected: false, bucket: null, reason: "variant_not_eligible" };
  }

  if (items.some((item) => item?.requires_prescription === true || item?.controlled === true)) {
    return { ...base, would_route: "legacy", candidate: false, selected: false, bucket: null, reason: "regulated_item_not_eligible" };
  }

  if (items.length === 0 || items.length > 5) {
    return { ...base, would_route: "legacy", candidate: false, selected: false, bucket: null, reason: "cart_too_large" };
  }

  if (args.config.percent <= 0) {
    return { ...base, would_route: "legacy", candidate: true, selected: false, bucket: null, reason: "percent_zero" };
  }

  const bucket = deterministicCanaryBucket(args.stableKey, args.config.salt);
  const threshold = Math.round(args.config.percent * 100);
  const selected = bucket < threshold;

  if (!selected) {
    return { ...base, would_route: "legacy", candidate: true, selected: false, bucket, reason: "not_selected" };
  }

  // Segurança desta fase: mesmo selecionado, o checkout continua no legado.
  return {
    ...base,
    would_route: "erp",
    candidate: true,
    selected: true,
    bucket,
    reason: "selected_observe_only",
  };
}
