import { describe, expect, it } from "vitest";
import { formatCpf, isValidCpf, normalizeCpf } from "@/lib/cpf";
import { isValidCpf as isValidCpfOnServer } from "../../supabase/functions/_shared/cpf";

describe("CPF helpers", () => {
  it("normalizes and formats a CPF while it is typed", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatCpf("52998")).toBe("529.98");
  });

  it("accepts CPFs with valid check digits", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("168.995.350-09")).toBe(true);
  });

  it("keeps the browser and payment server validation aligned", () => {
    expect(isValidCpfOnServer("529.982.247-25")).toBe(true);
    expect(isValidCpfOnServer("529.982.247-24")).toBe(false);
    expect(isValidCpfOnServer("111.111.111-11")).toBe(false);
  });

  it("rejects wrong, incomplete and repeated CPFs", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("529.982.247")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("000.000.000-00")).toBe(false);
  });
});
