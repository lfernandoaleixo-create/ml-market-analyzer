import { useRef, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { useAlphaIntegration, type GeneratedAlphaPdf } from "../AlphaIntegrationContext";
import { alphaPdfAttemptSignature, alphaPdfFilename } from "../lib/mercatoPdf";
import {
  DEFAULT_MATRIX_MARGINS,
  generateScenarioMatrix,
  getScenarioMatrixCount,
  type ProductReportRecord,
  type ScenarioMatrixResult,
} from "@shared/alpha/decisionReport";
import {
  ALPHA_COMPACT_MARGINS,
  alphaProfileInput,
  alphaScenarioOptions,
} from "@shared/alpha/alphaProfile";
import {
  generateProductPdf,
  productPdfBlob,
  productReportMatrixCsv,
  type ProductPdfPrintMode,
} from "@/alpha/lib/productPdf";
import { Modal } from "./PricingFields";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export function ProductPdfDialog({
  record,
  onClose,
}: {
  record: ProductReportRecord;
  onClose: () => void;
}) {
  const integration = useAlphaIntegration();
  const pendingPdf = useRef<(GeneratedAlphaPdf & { signature: string }) | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [printMode, setPrintMode] = useState<ProductPdfPrintMode>("duplex");
  const [scope, setScope] = useState<"selected" | "complete" | "compact">(
    "compact"
  );
  const [includeProductSheet, setIncludeProductSheet] = useState(false);
  const [compactPresetMargins, setCompactPresetMargins] = useState<number[]>(
    () => [...ALPHA_COMPACT_MARGINS]
  );
  const [customMarginEnabled, setCustomMarginEnabled] = useState(false);
  const [customMarginDraft, setCustomMarginDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [matrixCache, setMatrixCache] = useState<{
    key: string;
    rows: ScenarioMatrixResult[];
  } | null>(null);
  const [error, setError] = useState("");
  const parsedCustomMargin = Number(customMarginDraft.replace(",", "."));
  const customMarginValid =
    customMarginEnabled &&
    customMarginDraft.trim() !== "" &&
    Number.isFinite(parsedCustomMargin) &&
    parsedCustomMargin > 0 &&
    parsedCustomMargin <= 100;
  const customMarginIsPreset =
    customMarginValid &&
    DEFAULT_MATRIX_MARGINS.includes(parsedCustomMargin as never);
  const compactMargins = [
    ...new Set(
      compactPresetMargins.concat(
        customMarginValid && !customMarginIsPreset ? [parsedCustomMargin] : []
      )
    ),
  ].sort((left, right) => left - right);
  const alphaInput = alphaProfileInput(record.input);
  const completeScenarioCount = getScenarioMatrixCount(
    alphaInput,
    alphaScenarioOptions(DEFAULT_MATRIX_MARGINS)
  );
  const scenarioCount =
    scope === "compact"
      ? compactMargins.length * 32
      : scope === "selected"
        ? 20
        : completeScenarioCount;
  const matrixKey = `alpha|${JSON.stringify(alphaInput)}|${scope}|${(scope === "compact" ? compactMargins : DEFAULT_MATRIX_MARGINS).join(",")}`;
  const matrix = matrixCache?.key === matrixKey ? matrixCache.rows : null;
  const compactSelectionComplete = compactMargins.length === 4;
  const sku =
    record.input.productType === "kit"
      ? record.input.kitSku
      : record.input.productSku;
  const filePrefix = `Alpha-${(sku || record.input.description || "produto").replace(/[^a-zA-Z0-9À-ÿ_-]/g, "-").slice(0, 60)}-${record.id.slice(0, 8)}`;

  async function exportPdf() {
    setBusy(true);
    setError("");
    setSavedMessage("");
    setProgress(0);
    try {
      // Freeze the destination before the matrix's asynchronous generation.
      // A historical PDF is never linked by inference to the currently open catalog record.
      const destination = integration.freezeDestination();
      const options = { printMode, scope, includeProductSheet, ...(scope === "compact" ? { compactMargins } : {}) };
      const signature = alphaPdfAttemptSignature(record, destination, options);
      if (scope === "compact" && !compactSelectionComplete) {
        throw new Error(
          "Selecione exatamente quatro metas de margem para o fluxo compacto."
        );
      }
      if (scope === "compact" && customMarginEnabled && customMarginIsPreset) {
        throw new Error(
          "A meta personalizada precisa ser diferente dos presets 10, 15, 20, 25 e 30."
        );
      }
      let exportInput = pendingPdf.current?.signature === signature ? pendingPdf.current : null;
      if (!exportInput) {
        let rows = matrix;
        if ((scope === "complete" || scope === "compact") && !rows) {
          const margins =
            scope === "compact" ? compactMargins : [...DEFAULT_MATRIX_MARGINS];
          rows = await generateScenarioMatrix(
            alphaInput,
            (complete, total) =>
              setProgress(Math.round((complete / total) * 100)),
            {
              ...alphaScenarioOptions(margins),
              yieldEvery: 12,
            }
          );
          setMatrixCache({ key: matrixKey, rows });
        }
        const bytes = generateProductPdf(record, {
          printMode,
          scope,
          profile: "alpha",
          includeProductSheet,
          ...((scope === "complete" || scope === "compact") && rows
            ? { matrix: rows }
            : {}),
          ...(scope === "compact" ? { compactMargins } : {}),
        });
        const exportId = crypto.randomUUID();
        exportInput = {
          exportId, signature, bytes, record, options, destination,
          filename: alphaPdfFilename({ name: `${record.input.description || "Produto"}${sku ? `-${sku}` : ""}`, scope, exportId, createdAt: new Date(), includeProductSheet }),
        };
        pendingPdf.current = exportInput;
      }
      setProgress(100);
      await integration.persistPdf(exportInput);
      setSavedMessage(`PDF salvo no Mercato. Destino: ${exportInput.destination.label}.`);
      saveBlob(productPdfBlob(exportInput.bytes), exportInput.filename);
      pendingPdf.current = null;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível gerar a ficha. Tente novamente."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Ficha e fluxogramas em PDF"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="rounded-xl bg-[#f5f0fb] p-4">
        <strong className="block text-[#553976]">
          {record.input.description || "Produto sem descrição"}
        </strong>
        <span className="mt-1 block text-xs text-[#7d7287]">
          {sku ? `SKU ${sku} · ` : ""}Registro {record.id.slice(0, 8)} ·{" "}
          {record.input.calculationType === "real"
            ? "Cálculo Real"
            : "Cálculo Estimado"}
        </span>
      </div>
      <p className="mt-3 text-xs text-[#553976]">O PDF será salvo automaticamente no Mercato antes do download. Se o envio falhar, tente novamente sem fechar este diálogo.</p>
      <p className="mt-2 text-xs text-[#553976]">
        <strong>Destino:</strong>{" "}
        {integration.selectedProjectProductId !== null
          ? `Central da Calculadora Final + Documentos & Fotos de ${integration.projects.find(project => project.id === integration.selectedProjectProductId)?.name ?? "produto selecionado (aguardando carregamento)"}.`
          : "Somente na central da Calculadora Final. Nenhum produto do Projeto está marcado."}
      </p>
      {savedMessage && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{savedMessage}</p>}
      <label className="field my-4">
        <span className="field-label">Quais caminhos imprimir?</span>
        <select
          value={scope}
          disabled={busy}
          onChange={e =>
            setScope(e.target.value as "selected" | "complete" | "compact")
          }
        >
          <option value="selected">Fluxo das escolhas atuais</option>
          <option value="compact">
            Compacto Alpha — 4 diagramas, 32 caminhos por meta
          </option>
          <option value="complete">
            Todos os {completeScenarioCount} caminhos — PDF paginado
          </option>
        </select>
      </label>
      {scope === "compact" && (
        <fieldset className="my-4 rounded-xl border border-[#e7dfed] p-4">
          <legend className="px-1 text-sm font-semibold text-[#553976]">
            Escolha exatamente 4 metas para os diagramas
          </legend>
          <p className="mb-3 text-xs leading-5 text-[#7d7287]">
            10%, 15%, 20% e 25% já estão selecionadas. Cada meta vira um fluxo
            de meia página; 4 metas produzem 128 caminhos Alpha em 2 páginas A4.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {DEFAULT_MATRIX_MARGINS.map(margin => {
              const checked = compactPresetMargins.includes(margin);
              const disabled =
                busy ||
                (!checked &&
                  compactMargins.length >= 4 &&
                  !customMarginIsPreset);
              return (
                <label
                  key={margin}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-sm ${checked ? "border-[#78569d] bg-[#faf7fd]" : "border-[#e7dfed]"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={event =>
                      setCompactPresetMargins(current =>
                        event.target.checked
                          ? [...current, margin]
                          : current.filter(value => value !== margin)
                      )
                    }
                  />
                  {margin}%
                </label>
              );
            })}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-[#553976]">
            <input
              type="checkbox"
              checked={customMarginEnabled}
              disabled={busy}
              onChange={event => setCustomMarginEnabled(event.target.checked)}
            />
            Adicionar meta personalizada fora dos presets
          </label>
          {customMarginEnabled && (
            <input
              className="mt-2 w-full rounded-lg border border-[#d8cce2] px-3 py-2 text-sm"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              value={customMarginDraft}
              disabled={busy}
              placeholder="Ex.: 17,5"
              aria-label="Meta de margem personalizada"
              onChange={event => setCustomMarginDraft(event.target.value)}
            />
          )}
          <p className="mt-2 text-xs text-[#7d7287]">
            Selecionadas: {compactMargins.length}/4
            {customMarginIsPreset &&
              " · a personalizada coincide com um preset e não será adicionada"}
          </p>
        </fieldset>
      )}
      <label className="my-3 flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={includeProductSheet}
          disabled={busy}
          onChange={event => setIncludeProductSheet(event.target.checked)}
        />
        Incluir ficha do produto com custos e tributos
      </label>
      <p className="text-xs text-[#7d7287]">
        Sem a ficha, o PDF contém somente nós, setas e resultados. O fluxo
        completo é dividido por logística, publicidade e destino, sem cortar
        caminhos.
      </p>
      <div className="my-4 grid gap-3 sm:grid-cols-2">
        {(
          [
            {
              value: "duplex",
              title: "Frente e verso",
              description: "Imprimir nos dois lados",
            },
            {
              value: "twoSheets",
              title: "Uma página por folha",
              description: "Impressão em um lado",
            },
          ] as const
        ).map(option => (
          <label
            key={option.value}
            className={`flex cursor-pointer gap-3 rounded-xl border-2 p-4 ${printMode === option.value ? "border-[#78569d] bg-[#faf7fd]" : "border-[#e7dfed]"}`}
          >
            <input
              type="radio"
              name="pdf-print-mode"
              value={option.value}
              checked={printMode === option.value}
              disabled={busy}
              onChange={() => setPrintMode(option.value)}
              className="accent-[#69448f]"
            />
            <span>
              <strong className="block text-sm text-[#523c6c]">
                {option.title}
              </strong>
              <small className="text-[#8a8094]">{option.description}</small>
            </span>
          </label>
        ))}
      </div>
      <p className="!text-xs !leading-6">
        {scope === "complete"
          ? `Os ${scenarioCount} caminhos usam o perfil Alpha fixo (Verde · Agência), com as cinco metas 10/15/20/25/30 e páginas dimensionadas pela matriz${includeProductSheet ? ", além da ficha" : ""}.`
          : scope === "compact"
            ? `Cada um dos ${compactMargins.length || 0} fluxos escolhidos ocupa meia página, com publicidade R$2/R$4/R$6/R$8, dois destinos, Clássico/Premium e Sem frete grátis/Com frete grátis. ${compactSelectionComplete ? "A matriz terá 128 caminhos." : "Escolha quatro metas para habilitar a geração."}`
            : `${includeProductSheet ? "A ficha vem primeiro; depois, o " : "O "}fluxograma das escolhas atuais ocupa uma página com os terminais de margem. Para outras combinações, use o explorador interativo ou escolha todos os caminhos.`}{" "}
        {includeProductSheet && "KITs extensos podem ter anexo de composição. "}
        Ative frente e verso no leitor de PDF ou na impressora, se desejado.
      </p>
      {error && (
        <div role="alert" className="callout error">
          {error}
        </div>
      )}
      <button
        type="button"
        disabled={busy || (scope === "compact" && !compactSelectionComplete)}
        onClick={exportPdf}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#67458b] px-4 py-3 font-semibold text-white disabled:opacity-60"
        aria-live="polite"
      >
        {busy ? (
          <Loader2 size={17} className="animate-spin" />
        ) : (
          <FileDown size={17} />
        )}
        {busy
          ? `Preparando caminhos… ${progress}%`
          : includeProductSheet
            ? "Gerar ficha e fluxogramas"
            : "Gerar fluxogramas"}
      </button>
      {matrix && (scope === "complete" || scope === "compact") && (
        <button
          type="button"
          className="link-button mx-auto mt-4"
          onClick={() =>
            saveBlob(
              new Blob(["\uFEFF" + productReportMatrixCsv(matrix)], {
                type: "text/csv;charset=utf-8;",
              }),
              `${filePrefix}-cenarios.csv`
            )
          }
        >
          Baixar os {matrix.length} cenários em CSV (opcional)
        </button>
      )}
    </Modal>
  );
}
