import { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { WhatsAppFab } from "./WhatsAppFab";
import { ProductQuickView } from "./ProductQuickView";
import { GenericSuggestionDialog } from "./GenericSuggestionDialog";
import { PixCartReconciler } from "./PixCartReconciler";
import { PrescriptionCustomerNotifier } from "./PrescriptionCustomerNotifier";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="storefront min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <Footer />
      <WhatsAppFab />
      <ProductQuickView />
      <GenericSuggestionDialog />
      <PixCartReconciler />
      <PrescriptionCustomerNotifier />
    </div>
  );
}

