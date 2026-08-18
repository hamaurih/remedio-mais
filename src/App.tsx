import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MetaPixelProvider } from "@/components/MetaPixelProvider";
import { useAuth } from "@/hooks/useAuth";

import Index from "./pages/Index.tsx";
import Category from "./pages/Category.tsx";
import Product from "./pages/Product.tsx";
import Collection from "./pages/Collection.tsx";
import NotFound from "./pages/NotFound.tsx";

const Cart = lazy(() => import("./pages/Cart.tsx"));
const Checkout = lazy(() => import("./pages/Checkout.tsx"));
const PixPayment = lazy(() => import("./pages/PixPayment.tsx"));
const OrderReturn = lazy(() => import("./pages/OrderReturn.tsx"));
const SendPrescription = lazy(() => import("./pages/SendPrescription.tsx"));
const Search = lazy(() => import("./pages/Search.tsx"));
const Departamentos = lazy(() => import("./pages/Departamentos.tsx"));
const Department = lazy(() => import("./pages/Department.tsx"));
const Campaign = lazy(() => import("./pages/Campaign.tsx"));
const Auth = lazy(() => import("./pages/Auth.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy.tsx"));
const Terms = lazy(() => import("./pages/Terms.tsx"));
const Returns = lazy(() => import("./pages/Returns.tsx"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy.tsx"));
const Contact = lazy(() => import("./pages/Contact.tsx"));

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.tsx"));
const AdminHome = lazy(() => import("./pages/admin/AdminHome.tsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.tsx"));
const SellerDashboard = lazy(() => import("./pages/admin/SellerDashboard.tsx"));
const AdminPharmacyErp = lazy(() => import("./pages/admin/AdminPharmacyErp.tsx"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts.tsx"));
const AdminProductsImport = lazy(() => import("./pages/admin/AdminProductsImport.tsx"));
const AdminProductsReconcile = lazy(() => import("./pages/admin/AdminProductsReconcile.tsx"));
const AdminStock = lazy(() => import("./pages/admin/AdminStock.tsx"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers.tsx"));
const AdminSellers = lazy(() => import("./pages/admin/AdminSellers.tsx"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories.tsx"));
const AdminTaxonomy = lazy(() => import("./pages/admin/AdminTaxonomy.tsx"));
const AdminBanners = lazy(() => import("./pages/admin/AdminBanners.tsx"));
const AdminBannerGenerator = lazy(() => import("./pages/admin/AdminBannerGenerator.tsx"));
const AdminPromoBanner = lazy(() => import("./pages/admin/AdminPromoBanner.tsx"));
const AdminMosaic = lazy(() => import("./pages/admin/AdminMosaic.tsx"));
const AdminHomeLayout = lazy(() => import("./pages/admin/AdminHomeLayout.tsx"));
const AdminHomeShelves = lazy(() => import("./pages/admin/AdminHomeShelves.tsx"));
const AdminCampaigns = lazy(() => import("./pages/admin/AdminCampaigns.tsx"));
const AdminOffers = lazy(() => import("./pages/admin/AdminOffers.tsx"));
const AdminPriceMonitor = lazy(() => import("./pages/admin/AdminPriceMonitor.tsx"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders.tsx"));
const AdminPayments = lazy(() => import("./pages/admin/AdminPayments.tsx"));
const AdminPrescriptions = lazy(() => import("./pages/admin/AdminPrescriptions.tsx"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings.tsx"));
const AdminHomeDiagnostics = lazy(() => import("./pages/admin/AdminHomeDiagnostics.tsx"));
const AdminMenus = lazy(() => import("./pages/admin/AdminMenus.tsx"));
const AdminDataQuality = lazy(() => import("./pages/admin/AdminDataQuality.tsx"));
const AdminAudit = lazy(() => import("./pages/admin/AdminAudit.tsx"));
const AdminArchiveProducts = lazy(() => import("./pages/admin/AdminArchiveProducts.tsx"));
const AdminTrier = lazy(() => import("./pages/admin/AdminTrier.tsx"));
const AdminTrierEcommerceSales = lazy(() => import("./pages/admin/AdminTrierEcommerceSales.tsx"));
const AdminWhatsAppAgent = lazy(() => import("./pages/admin/AdminWhatsAppAgent.tsx"));
const Pdv = lazy(() => import("./pages/admin/Pdv.tsx"));
const PdvDashboard = lazy(() => import("./pages/admin/PdvDashboard.tsx"));
const AdminMetaAds = lazy(() => import("./pages/admin/AdminMetaAds.tsx"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: "always",
      refetchOnReconnect: "always",
    },
  },
});

function RouteFallback() {
  return (
    <div className="container py-16">
      <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-56 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function AdminEntry() {
  const { isAdmin, isSeller, loading } = useAuth();
  if (loading) return <div className="p-10 text-center">Carregando...</div>;
  if (isSeller && !isAdmin) return <Navigate to="/admin/vendedor" replace />;
  return <AdminHome />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <MetaPixelProvider />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/categoria/:slug" element={<Category />} />
            <Route path="/categoria/:slug/:sub" element={<Category />} />
            <Route path="/departamento/:slug" element={<Department />} />
            <Route path="/produto/:slug" element={<Product />} />
            <Route path="/campanha/:slug" element={<Campaign />} />
            <Route path="/ofertas" element={<Collection slug="ofertas-da-semana" />} />
            <Route path="/melhores-ofertas" element={<Collection slug="melhores-ofertas" />} />
            <Route path="/medicamentos-populares" element={<Collection slug="medicamentos-populares" />} />
            <Route path="/mais-vendidos" element={<Collection slug="mais-vendidos" />} />
            <Route path="/novidades" element={<Collection slug="novidades" />} />
            <Route path="/preco-reduzido" element={<Collection slug="preco-reduzido" />} />
            <Route path="/genericos-em-oferta" element={<Collection slug="genericos-em-oferta" />} />
            <Route path="/colecao/:slug" element={<Collection />} />
            <Route path="/carrinho" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/pedido/pix/:orderId" element={<PixPayment />} />
            <Route path="/pedido/sucesso" element={<OrderReturn status="success" />} />
            <Route path="/pedido/pendente" element={<OrderReturn status="pending" />} />
            <Route path="/pedido/falha" element={<OrderReturn status="failure" />} />
            <Route path="/enviar-receita" element={<SendPrescription />} />
            <Route path="/buscar" element={<Search />} />
            <Route path="/departamentos" element={<Departamentos />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/minha-conta" element={<Account />} />
            <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
            <Route path="/termos-de-uso" element={<Terms />} />
            <Route path="/trocas-e-devolucoes" element={<Returns />} />
            <Route path="/politica-de-reembolso" element={<RefundPolicy />} />
            <Route path="/fale-conosco" element={<Contact />} />
            <Route path="/admin/login" element={<Navigate to="/auth" replace />} />

            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminEntry />} />
              <Route path="bi" element={<AdminDashboard />} />
              <Route path="vendedor" element={<SellerDashboard />} />
              <Route path="erp" element={<AdminPharmacyErp />} />
              <Route path="pdv" element={<Pdv />} />
              <Route path="pdv/indicadores" element={<PdvDashboard />} />
              <Route path="produtos" element={<AdminProducts />} />
              <Route path="produtos/importar" element={<AdminProductsImport />} />
              <Route path="produtos/reconciliar" element={<AdminProductsReconcile />} />
              <Route path="estoque" element={<AdminStock />} />
              <Route path="clientes" element={<AdminCustomers />} />
              <Route path="vendedores" element={<AdminSellers />} />
              <Route path="categorias" element={<AdminCategories />} />
              <Route path="taxonomia" element={<AdminTaxonomy />} />
              <Route path="banners" element={<AdminBanners />} />
              <Route path="banners/gerador" element={<AdminBannerGenerator />} />
              <Route path="promo-banner" element={<AdminPromoBanner />} />
              <Route path="mosaico" element={<AdminMosaic />} />
              <Route path="layout-home" element={<AdminHomeLayout />} />
              <Route path="vitrines" element={<AdminHomeShelves />} />
              <Route path="campanhas" element={<AdminCampaigns />} />
              <Route path="ofertas" element={<AdminOffers />} />
              <Route path="monitor-precos" element={<AdminPriceMonitor />} />
              <Route path="pedidos" element={<AdminOrders />} />
              <Route path="pagamentos" element={<AdminPayments />} />
              <Route path="receitas" element={<AdminPrescriptions />} />
              <Route path="config" element={<AdminSettings />} />
              <Route path="integrations/meta-ads" element={<AdminMetaAds />} />
              <Route path="diagnostico-home" element={<AdminHomeDiagnostics />} />
              <Route path="menus" element={<AdminMenus />} />
              <Route path="qualidade-dados" element={<AdminDataQuality />} />
              <Route path="auditoria" element={<AdminAudit />} />
              <Route path="arquivar-produtos" element={<AdminArchiveProducts />} />
              <Route path="integrations/trier" element={<AdminTrier />} />
              <Route path="integrations/trier/:sub" element={<AdminTrier />} />
              <Route path="trier/vendas-ecommerce" element={<AdminTrierEcommerceSales />} />
              <Route path="integrations/whatsapp-agent" element={<AdminWhatsAppAgent />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;