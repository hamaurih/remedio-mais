import { MapPin, Phone, Instagram, Clock } from "lucide-react";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { Link } from "react-router-dom";
import logoRed from "@/assets/logo-red.jpeg";

export function Footer() {
  const { data: s } = useStoreSettings();
  return (
    <footer className="mt-16 bg-secondary/60 border-t">
      <div className="container py-10 grid gap-8 md:grid-cols-4">
        <div>
          <img src={logoRed} alt="Atacadão dos Medicamentos" className="h-10 w-auto object-contain mb-3" />
          <p className="text-sm text-muted-foreground">Preço baixo todo dia, atendimento rápido e entrega local em Campina Grande - PB.</p>
        </div>
        <div>
          <h4 className="font-semibold mb-3">Contato</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2"><Phone className="h-4 w-4 mt-0.5" /> (83) 99928-6000</li>
            <li className="flex gap-2"><MapPin className="h-4 w-4 mt-0.5" /> {s?.address}</li>
            <li className="flex gap-2"><Clock className="h-4 w-4 mt-0.5" /> {s?.hours}</li>
            {s?.instagram && (
              <li className="flex gap-2"><Instagram className="h-4 w-4 mt-0.5" /> <a className="hover:text-primary" href={s.instagram} target="_blank" rel="noopener">@atacadaodosmedicamentoscg</a></li>
            )}
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-3">Institucional</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link className="hover:text-primary" to="/categoria/ofertas">Ofertas</Link></li>
            <li><Link className="hover:text-primary" to="/enviar-receita">Enviar receita</Link></li>
            <li><Link className="hover:text-primary" to="/auth">Área administrativa</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-3">Aviso</h4>
          <p className="text-xs text-muted-foreground">As informações dos produtos são meramente informativas. Consulte o farmacêutico em caso de dúvidas. Para medicamentos que exigem receita, a venda está sujeita à apresentação e conferência do documento.</p>
        </div>
      </div>
      <div className="border-t py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Farmácia Atacadão dos Medicamentos. Todos os direitos reservados.
      </div>
    </footer>
  );
}
