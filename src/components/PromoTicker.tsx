import { useEffect, useState } from "react";

const MESSAGES = [
  "Preço baixo todo dia",
  "Peça pelo WhatsApp e retire na loja",
  "Entrega rápida em Campina Grande",
  "Envie sua receita para análise",
];

export function PromoTicker() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % MESSAGES.length), 4000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="bg-primary-dark text-primary-foreground text-xs">
      <div className="container py-1.5 flex items-center justify-center sm:justify-between gap-3 overflow-hidden">
        <div className="relative h-4 flex-1 hidden sm:block">
          {MESSAGES.map((m, idx) => (
            <span
              key={m}
              className={`absolute inset-0 transition-opacity duration-700 ${idx === i ? "opacity-100" : "opacity-0"}`}
            >
              {m}
            </span>
          ))}
        </div>
        <div className="sm:hidden font-medium transition-opacity duration-700" key={MESSAGES[i]}>{MESSAGES[i]}</div>
        <span className="hidden sm:inline font-semibold whitespace-nowrap">★ 4,9 no Google</span>
      </div>
    </div>
  );
}
