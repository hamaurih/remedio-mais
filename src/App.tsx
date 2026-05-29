import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Category from "./pages/Category.tsx";
import Product from "./pages/Product.tsx";
import Cart from "./pages/Cart.tsx";
import SendPrescription from "./pages/SendPrescription.tsx";
import Search from "./pages/Search.tsx";
import Departamentos from "./pages/Departamentos.tsx";
import Auth from "./pages/Auth.tsx";
import AdminLayout from "./pages/admin/AdminLayout.tsx";
import AdminDashboard from "./pages/admin/AdminDashboard.tsx";
import AdminProducts from "./pages/admin/AdminProducts.tsx";
import AdminCategories from "./pages/admin/AdminCategories.tsx";
import AdminBanners from "./pages/admin/AdminBanners.tsx";
import AdminOrders from "./pages/admin/AdminOrders.tsx";
import AdminPrescriptions from "./pages/admin/AdminPrescriptions.tsx";
import AdminSettings from "./pages/admin/AdminSettings.tsx";
import AdminOffers from "./pages/admin/AdminOffers.tsx";
import AdminTrier from "./pages/admin/AdminTrier.tsx";
import AdminBannerGenerator from "./pages/admin/AdminBannerGenerator.tsx";
import AdminPromoBanner from "./pages/admin/AdminPromoBanner.tsx";
import AdminMosaic from "./pages/admin/AdminMosaic.tsx";
import AdminCampaigns from "./pages/admin/AdminCampaigns.tsx";
import Campaign from "./pages/Campaign.tsx";




const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Storefront should pick up admin changes quickly without manual refresh
      staleTime: 30_000,
      refetchOnWindowFocus: "always",
      refetchOnReconnect: "always",
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/categoria/:slug" element={<Category />} />
          <Route path="/produto/:slug" element={<Product />} />
          <Route path="/carrinho" element={<Cart />} />
          <Route path="/enviar-receita" element={<SendPrescription />} />
          <Route path="/buscar" element={<Search />} />
          <Route path="/departamentos" element={<Departamentos />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin/login" element={<Navigate to="/auth" replace />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="produtos" element={<AdminProducts />} />
            <Route path="categorias" element={<AdminCategories />} />
            <Route path="banners" element={<AdminBanners />} />
            <Route path="banners/gerador" element={<AdminBannerGenerator />} />
            <Route path="promo-banner" element={<AdminPromoBanner />} />
            <Route path="mosaico" element={<AdminMosaic />} />
            <Route path="campanhas" element={<AdminCampaigns />} />
            <Route path="ofertas" element={<AdminOffers />} />
            <Route path="pedidos" element={<AdminOrders />} />
            <Route path="receitas" element={<AdminPrescriptions />} />
            <Route path="config" element={<AdminSettings />} />
            <Route path="integrations/trier" element={<AdminTrier />} />
            <Route path="integrations/trier/:sub" element={<AdminTrier />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
