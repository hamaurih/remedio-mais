import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Suspense, lazy, type ComponentType } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MetaPixelProvider } from "@/components/MetaPixelProvider";
import { useAuth } from "@/hooks/useAuth";

const lazyWithRetry = <T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) =>
  lazy(async () => {
    try {
      const module = await factory();
      if (module?.default) return module;
      throw new Error("Módulo de rota carregado sem exportação default");
    } catch (error) {
      const key = "route_chunk_retry";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, String(Date.now()));
        const url = new URL(window.location.href);
        url.searchParams.set("_route_retry", String(Date.now()));
        window.location.replace(url.toString());
      }
      throw error;
    }
  });

const Index = lazyWithRetry(() => import("./pages/Index.tsx"));
const Category = lazyWithRetry(() => import("./pages/Category.tsx"));
const Product = lazyWithRetry(() => import("./pages/Product.tsx"));
const Collection = lazyWithRetry(() => import("./pages/Collection.tsx"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound.tsx"));
const Cart = lazyWithRetry(() => import("./pages/Cart.tsx"));
const Checkout = lazyWithRetry(() => import("./pages/Checkout.tsx"));
const PixPayment = lazyWithRetry(() => import("./pages/PixPayment.tsx"));
const OrderReturn = lazyWithRetry(() => import("./pages/OrderReturn.tsx"));
const SendPrescription = lazyWithRetry(() => import("./pages/SendPrescription.tsx"));
const Search = lazyWithRetry(() => import("./pages/Search.tsx"));
const Departamentos = lazyWithRetry(() => import("./pages/Departamentos.tsx"));
const Department = lazyWithRetry(() => import("./pages/Department.tsx"));
const Campaign = lazyWithRetry(() => import("./pages/Campaign.tsx"));
const Auth = lazyWithRetry(() => import("./pages/Auth.tsx"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword.tsx"));
const Account = lazyWithRetry(() => import("./pages/Account.tsx"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/PrivacyPolicy.tsx"));
const Terms = lazyWithRetry(() => import("./pages/Terms.tsx"));
const Returns = lazyWithRetry(() => import("./pages/Returns.tsx"));
const RefundPolicy = lazyWithRetry(() => import("./pages/RefundPolicy.tsx"));
const Contact = lazyWithRetry(() => import("./pages/Contact.tsx"));

const AdminLayout = lazyWithRetry(() => import("./pages/admin/AdminLayout.tsx"));
const AdminHome = lazyWithRetry(() => import("./pages/admin/AdminHome.tsx"));
const AdminDashboard = lazyWithRetry(() => import("./pages/admin/AdminDashboard.tsx"));
const AdminCurveABC = lazyWithRetry(() => import("./pages/admin/AdminCurveABC.tsx"));
const AdminSiteHub = lazyWithRetry(() => import("./pages/admin/AdminSiteHub.tsx"));
const SellerDashboard = lazyWithRetry(() => import("./pages/admin/SellerDashboard.tsx"));
const AdminUnits = lazyWithRetry(() => import("./pages/admin/AdminUnits.tsx"));
const AdminBranchNew = lazyWithRetry(() => import("./pages/admin/AdminBranchNew.tsx"));
const AdminBranchCompliance = lazyWithRetry(() => import("./pages/admin/AdminBranchCompliance.tsx"));
const AdminProducts = lazyWithRetry(() => import("./pages/admin/AdminProducts.tsx"));
const AdminProductsCanary = lazyWithRetry(() => import("./pages/admin/products/AdminProductsCanary.tsx"));
const AdminProductEditorCanary = lazyWithRetry(() => import("./pages/admin/products/AdminProductEditorCanary.tsx"));
const AdminProductsImport = lazyWithRetry(() => import("./pages/admin/AdminProductsImport.tsx"));
const AdminProductsReconcile = lazyWithRetry(() => import("./pages/admin/AdminProductsReconcile.tsx"));
const AdminStock = lazyWithRetry(() => import("./pages/admin/AdminStock.tsx"));
const AdminSmartPurchasing = lazyWithRetry(() => import("./pages/admin/AdminSmartPurchasing.tsx"));
const AdminCustomers = lazyWithRetry(() => import("./pages/admin/AdminCustomers.tsx"));
const AdminRegistrations = lazyWithRetry(() => import("./pages/admin/AdminRegistrations.tsx"));
const AdminSellers = lazyWithRetry(() => import("./pages/admin/AdminSellers.tsx"));
const AdminCategories = lazyWithRetry(() => import("./pages/admin/AdminCategories.tsx"));
const AdminTaxonomy = lazyWithRetry(() => import("./pages/admin/AdminTaxonomy.tsx"));
const AdminBanners = lazyWithRetry(() => import("./pages/admin/AdminBanners.tsx"));
const AdminBannerGenerator = lazyWithRetry(() => import("./pages/admin/AdminBannerGenerator.tsx"));
const AdminPromoBanner = lazyWithRetry(() => import("./pages/admin/AdminPromoBanner.tsx"));
const AdminMosaic = lazyWithRetry(() => import("./pages/admin/AdminMosaic.tsx"));
const AdminHomeLayout = lazyWithRetry(() => import("./pages/admin/AdminHomeLayout.tsx"));
const AdminHomeShelves = lazyWithRetry(() => import("./pages/admin/AdminHomeShelves.tsx"));
const AdminCampaigns = lazyWithRetry(() => import("./pages/admin/AdminCampaigns.tsx"));
const AdminOffers = lazyWithRetry(() => import("./pages/admin/AdminOffers.tsx"));
const AdminPriceMonitor = lazyWithRetry(() => import("./pages/admin/AdminPriceMonitor.tsx"));
const AdminOrders = lazyWithRetry(() => import("./pages/admin/AdminOrders.tsx"));
const AdminAISales = lazyWithRetry(() => import("./pages/admin/AdminAISales.tsx"));
const AdminPayments = lazyWithRetry(() => import("./pages/admin/AdminPayments.tsx"));
const AdminPrescriptions = lazyWithRetry(() => import("./pages/admin/AdminPrescriptions.tsx"));
const AdminSettings = lazyWithRetry(() => import("./pages/admin/AdminSettings.tsx"));
const AdminBackups = lazyWithRetry(() => import("./pages/admin/AdminBackups.tsx"));
const AdminHomeDiagnostics = lazyWithRetry(() => import("./pages/admin/AdminHomeDiagnostics.tsx"));
const AdminMenus = lazyWithRetry(() => import("./pages/admin/AdminMenus.tsx"));
const AdminDataQuality = lazyWithRetry(() => import("./pages/admin/AdminDataQuality.tsx"));
const AdminAudit = lazyWithRetry(() => import("./pages/admin/AdminAudit.tsx"));
const AdminArchiveProducts = lazyWithRetry(() => import("./pages/admin/AdminArchiveProducts.tsx"));
const AdminTrier = lazyWithRetry(() => import("./pages/admin/AdminTrier.tsx"));
const AdminTrierEcommerceSales = lazyWithRetry(() => import("./pages/admin/AdminTrierEcommerceSales.tsx"));
const AdminWhatsAppAgent = lazyWithRetry(() => import("./pages/admin/AdminWhatsAppAgent.tsx"));
const Pdv = lazyWithRetry(() => import("./pages/admin/Pdv.tsx"));
const PdvDashboard = lazyWithRetry(() => import("./pages/admin/PdvDashboard.tsx"));
const AdminMetaAds = lazyWithRetry(() => import("./pages/admin/AdminMetaAds.tsx"));

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 10 * 60_000, retry: 1, refetchOnWindowFocus: "always", refetchOnReconnect: "always" } } });

function RouteFallback() {
  return <div className="container py-16"><div className="h-8 w-48 bg-muted rounded animate-pulse" /><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-56 bg-muted rounded-xl animate-pulse" />)}</div></div>;
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
      <Toaster /><Sonner />
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
            <Route path="/redefinir-senha" element={<ResetPassword />} />
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
              <Route path="curva-abc" element={<AdminCurveABC />} />
              <Route path="site" element={<AdminSiteHub />} />
              <Route path="vendedor" element={<SellerDashboard />} />
              <Route path="unidades" element={<AdminUnits />} />
              <Route path="unidades/nova" element={<AdminBranchNew />} />
              <Route path="unidades/:storeId/regularizacao" element={<AdminBranchCompliance />} />
              <Route path="pdv" element={<Pdv />} />
              <Route path="pdv/indicadores" element={<PdvDashboard />} />
              <Route path="produtos" element={<AdminProducts />} />
              <Route path="produtos-v2" element={<AdminProductsCanary />} />
              <Route path="produtos-editor-v2" element={<AdminProductEditorCanary />} />
              <Route path="produtos/importar" element={<AdminProductsImport />} />
              <Route path="produtos/reconciliar" element={<AdminProductsReconcile />} />
              <Route path="estoque" element={<AdminStock />} />
              <Route path="compras" element={<AdminSmartPurchasing />} />
              <Route path="clientes" element={<AdminCustomers />} />
              <Route path="cadastros" element={<AdminRegistrations />} />
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
              <Route path="ia-vendas" element={<AdminAISales />} />
              <Route path="pagamentos" element={<AdminPayments />} />
              <Route path="receitas" element={<AdminPrescriptions />} />
              <Route path="config" element={<AdminSettings />} />
              <Route path="backups" element={<AdminBackups />} />
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
