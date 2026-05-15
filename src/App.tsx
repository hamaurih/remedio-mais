import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
import Auth from "./pages/Auth.tsx";
import AdminLayout from "./pages/admin/AdminLayout.tsx";
import AdminDashboard from "./pages/admin/AdminDashboard.tsx";
import AdminProducts from "./pages/admin/AdminProducts.tsx";
import AdminCategories from "./pages/admin/AdminCategories.tsx";
import AdminBanners from "./pages/admin/AdminBanners.tsx";
import AdminOrders from "./pages/admin/AdminOrders.tsx";
import AdminPrescriptions from "./pages/admin/AdminPrescriptions.tsx";
import AdminSettings from "./pages/admin/AdminSettings.tsx";

const queryClient = new QueryClient();

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
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="produtos" element={<AdminProducts />} />
            <Route path="categorias" element={<AdminCategories />} />
            <Route path="banners" element={<AdminBanners />} />
            <Route path="pedidos" element={<AdminOrders />} />
            <Route path="receitas" element={<AdminPrescriptions />} />
            <Route path="config" element={<AdminSettings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
