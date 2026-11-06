import { createContext, useContext } from "react";
import type { ProductReportRecord } from "@shared/alpha/decisionReport";
import type { ProductPdfPrintMode } from "./lib/productPdf";

export type AlphaPdfOptions = {
  scope: "selected" | "compact" | "complete";
  printMode: ProductPdfPrintMode;
  includeProductSheet: boolean;
  compactMargins?: number[];
};
export type AlphaPdfDestination = {
  ownerId: number;
  projectProductId: number | null;
  label: string;
};
export type GeneratedAlphaPdf = {
  exportId: string;
  bytes: Uint8Array;
  filename: string;
  record: ProductReportRecord;
  options: AlphaPdfOptions;
  destination: AlphaPdfDestination;
};
export type AlphaIntegration = {
  freezeDestination: () => AlphaPdfDestination;
  persistPdf: (input: GeneratedAlphaPdf) => Promise<{ url: string; documentId: number | null; alreadyExists: boolean }>;
  projects: readonly { id: number; name: string }[];
  selectedProjectProductId: number | null;
  selectProjectProduct: (id: number | null) => void;
};

export const AlphaIntegrationContext = createContext<AlphaIntegration | null>(null);

export function useAlphaIntegration() {
  const value = useContext(AlphaIntegrationContext);
  if (!value) throw new Error("A Calculadora Final precisa estar aberta dentro do Mercato para salvar seus PDFs.");
  return value;
}
