import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, FolderOpen, X } from "lucide-react";
import { useAlphaIntegration } from "../AlphaIntegrationContext";
import { matchingProjectProducts } from "../lib/mercatoPdf";

export function ProjectProductSuggestions({ description }: { description: string }) {
  const integration = useAlphaIntegration();
  const [open, setOpen] = useState(true);
  const matches = useMemo(() => matchingProjectProducts(description, integration.projects), [description, integration.projects]);
  const selected = integration.projects.find((project) => project.id === integration.selectedProjectProductId);
  useEffect(() => { setOpen(true); }, [description]);

  if (!matches.length && !selected) return null;
  return (
    <div className="col-span-full rounded-xl border border-[#e3d8f0] bg-[#faf7ff] p-3">
      {!!matches.length && (
        <>
          <button type="button" className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-[#553976]" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span className="flex items-center gap-2"><FolderOpen size={15} /> Produtos encontrados no Projeto ({matches.length})</span>
            <ChevronDown size={15} className={open ? "rotate-180" : ""} />
          </button>
          {open && (
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto" aria-label="Escolher produto do Projeto que receberá os PDFs">
              {matches.map((project) => (
                <button key={project.id} type="button" className="flex w-full items-center gap-3 rounded-lg border border-[#eee7f4] bg-white px-3 py-2 text-left text-sm hover:bg-[#f2eafb]" onClick={() => { integration.selectProjectProduct(project.id); setOpen(false); }} aria-pressed={project.id === selected?.id}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${project.id === selected?.id ? "border-[#553976] bg-[#553976] text-white" : "border-[#bba8d0]"}`}>{project.id === selected?.id && <Check size={12} />}</span>
                  <span className="flex-1">{project.name}</span>
                  <span className="text-xs text-[#7d7287]">Anexar PDFs aqui</span>
                </button>
              ))}
              <p className="pt-1 text-xs text-[#7d7287]">A lista mostra somente nomes que correspondem ao que você digitou. Marcar o destino não muda o produto, o kit nem o SKU.</p>
            </div>
          )}
        </>
      )}
      {selected && (
        <div className={`${matches.length ? "mt-2 border-t border-[#e3d8f0] pt-2" : ""} flex items-center justify-between gap-2 text-xs text-[#553976]`}>
          <span><strong>Destino dos PDFs:</strong> {selected.name} · Documentos & Fotos</span>
          <button type="button" onClick={() => integration.selectProjectProduct(null)} aria-label="Desmarcar produto do Projeto" className="flex items-center gap-1"><X size={13} /> Desmarcar</button>
        </div>
      )}
    </div>
  );
}
