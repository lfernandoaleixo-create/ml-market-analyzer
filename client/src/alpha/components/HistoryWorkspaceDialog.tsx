import type { ReactNode } from "react";
import { Modal, Segment } from "./PricingFields";
import {
  ProductLibraryDialog,
  type ProductLibraryDialogProps,
} from "./ProductLibraryDialog";

export interface HistoryWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  section: "products" | "simulations";
  onSectionChange: (section: "products" | "simulations") => void;
  catalogProps: ProductLibraryDialogProps;
  children: ReactNode;
}

export function HistoryWorkspaceDialog({
  open,
  onClose,
  section,
  onSectionChange,
  catalogProps,
  children,
}: HistoryWorkspaceDialogProps) {
  if (!open) return null;

  return (
    <Modal title="Histórico da calculadora" onClose={onClose}>
      <div className="space-y-4">
        <Segment
          label="Seção do histórico"
          value={section}
          onChange={value =>
            onSectionChange(value as "products" | "simulations")
          }
          options={[
            { value: "products", label: "Meus produtos" },
            { value: "simulations", label: "Simulações" },
          ]}
        />
        {section === "products" ? (
          <ProductLibraryDialog {...catalogProps} embedded />
        ) : (
          children
        )}
      </div>
    </Modal>
  );
}

export default HistoryWorkspaceDialog;
