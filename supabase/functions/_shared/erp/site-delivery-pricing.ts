export type DeliveryInput = {
  type: "pickup" | "delivery";
  lat?: number | null;
  lng?: number | null;
};

export type DeliverySettings = {
  delivery_fee?: number | null;
  delivery_mode?: string | null;
  delivery_max_km?: number | null;
  delivery_fee_zones?: Array<{ min_km: number; max_km: number; fee: number }> | null;
  store_lat?: number | null;
  store_lng?: number | null;
};

export type DeliveryPricingResult =
  | { ok: true; fee: number; distance_km: number | null; mode: "pickup" | "flat" | "distance" }
  | { ok: false; error: "delivery_coordinates_required" | "delivery_out_of_range" | "delivery_zone_missing"; distance_km?: number };

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function resolveSiteDeliveryFee(
  input: DeliveryInput,
  settings: DeliverySettings,
): DeliveryPricingResult {
  if (input.type === "pickup") {
    return { ok: true, fee: 0, distance_km: null, mode: "pickup" };
  }

  const mode = String(settings.delivery_mode || "flat").toLowerCase();
  if (mode !== "distance") {
    const fee = Math.max(0, Number(settings.delivery_fee || 0));
    return { ok: true, fee: Number(fee.toFixed(2)), distance_km: null, mode: "flat" };
  }

  const storeLat = Number(settings.store_lat);
  const storeLng = Number(settings.store_lng);
  const customerLat = Number(input.lat);
  const customerLng = Number(input.lng);

  if (
    !Number.isFinite(storeLat) ||
    !Number.isFinite(storeLng) ||
    !Number.isFinite(customerLat) ||
    !Number.isFinite(customerLng)
  ) {
    return { ok: false, error: "delivery_coordinates_required" };
  }

  const distance = haversineKm(storeLat, storeLng, customerLat, customerLng);
  const maxKm = Number(settings.delivery_max_km || 0);
  if (maxKm > 0 && distance > maxKm) {
    return { ok: false, error: "delivery_out_of_range", distance_km: distance };
  }

  const zones = Array.isArray(settings.delivery_fee_zones) ? settings.delivery_fee_zones : [];
  const zone = zones.find((item) =>
    distance >= Number(item.min_km) && distance <= Number(item.max_km)
  );
  if (!zone) {
    return { ok: false, error: "delivery_zone_missing", distance_km: distance };
  }

  return {
    ok: true,
    fee: Number(Math.max(0, Number(zone.fee || 0)).toFixed(2)),
    distance_km: distance,
    mode: "distance",
  };
}
