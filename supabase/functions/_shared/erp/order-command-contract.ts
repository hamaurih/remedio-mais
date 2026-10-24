export type ErpOrderCommandItem = {
  product_id: string;
  variant_id?: string | null;
  variant_label?: string | null;
  quantity: number;
  unit_price: number;
  prescription_id?: string | null;
  prescription_condition?: string | null;
};

export type ErpOrderCommandPayload = {
  idempotency_key: string;
  channel: "site" | "pdv" | "whatsapp_ia" | "whatsapp_humano" | "telefone";
  tenant_id: string;
  store_id: string;
  user_id?: string | null;
  customer: {
    name: string;
    phone: string;
    email?: string | null;
    cpf?: string | null;
  };
  delivery_type: "pickup" | "delivery";
  delivery?: {
    cep?: string | null;
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    reference?: string | null;
    lat?: number | null;
    lng?: number | null;
  };
  payment_method?: "pix" | "credit_card" | null;
  delivery_fee: number;
  discount: number;
  prescription_original_required: boolean;
  meta?: {
    fbp?: string | null;
    fbc?: string | null;
  };
  items: ErpOrderCommandItem[];
  created_by?: string | null;
};

export function normalizeOrderCommandPayload(input: ErpOrderCommandPayload): ErpOrderCommandPayload {
  const clean = (value: unknown, max = 255) => {
    const text = String(value ?? "").trim();
    return text ? text.slice(0, max) : null;
  };

  return {
    ...input,
    idempotency_key: String(input.idempotency_key || "").trim().slice(0, 200),
    tenant_id: String(input.tenant_id || "").trim(),
    store_id: String(input.store_id || "").trim(),
    user_id: input.user_id ? String(input.user_id).trim() : null,
    customer: {
      name: clean(input.customer?.name, 200) || "",
      phone: clean(input.customer?.phone, 50) || "",
      email: clean(input.customer?.email, 255),
      cpf: clean(input.customer?.cpf, 30),
    },
    delivery: input.delivery
      ? {
          cep: clean(input.delivery.cep, 20),
          street: clean(input.delivery.street, 255),
          number: clean(input.delivery.number, 50),
          complement: clean(input.delivery.complement, 255),
          neighborhood: clean(input.delivery.neighborhood, 120),
          city: clean(input.delivery.city, 120),
          state: clean(input.delivery.state, 2)?.toUpperCase() || null,
          reference: clean(input.delivery.reference, 255),
          lat: Number.isFinite(Number(input.delivery.lat)) ? Number(input.delivery.lat) : null,
          lng: Number.isFinite(Number(input.delivery.lng)) ? Number(input.delivery.lng) : null,
        }
      : undefined,
    delivery_fee: Math.max(0, Number(input.delivery_fee || 0)),
    discount: Math.max(0, Number(input.discount || 0)),
    prescription_original_required: Boolean(input.prescription_original_required),
    meta: {
      fbp: clean(input.meta?.fbp, 128),
      fbc: clean(input.meta?.fbc, 256),
    },
    items: (input.items || []).map((item) => ({
      product_id: String(item.product_id || "").trim(),
      variant_id: item.variant_id ? String(item.variant_id).trim() : null,
      variant_label: clean(item.variant_label, 200),
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      prescription_id: item.prescription_id ? String(item.prescription_id).trim() : null,
      prescription_condition: clean(item.prescription_condition, 80),
    })),
    created_by: clean(input.created_by, 200),
  };
}
