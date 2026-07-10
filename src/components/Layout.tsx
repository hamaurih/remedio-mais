import { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { WhatsAppFab } from "./WhatsAppFab";
import { ProductQuickView } from "./ProductQuickView";
import { PromoBanner } from "./PromoBanner";
import { PromoTicker } from "./PromoTicker";
import { GenericSuggestionDialog } from "./GenericSuggestionDialog";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <PromoTicker />
      <Header />
      <PromoBanner />
      <main className="flex-1">{children}</main>
      <Footer />
      <WhatsAppFab />
      <ProductQuickView />
      <GenericSuggestionDialog />
    </div>
  );
}
