import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ErpPage, ErpPageHeader } from "@/components/admin/ErpPageShell";
import { ArrowRight, BarChart3, Globe2, Image, LayoutGrid, Megaphone, Menu, MonitorCog, PanelsTopLeft, Store, Tag } from "lucide-react";

const tools = [
  { title: "Layout da Home", description: "Organize os blocos e a estrutura principal da página inicial.", to: "/admin/layout-home", icon: PanelsTopLeft },
  { title: "Vitrines", description: "Escolha produtos e coleções exibidos nas prateleiras da Home.", to: "/admin/vitrines", icon: Store },
  { title: "Banners", description: "Gerencie os banners principais e peças promocionais do site.", to: "/admin/banners", icon: Image },
  { title: "Mosaico", description: "Controle os cards visuais e destaques do mosaico da Home.", to: "/admin/mosaico", icon: LayoutGrid },
  { title: "Menus", description: "Organize departamentos, navegação e acessos do cabeçalho.", to: "/admin/menus", icon: Menu },
  { title: "Campanhas", description: "Monte páginas e ações promocionais para o e-commerce.", to: "/admin/campanhas", icon: Megaphone },
  { title: "Ofertas", description: "Controle produtos promocionais, descontos e destaques.", to: "/admin/ofertas", icon: Tag },
  { title: "Meta Ads", description: "Pixel, CAPI e acompanhamento das integrações de conversão.", to: "/admin/integrations/meta-ads", icon: BarChart3 },
  { title: "Diagnóstico da Home", description: "Verifique problemas de conteúdo, blocos e configuração da Home.", to: "/admin/diagnostico-home", icon: MonitorCog },
];

export default function AdminSiteHub() {
  return <ErpPage>
    <ErpPageHeader
      title="Site e E-commerce"
      description="Centralize tudo que altera a experiência da loja virtual: layout, vitrines, banners, menus, campanhas e mensuração."
      eyebrow="E-commerce"
      icon={Globe2}
    />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tools.map(({ title, description, to, icon: Icon }) => <Link key={to} to={to} className="group rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Card className="h-full rounded-2xl hover:shadow-lg hover:border-primary/40 transition-all hover:-translate-y-0.5"><CardContent className="p-6 h-full flex flex-col"><div className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center"><Icon className="h-5 w-5" /></div><h2 className="font-extrabold text-lg mt-5">{title}</h2><p className="text-sm text-muted-foreground mt-1 leading-relaxed flex-1">{description}</p><div className="mt-5 pt-4 border-t flex items-center justify-between text-sm font-semibold text-primary"><span>Acessar</span><ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" /></div></CardContent></Card></Link>)}
    </div>
  </ErpPage>;
}
