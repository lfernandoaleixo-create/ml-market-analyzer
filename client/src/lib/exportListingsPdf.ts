import type { ListingRow } from "@shared/account";
import {
  buildListingsReportHtml,
  type ExportPdfOpts,
} from "@shared/listingsReport";

export { buildListingsReportHtml };
export type { ExportPdfOpts };

/**
 * Gera um relatório imprimível (HTML) com a lista de anúncios filtrada/ordenada
 * e abre a janela de impressão do navegador, onde o usuário escolhe
 * "Salvar como PDF". A montagem do HTML vive em `@shared/listingsReport`
 * (função pura, testável); aqui ficam apenas os efeitos de DOM.
 */
export function exportListingsPdf(items: ListingRow[], opts: ExportPdfOpts = {}) {
  const html = buildListingsReportHtml(items, opts);

  const win = window.open("", "_blank");
  if (!win) {
    // Pop-up bloqueado: avisa o chamador para exibir um toast.
    throw new Error("popup-blocked");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Espera a logo carregar antes de chamar a impressão, para que ela apareça no PDF.
  const triggerPrint = () => {
    win.focus();
    win.print();
  };
  const img = win.document.querySelector("img");
  if (img && !(img as HTMLImageElement).complete) {
    img.addEventListener("load", () => setTimeout(triggerPrint, 150));
    img.addEventListener("error", () => setTimeout(triggerPrint, 150));
    // Fallback caso o evento não dispare.
    setTimeout(triggerPrint, 1200);
  } else {
    setTimeout(triggerPrint, 250);
  }
}
