import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Calculator,
  Check,
  CircleHelp,
  History,
  FolderOpen,
  Save,
  Info,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import {
  calculate,
  defaultInput,
  getCommissionRate,
  getDifalCost,
  getStateTaxRates,
  solveTarget,
  type PricingInput,
} from "@shared/alpha/pricing";
import {
  applyCompanyTax,
  getFederalTaxRates,
  resetCompanyTax,
} from "@shared/alpha/companyProfile";
import { VideoExamples } from "@/alpha/components/VideoExamples";
import { ProjectProductSuggestions } from "@/alpha/components/ProjectProductSuggestions";
import { FreeShippingSwitch } from "@/alpha/components/FreeShippingSwitch";
import {
  evaluateFreeShippingControl,
  optionalShippingMode,
} from "@shared/alpha/freeShippingControl";
import { AlphaProfileFields } from "@/alpha/components/AlphaProfileFields";
import { alphaProfileInput } from "@shared/alpha/alphaProfile";
import { AdvertisingSelect } from "@/alpha/components/AdvertisingSelect";
import { StateTaxFields } from "@/alpha/components/StateTaxFields";
import { ListingChoices } from "@/alpha/components/ListingChoices";
import {
  canShowVerifiedCategory,
  isCategoryResponseCurrent,
  isSingleOfficialCategoryResult,
  shouldInvalidateSuggestedCategory,
  singleCategoryLabel,
} from "@shared/alpha/categorySelection";
import { JewelryComparison } from "@/alpha/components/JewelryComparison";
import { MarginPriceControl } from "@/alpha/components/MarginPriceControl";
import { resolvePricingFlow } from "@shared/alpha/pricingFlow";
import { getPackagingPreset } from "@shared/alpha/packagingCatalog";
import {
  applyPackagingSelection,
  normalizePackagingDimensions,
} from "@shared/alpha/packagingSelection";
import { PackagingSuggestions } from "@/alpha/components/PackagingSuggestions";
import { CalculatedCostsPreview } from "@/alpha/components/CalculatedCostsPreview";
import { WeightInput } from "@/alpha/components/WeightInput";
import { PackageInputNotice } from "@/alpha/components/PackageInputNotice";
import {
  normalizeWeightEntry,
  selectWeightBand,
  restoreExactWeight,
  setExactWeight,
} from "@shared/alpha/weightSelection";
import {
  normalizeInterfaceInput,
  getInterfaceMigrationNotice,
} from "@shared/alpha/interfaceInput";
import { getProductType } from "@shared/alpha/productIdentification";
import { useProductCatalog } from "@/alpha/hooks/useProductCatalog";
import { HistoryWorkspaceDialog } from "@/alpha/components/HistoryWorkspaceDialog";
import {
  readProductLoginDraft,
  clearProductLoginDraft,
} from "@/alpha/lib/productCatalogResume";
import { restorePricingInput as restoreInput } from "@shared/alpha/restorePricingInput";
import { getAcquisition, hydrateKitComposition } from "@shared/alpha/kitComposition";
import { getStateTaxSettings } from "@shared/alpha/stateTaxSettings";
import { KitItemsEditor } from "@/alpha/components/KitItemsEditor";
import {
  createProductReportRecord,
  type ProductReportRecord,
} from "@shared/alpha/decisionReport";
import { EditableFederalTaxes } from "@/alpha/components/PricingGuidance";
import { money, percent } from "@/alpha/lib/format";
import { trpc } from "@/lib/trpc";
import {
  canPersistBrowserHistory,
  canPersistBrowserHistoryUpdate,
  getBrowserDraftAction,
} from "@shared/alpha/storagePrivacy";
import {
  Modal,
  NumberField,
  Panel,
  Segment,
  SelectField,
} from "@/alpha/components/PricingFields";
import {
  CompareResults,
  MarginResults,
  ResultCard,
  resultLines,
} from "@/alpha/components/PricingResults";

const ProductPdfDialog = lazy(() =>
  import("@/alpha/components/ProductPdfDialog").then(module => ({
    default: module.ProductPdfDialog,
  }))
);
const FlowExplorerDialog = lazy(() =>
  import("@/alpha/components/FlowExplorerDialog").then(module => ({
    default: module.FlowExplorerDialog,
  }))
);

const HISTORY_KEY = "mercato-alpha-history-v1";
const DRAFT_KEY = "mercato-alpha-draft-v1";
const CATEGORY_KEY = "mercato-alpha-category-v1";
const GOAL_KEY = "mercato-alpha-margin-v1";
function loadGoal(): number {
  const resumed = readProductLoginDraft();
  if (resumed) return resumed.goal;
  try {
    const value = JSON.parse(localStorage.getItem(GOAL_KEY) || "null");
    return typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0 &&
      value < 100
      ? value
      : 20;
  } catch {
    return 20;
  }
}
type CategoryAnswer = {
  category: string;
  categoryId: string | null;
  source: string;
  explanation: string;
  confidence: string;
  alternatives: string[];
};
type Snapshot = ReturnType<typeof calculate>;
type Saved = {
  id: string;
  at: string;
  input: PricingInput;
  goal: number;
  mode: "sale" | "target";
  resultPrice: number;
  profit: number;
  snapshot?: Snapshot;
  rawInput?: PricingInput;
  categoryAnswer?: CategoryAnswer | null;
};
function readCategory(value: unknown, category: string): CategoryAnswer | null {
  if (!value || typeof value !== "object") return null;
  const v = value as CategoryAnswer;
  if (
    v.category !== category ||
    !["ai", "mercadolivre"].includes(v.source) ||
    typeof v.explanation !== "string" ||
    typeof v.confidence !== "string" ||
    !Array.isArray(v.alternatives)
  )
    return null;
  return {
    ...v,
    categoryId: typeof v.categoryId === "string" ? v.categoryId : null,
    alternatives: v.alternatives.filter(x => typeof x === "string"),
  };
}
function loadCategory(): CategoryAnswer | null {
  const resumed = readProductLoginDraft();
  if (resumed)
    return readCategory(resumed.categoryAnswer, resumed.input.category);
  try {
    return readCategory(
      JSON.parse(localStorage.getItem(CATEGORY_KEY) || "null"),
      loadDraft().category
    );
  } catch {
    return null;
  }
}
function readSnapshot(value: unknown): Snapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Snapshot;
  if (
    !v.valid ||
    !Array.isArray(v.warnings) ||
    typeof v.shippingLabel !== "string"
  )
    return undefined;
  for (const key of [
    "price",
    "shipping",
    "totalCosts",
    "commission",
    "taxes",
    "profit",
    "margin",
    "productCost",
    "weightUsed",
  ] as const)
    if (!Number.isFinite(v[key])) return undefined;
  return { ...v, warnings: v.warnings.filter(x => typeof x === "string") };
}

function loadDraft() {
  const resumed = readProductLoginDraft();
  if (resumed) return restoreInput(resumed.input, true, true);
  try {
    return restoreInput(JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"));
  } catch {
    return normalizeInterfaceInput({ ...defaultInput });
  }
}
function loadMigrationNotice(): string | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    return raw
      ? getInterfaceMigrationNotice(restoreInput(raw, false), restoreInput(raw))
      : null;
  } catch {
    return null;
  }
}
function loadHistory(): Saved[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        v =>
          v &&
          typeof v.id === "string" &&
          typeof v.at === "string" &&
          Number.isFinite(v.resultPrice) &&
          Number.isFinite(v.profit) &&
          Number.isFinite(v.goal) &&
          (v.mode === "sale" || v.mode === "target")
      )
      .map(v => ({
        ...v,
        input: restoreInput(v.input, false),
        rawInput: v.rawInput ?? structuredClone(v.input),
        snapshot: readSnapshot(v.snapshot),
        categoryAnswer: readCategory(
          v.categoryAnswer,
          restoreInput(v.input, false).category
        ),
      }));
  } catch {
    return [];
  }
}

export default function Home() {
  const [input, setInput] = useState<PricingInput>(loadDraft);
  const [pdfRecord, setPdfRecord] = useState<ProductReportRecord | null>(null);
  const [flowOpen, setFlowOpen] = useState(false);
  const [startupMigration] = useState(loadMigrationNotice);
  const [history, setHistory] = useState<Saved[]>(loadHistory);
  const persistedHistory = useRef(history);
  const [goal, setGoal] = useState(loadGoal);
  const [goals, setGoals] = useState([10, 15, 20, 25, 30]);
  const [customGoal, setCustomGoal] = useState(35);
  const [mode, setMode] = useState<"sale" | "target">(
    () => readProductLoginDraft()?.mode ?? "target"
  );
  const [modal, setModal] = useState<"help" | "history" | "products" | null>(
    null
  );
  const [categoryError, setCategoryError] = useState("");
  const [historyFilter, setHistoryFilter] = useState<
    "estimated" | "real" | "all"
  >("estimated");
  const [feeConfirmed, setFeeConfirmed] = useState(false);
  const [feeConfirmationPrice, setFeeConfirmationPrice] = useState<
    number | null
  >(null);
  const [categoryAnswer, setCategoryAnswer] = useState<CategoryAnswer | null>(
    loadCategory
  );
  const verifiedCategoryResponseRef = useRef<CategoryAnswer | null>(null);
  const categoryIsVerified = canShowVerifiedCategory(
    categoryAnswer,
    input.category,
    verifiedCategoryResponseRef.current
  );
  const categoryDescriptionRef = useRef(input.description);
  categoryDescriptionRef.current = input.description;
  const closeModal = useCallback(() => setModal(null), []);
  const suggestion = trpc.alpha.pricing.suggestCategory.useMutation({
    onSuccess: (data, variables) => {
      if (
        !isCategoryResponseCurrent(
          variables.description,
          categoryDescriptionRef.current
        )
      )
        return;
      if (!isSingleOfficialCategoryResult(data)) {
        setCategoryError(
          "Não foi possível confirmar uma única categoria final. Detalhe o tipo e o uso do produto e tente novamente."
        );
        return;
      }
      setCategoryError("");
      verifiedCategoryResponseRef.current = data;
      setCategoryAnswer(data);
      setInput(prev => ({
        ...prev,
        category: data.category,
        categoryDiscountEligible: false,
        packagingPreset: "custom",
      }));
      setFeeConfirmed(false);
    },
    onError: (error, variables) => {
      if (
        !isCategoryResponseCurrent(
          variables.description,
          categoryDescriptionRef.current
        )
      )
        return;
      const message =
        error.message ||
        "Não foi possível sugerir a categoria. Informe-a manualmente.";
      setCategoryError(message);
      toast.error(message);
    },
  });
  useEffect(() => {
    if (startupMigration)
      toast.info(startupMigration, { id: "interface-migration" });
  }, [startupMigration]);
  useEffect(() => {
    setInput(prev => {
      const normalized = normalizeInterfaceInput(
        normalizeWeightEntry(normalizePackagingDimensions(prev))
      );
      const missingFederal = ["taxPis", "taxCofins", "taxIrpj", "taxCsll"].some(
        key => prev[key as keyof PricingInput] === undefined
      );
      if (
        !missingFederal &&
        prev.itemQuantity !== undefined &&
        prev.productType !== undefined &&
        Array.isArray(prev.kitItems) &&
        typeof prev.productSku === "string" &&
        typeof prev.kitSku === "string" &&
        prev.difalMode !== undefined &&
        prev.taxDifalValue !== undefined &&
        normalized === prev
      )
        return prev;
      return applyCompanyTax({
        ...hydrateKitComposition(
          {
            ...normalized,
            productType: getProductType(prev.productType, prev.itemQuantity),
          },
          prev.kitItems
        ),
        ...getFederalTaxRates(prev),
        itemQuantity: prev.itemQuantity ?? 1,
        productType: getProductType(prev.productType, prev.itemQuantity),
        productSku: typeof prev.productSku === "string" ? prev.productSku : "",
        kitSku: typeof prev.kitSku === "string" ? prev.kitSku : "",
        calculationType: prev.calculationType ?? "estimated",
        difalMode: normalized.difalMode ?? "percent",
        taxDifalValue: normalized.taxDifalValue ?? 0,
      });
    });
  }, []);
  function update<K extends keyof PricingInput>(
    key: K,
    value: PricingInput[K]
  ) {
    const invalidateCategory =
      key === "description" &&
      typeof value === "string" &&
      shouldInvalidateSuggestedCategory(
        input.description,
        value,
        categoryAnswer !== null
      );
    if (key === "description" && typeof value === "string")
      categoryDescriptionRef.current = value;
    if (invalidateCategory) setCategoryAnswer(null);
    if (key === "description" || key === "category") setCategoryError("");
    setInput(prev => {
      const next: PricingInput = {
        ...prev,
        [key]: value,
        ...(invalidateCategory ? { category: "" } : {}),
        ...(["description", "category"].includes(key)
          ? {
              categoryDiscountEligible: false,
              packagingPreset: "custom" as const,
            }
          : {}),
      };
      return ["taxPis", "taxCofins", "taxIrpj", "taxCsll"].includes(key)
        ? applyCompanyTax(next)
        : next;
    });
    if (
      [
        "description",
        "category",
        "listing",
        "classicRate",
        "premiumRate",
        "price",
        "categoryDiscountEligible",
      ].includes(key)
    )
      setFeeConfirmed(false);
  }
  const { result, target } = useMemo(
    () => resolvePricingFlow(input, mode, goal),
    [input, mode, goal]
  );
  const breakEven = useMemo(() => solveTarget(input, 0), [input]);
  const commissionConfirmedForResult =
    result.valid &&
    feeConfirmed &&
    feeConfirmationPrice !== null &&
    Math.round(feeConfirmationPrice * 100) === Math.round(result.price * 100);
  const catalog = useProductCatalog({
    input,
    goal,
    mode,
    categoryAnswer,
    result,
    onRequestLogin: () => setModal("products"),
    onPrivateClear: () => {
      setInput({
        ...defaultInput,
        automaticShippingOnly: true,
        description: "",
        category: "",
        cost: 0,
        operation: 0,
        packaging: 0,
        price: 0,
        weight: 0,
        weightExact: 0,
        length: 0,
        width: 0,
        height: 0,
        ads: 0,
      });
      setCategoryAnswer(null);
      setCategoryError("");
      setGoal(20);
      setMode("target");
      setFeeConfirmed(false);
      setFeeConfirmationPrice(null);
      setPdfRecord(null);
      setFlowOpen(false);
    },
    onOpen: record => {
      const next = restoreInput(record.input, true, true);
      setInput(next);
      setGoal(record.goal);
      setMode(record.mode);
      setCategoryAnswer(readCategory(record.categoryAnswer, next.category));
      setCategoryError("");
      setFeeConfirmed(false);
      setFeeConfirmationPrice(null);
      const notice = getInterfaceMigrationNotice(record.input, next);
      if (notice) toast.info(notice);
      toast.success(
        "Produto aberto. Os campos incompletos continuam disponíveis para preencher."
      );
      setModal(null);
    },
  });
  const canSaveLocalHistory = canPersistBrowserHistory(
    catalog.privateOwner,
    catalog.isAuthenticated,
    catalog.authLoading
  );
  const draftStorageAction = getBrowserDraftAction(
    catalog.privateOwner,
    catalog.isAuthenticated,
    catalog.authLoading
  );
  useEffect(() => {
    if (
      !canPersistBrowserHistoryUpdate(
        canSaveLocalHistory,
        persistedHistory.current,
        history
      )
    )
      return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      persistedHistory.current = history;
    } catch {
      toast.error(
        "O armazenamento deste navegador está cheio ou indisponível. Seus registros continuam nesta sessão; baixe o PDF antes de fechar.",
        { id: "history-storage-error" }
      );
    }
  }, [history, canSaveLocalHistory]);
  useEffect(() => {
    clearProductLoginDraft();
  }, []);
  useEffect(() => {
    if (draftStorageAction === "wait") return;
    try {
      if (draftStorageAction === "clear") localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify(input));
    } catch {}
  }, [input, draftStorageAction]);
  useEffect(() => {
    if (draftStorageAction === "wait") return;
    try {
      if (draftStorageAction === "clear") localStorage.removeItem(GOAL_KEY);
      else if (Number.isFinite(goal) && goal > 0 && goal < 100)
        localStorage.setItem(GOAL_KEY, JSON.stringify(goal));
    } catch {}
  }, [goal, draftStorageAction]);
  useEffect(() => {
    if (draftStorageAction === "wait") return;
    try {
      if (draftStorageAction === "clear") localStorage.removeItem(CATEGORY_KEY);
      else localStorage.setItem(CATEGORY_KEY, JSON.stringify(categoryAnswer));
    } catch {}
  }, [categoryAnswer, draftStorageAction]);
  const effectiveMode = mode;
  const calculationType = input.calculationType;
  const categoryOrigin =
    categoryAnswer?.source === "ai"
      ? "Sugestão de IA — não oficial; a confirmar"
      : categoryAnswer?.source === "mercadolivre"
        ? "Sugestão da API Mercado Livre; a confirmar"
        : "Categoria informada ou origem não registrada; a confirmar";
  const unsupported =
    !["green", "new"].includes(input.reputation) ||
    input.condition === "used" ||
    ["flex", "other"].includes(input.logistic);
  const manual = input.shippingMode === "manual" || unsupported;
  const weightOrigin =
    input.weightInputMode === "band"
      ? "Estimado pelo limite superior da faixa escolhida"
      : "Valor numérico informado manualmente";
  const volume =
    input.length > 0 && input.width > 0 && input.height > 0
      ? (input.length * input.width * input.height) / 6000
      : 0;
  const referencePackaging = getPackagingPreset(input.packagingPreset);
  const packagingReferenceLabel = referencePackaging
    ? `${referencePackaging.label} · ${referencePackaging.sideA} × ${referencePackaging.sideB} cm (duas medidas cadastradas usadas na simulação; ${referencePackaging.statusLabel})`
    : "Embalagem personalizada / sem referência selecionada";
  const finalDimensionsLabel =
    input.length > 0 && input.width > 0 && input.height > 0
      ? `${input.length} × ${input.width} × ${input.height} cm (dimensões externas informadas do pacote final)`
      : "Dimensões completas do pacote final não informadas";
  const activePackaging = getPackagingPreset(input.packagingPreset);
  const packageDataMissing = [input.length, input.width, input.height].some(
    value => !Number.isFinite(value) || value <= 0
  );
  const freeShippingState = useMemo(
    () => evaluateFreeShippingControl(input, mode, goal, result),
    [input, mode, goal, result]
  );
  function toggleFreeShipping(enabled: boolean) {
    if (!freeShippingState.canToggle) {
      toast.info(freeShippingState.reason);
      return;
    }
    update("shippingMode", optionalShippingMode(enabled));
  }
  const stateTaxRates = getStateTaxRates(input);
  const difalLabel =
    input.saleDestination === "inside" && input.useDestinationTaxes
      ? "0% — venda dentro do estado"
      : input.difalMode === "rs"
        ? `${money(stateTaxRates.difalFixed)} por venda/kit (valor fixo)`
        : `${percent(stateTaxRates.difalPercent)} do preço de venda`;
  const acquisition = getAcquisition(input);
  const acquisitionTotal = acquisition.errors.length ? NaN : acquisition.total;
  const principalSku =
    input.productType === "kit" ? input.kitSku : input.productSku;
  const kg = (n: number) =>
    Number.isFinite(n)
      ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n) +
        " kg"
      : "—";
  const f = (
    key: keyof PricingInput,
    label: string,
    unit: "rs" | "percent" | "kg" | "cm" = "rs",
    hint?: string
  ) => (
    <NumberField
      label={label}
      value={input[key] as number}
      onChange={v => update(key, v as never)}
      prefix={unit === "rs" ? "R$" : undefined}
      suffix={unit === "rs" ? undefined : unit === "percent" ? "%" : unit}
      hint={hint}
    />
  );
  function summary() {
    if (!result.valid) return "";
    return [
      `Alpha E-Commerce — Simulação Mercado Livre`,
      `Tipo de cálculo: ${input.calculationType === "real" ? "Cálculo Real — custo de chegada confirmado no pátio" : "Cálculo Estimado — custo de chegada previsto"}`,
      input.description || "Produto",
      `Tipo de produto: ${input.productType === "kit" ? "KIT" : "Produto único"}`,
      `${input.productType === "kit" ? "SKU do KIT" : "SKU do produto"}: ${principalSku || "Não informado"}`,
      ...(input.productType === "kit"
        ? acquisition.items.map(
            (item, index) =>
              `Componente ${index + 1}: ${item.description}; SKU ${item.sku || "Não informado"}; quantidade ${item.quantity}; custo unitário ${money(item.unitCost)}; subtotal ${money(item.subtotal)}`
          )
        : []),
      `Total da aquisição: ${money(acquisition.total)}`,
      `Categoria: ${input.category || "A confirmar"}`,
      `Origem da categoria: ${categoryOrigin}`,
      `Quantidade de itens no produto/kit vendido: ${acquisition.quantity}`,
      `Anúncio: ${input.listing === "classic" ? "Clássico" : "Premium"}`,
      `Preço de venda do produto/kit completo: ${money(result.price)}`,
      ...resultLines(result).map(l => `${l.name}: ${money(l.value)}`),
      `Custos totais: ${money(result.totalCosts)}`,
      `Repasse antes do produto/outros custos: ${money(result.netPayout)}`,
      `Lucro estimado: ${money(result.profit)}`,
      `Margem sobre a venda: ${percent(result.margin)}`,
      `Embalagem Alpha / personalizada: ${packagingReferenceLabel}`,
      `Pacote final: ${finalDimensionsLabel}`,
      `Peso físico usado na simulação: ${kg(input.weight)}. Origem: ${weightOrigin}.`,
      `Peso considerado: ${kg(result.weightUsed)}`,
      `Envio: ${result.shippingLabel}`,
      `Comissão efetiva calculada: ${percent(result.rate)} — ${commissionConfirmedForResult ? "confirmada pelo usuário neste preço" : "confirme na categoria/conta e neste preço"}`,
      `Comissões-base informadas: Clássico ${percent(input.classicRate)}; Premium ${percent(input.premiumRate)}. Benefício 2/4 pp para categoria elegível de R$150 a R$700: ${input.categoryDiscountEligible ? "habilitado pelo usuário" : "desativado"}.`,
      `Tributos federais editados nesta simulação: ${percent(input.taxFederal)} (PIS ${percent(input.taxPis)}; COFINS ${percent(input.taxCofins)}; IRPJ ${percent(input.taxIrpj)}; CSLL ${percent(input.taxCsll)}). ICMS venda: ${percent(stateTaxRates.icmsSale)}; transferência: ${percent(stateTaxRates.icmsTransfer)}; destino: ${input.saleDestination === "outside" ? "fora" : "dentro"} do estado; DIFAL: ${difalLabel}.`,
      `DIFAL aplicado (já incluído nos impostos, não somar novamente): ${money(getDifalCost(input, result.price))}`,
      `Tabela pública consultada em 26/10/2026. Simulação sem conta vendedora conectada.`,
      ...result.warnings,
    ].join("\n");
  }
  async function copy() {
    try {
      if (!result.valid) return;
      await navigator.clipboard.writeText(summary());
      toast.success("Resumo copiado.");
    } catch {
      toast.error("Seu navegador não permitiu copiar. Use PDF.");
    }
  }
  function download() {
    if (!result.valid) return;
    const cell = (v: string | number) => {
      let s = String(v);
      if (typeof v === "string" && /^[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    };
    const rows = [
      ["Informação", "Valor"],
      ["Produto", input.description],
      [
        "Tipo de produto",
        input.productType === "kit" ? "KIT" : "Produto único",
      ],
      [
        input.productType === "kit" ? "SKU do KIT" : "SKU do produto",
        principalSku || "Não informado",
      ],
      ...(input.productType === "kit"
        ? acquisition.items.flatMap((item, index) => [
            [`Item ${index + 1} — descrição`, item.description],
            [`Item ${index + 1} — SKU`, item.sku || "Não informado"],
            [`Item ${index + 1} — quantidade`, item.quantity],
            [
              `Item ${index + 1} — custo unitário`,
              item.unitCost.toFixed(2).replace(".", ","),
            ],
            [
              `Item ${index + 1} — subtotal`,
              item.subtotal.toFixed(2).replace(".", ","),
            ],
          ])
        : []),
      ["Total da aquisição", acquisition.total.toFixed(2).replace(".", ",")],
      [
        "Tipo de cálculo",
        input.calculationType === "real"
          ? "Cálculo Real — custo de chegada confirmado"
          : "Cálculo Estimado — custo de chegada previsto",
      ],
      ["Categoria", input.category],
      ["Origem da categoria", categoryOrigin],
      ["Quantidade de itens no produto/kit", acquisition.quantity],
      ["Anúncio", input.listing === "classic" ? "Clássico" : "Premium"],
      [
        "Preço de venda do produto/kit completo",
        result.price.toFixed(2).replace(".", ","),
      ],
      ...resultLines(result).map(l => [
        l.name,
        l.value.toFixed(2).replace(".", ","),
      ]),
      [
        "Repasse antes de produto/outros custos",
        result.netPayout.toFixed(2).replace(".", ","),
      ],
      ["Lucro", result.profit.toFixed(2).replace(".", ",")],
      ["Margem", percent(result.margin)],
      [
        "Embalagem Alpha selecionada (duas medidas cadastradas)",
        packagingReferenceLabel,
      ],
      ["Dimensões externas do pacote final", finalDimensionsLabel],
      ["Peso físico usado na simulação", kg(input.weight)],
      ["Origem do peso físico", weightOrigin],
      ["Peso considerado", kg(result.weightUsed)],
      ["Envio", result.shippingLabel],
      ["Comissão efetiva neste preço", percent(result.rate)],
      [
        "Benefício 2/4 pp em categoria elegível R$150–700",
        input.categoryDiscountEligible
          ? "Habilitado pelo usuário"
          : "Desativado",
      ],
      [
        "Total federal informado (somado uma única vez)",
        percent(input.taxFederal),
      ],
      ["PIS informado", percent(input.taxPis)],
      ["COFINS informado", percent(input.taxCofins)],
      ["IRPJ informado", percent(input.taxIrpj)],
      ["CSLL informado", percent(input.taxCsll)],
      ["ICMS de venda", percent(stateTaxRates.icmsSale)],
      ["ICMS de transferência", percent(stateTaxRates.icmsTransfer)],
      [
        "Destino da venda",
        input.saleDestination === "outside"
          ? "Fora do estado"
          : "Dentro do estado",
      ],
      ["DIFAL informado manualmente", difalLabel],
      [
        "Modo do DIFAL",
        input.difalMode === "rs"
          ? "R$ fixos por venda/kit"
          : "% do preço de venda",
      ],
      [
        "DIFAL aplicado (já incluído nos impostos)",
        getDifalCost(input, result.price).toFixed(2).replace(".", ","),
      ],
      [
        "Condição",
        "Estimativa sem conta vendedora conectada; tabela consultada em 26/10/2026",
      ],
      ...result.warnings.map(w => ["Observação", w]),
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map(r => r.map(cell).join(";")).join("\r\n")],
      { type: "text/csv;charset=utf-8;" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "precificacao-mercado-livre.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Resumo exportado em CSV.");
  }
  function makeSaved(): Saved {
    return {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      input: structuredClone(input),
      rawInput: structuredClone(input),
      goal,
      mode: effectiveMode,
      resultPrice: result.price,
      profit: result.profit,
      snapshot: structuredClone(result),
      categoryAnswer: categoryAnswer ? structuredClone(categoryAnswer) : null,
    };
  }
  function save() {
    if (!canSaveLocalHistory) {
      toast.info(
        "Use Salvar produto para guardar o cadastro no histórico privado da sua conta."
      );
      return;
    }
    if (!result.valid) return;
    setHistory(items => [makeSaved(), ...items]);
    toast.success("Simulação salva neste navegador.");
  }
  function openPdf(saved?: Saved) {
    if (!saved && !result.valid) return;
    const record = saved ?? makeSaved();
    if (!saved && canSaveLocalHistory) setHistory(items => [record, ...items]);
    setPdfRecord(
      createProductReportRecord({
        ...record,
        input: record.rawInput ?? record.input,
      })
    );
  }
  function clear() {
    catalog.clearActive();
    setInput(
      applyCompanyTax({
        ...defaultInput,
        ...getFederalTaxRates(input),
        ...getStateTaxSettings(input),
        calculationType: input.calculationType,
        automaticShippingOnly: true,
        description: "",
        category: "",
        cost: 0,
        operation: 0,
        packaging: 0,
        price: 0,
        weight: 0,
        weightInputMode: "exact",
        weightExact: 0,
        length: 0,
        width: 0,
        height: 0,
        ads: 0,
        taxIcms: input.taxIcms,
        taxDifal: input.taxDifal,
        difalMode: input.difalMode ?? "percent",
        taxDifalValue: input.taxDifalValue ?? 0,
        promotion: 0,
      })
    );
    setCategoryAnswer(null);
    setFeeConfirmed(false);
    setGoal(20);
    setMode("target");
    toast.success(
      "Dados do produto limpos. Impostos informados e histórico mantidos."
    );
  }
  function loadVideoExample(price: number, shippingMode: "auto" | "rapid") {
    catalog.clearActive();
    setInput(
      applyCompanyTax({
        ...defaultInput,
        ...getFederalTaxRates(input),
        ...getStateTaxSettings(input),
        calculationType: input.calculationType,
        automaticShippingOnly: true,
        description:
          "Exemplo do vídeo — peso hipotético de 2,5 kg; informe seu custo",
        category: "Categoria do vídeo não informada — confirmar",
        cost: 0,
        operation: 0,
        packaging: 0,
        ads: 0,
        price,
        classicRate: 11.5,
        premiumRate: 16.5,
        weight: 2.5,
        weightInputMode: "exact",
        weightExact: 2.5,
        length: 0,
        width: 0,
        height: 0,
        shippingMode,
        taxIcms: input.taxIcms,
        taxDifal: input.taxDifal,
        difalMode: input.difalMode ?? "percent",
        taxDifalValue: input.taxDifalValue ?? 0,
      })
    );
    setCategoryAnswer(null);
    setFeeConfirmed(false);
    setMode("sale");
    setModal(null);
    toast.success(
      "Exemplo carregado: peso de 2,5 kg é hipótese. Informe o custo por item; seus impostos foram mantidos."
    );
  }
  function loadJewelryExample(kind: "package" | "observed" | "postage") {
    catalog.clearActive();
    if (kind !== "package") {
      toast.info(
        "Exemplos de frete manual foram retirados. Use a simulação do pacote pela tabela."
      );
      return;
    }
    setInput(prev =>
      applyCompanyTax({
        ...prev,
        description: "Joias — pacote medido; preço de referência do vídeo",
        category: "Joias e Relógios > Joias e Bijuterias > Colares",
        listing: "classic",
        price: 98.94,
        classicRate: 14,
        premiumRate: 19,
        categoryDiscountEligible: false,
        packagingPreset: "custom",
        itemQuantity: 1,
        weight: 0.263,
        weightInputMode: "exact",
        weightExact: 0.263,
        length: 18,
        width: 14,
        height: 18,
        logistic: "agency",
        condition: "new",
        reputation: "green",
        shippingMode: "auto",
        automaticShippingOnly: true,
        manualFixedFee: 0,
        fullExtra: 0,
      })
    );
    setCategoryAnswer(null);
    setFeeConfirmed(false);
    setMode("sale");
    setModal(null);
    toast.success(
      "Caso da joia carregado. Custos e ICMS/DIFAL mantidos; confira se pertencem à joia. R$21,30 não é o preço de venda."
    );
  }
  function addGoal() {
    if (!Number.isFinite(customGoal) || customGoal <= 0 || customGoal >= 100) {
      toast.error("Informe uma margem entre 0 e 100%.");
      return;
    }
    if (goals.includes(customGoal)) {
      setGoal(customGoal);
      setMode("target");
      return;
    }
    if (goals.length >= 8) {
      toast.error("Você pode comparar até 8 margens.");
      return;
    }
    setGoals(prev => [...prev, customGoal].sort((a, b) => a - b));
    setGoal(customGoal);
    setMode("target");
  }
  return (
    <>
      <header className="topbar">
        <div className="header-inner">
          <a
            className="brand"
            href="/calculadora/final"
            aria-label="Calculadora Alpha E-Commerce"
          >
            <img
              className="brand-logo"
              src="/manus-storage/alpha-logo_dde2ed09.png"
              alt=""
              width="48"
              height="48"
            />
            <div>
              <div className="brand-name">Alpha E-Commerce</div>
              <div className="brand-caption">Precificação inteligente</div>
            </div>
          </a>
          <div className="header-label">
            <Calculator size={14} /> Calculadora Final
          </div>
          <nav className="header-actions">
            <button
              onClick={() => {
                setModal("products");
                catalog.refresh();
              }}
              aria-label="Meus produtos salvos na nuvem"
            >
              <FolderOpen size={16} />
              <span className="nav-text">
                Meus produtos
                {catalog.records.length ? ` (${catalog.records.length})` : ""}
              </span>
            </button>
            <button
              onClick={() => {
                setModal("products");
                catalog.refresh();
              }}
              aria-label="Histórico da calculadora e produtos salvos"
            >
              <History size={16} />
              <span className="nav-text">
                Histórico{history.length > 0 ? ` (${history.length})` : ""}
              </span>
            </button>
            <button
              onClick={() => setModal("help")}
              aria-label="Como funciona a calculadora"
            >
              <CircleHelp size={16} />
              <span className="nav-text">Como funciona</span>
            </button>
            <button
              onClick={() => setFlowOpen(true)}
              aria-label="Explorar fluxograma interativo"
            >
              <Calculator size={16} />
              <span className="nav-text">Fluxograma</span>
            </button>
          </nav>
        </div>
      </header>
      <main className="page">
        <div className="page-intro">
          <div>
            <div className="eyebrow">Menos achismo. Mais margem.</div>
            <h1>
              Calcule por quanto vender.
              <br className="mobile-break" style={{ display: "none" }} /> Com a
              margem que você quer.
            </h1>
            <p>
              Informe custo, impostos e envio. Escolha sua margem. A Alpha
              determina o preço de venda e quanto sobra após os custos
              preenchidos.
            </p>
          </div>
          <div className="estimate-badge">
            <ShieldCheck size={13} />
            Frete estimado sem anúncio
          </div>
        </div>
        <div className="workspace">
          <div className="input-column">
            <Panel
              number="01"
              title="Seu produto"
              trailing={
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    className="btn primary"
                    onClick={() => {
                      void catalog.save();
                    }}
                    disabled={catalog.busy}
                    aria-label={
                      catalog.active
                        ? "Atualizar produto salvo"
                        : "Salvar produto na nuvem"
                    }
                  >
                    {catalog.busy ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    {catalog.active ? "Atualizar produto" : "Salvar produto"}
                  </button>
                  <button
                    className="link-button"
                    onClick={clear}
                    aria-label="Limpar campos"
                  >
                    <RotateCcw
                      size={12}
                      style={{ display: "inline", marginRight: 4 }}
                    />
                    Limpar
                  </button>
                </div>
              }
            >
              {catalog.active && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6f617e]">
                  <span>
                    Editando produto salvo:{" "}
                    {catalog.active.record.input.description ||
                      catalog.active.record.input.kitSku ||
                      catalog.active.record.input.productSku}
                  </span>
                  <button
                    className="link-button"
                    onClick={() => {
                      void catalog.save(true);
                    }}
                    disabled={catalog.busy}
                  >
                    Salvar como novo
                  </button>
                </div>
              )}
              <SelectField
                label="Tipo de produto"
                value={input.productType || "single"}
                onChange={value =>
                  update("productType", value as PricingInput["productType"])
                }
                options={[
                  { value: "single", label: "Produto único" },
                  { value: "kit", label: "KIT" },
                ]}
              />
              <label className="field">
                <span className="field-label">
                  {input.productType === "kit"
                    ? "Nome / descrição do KIT"
                    : "Descrição do produto"}
                </span>
                <input
                  type="text"
                  maxLength={400}
                  value={input.description}
                  onChange={e => {
                    update("description", e.target.value);
                    setCategoryAnswer(null);
                  }}
                  placeholder="Ex.: Kit de 3 potes organizadores de cozinha"
                />
              </label>
              <ProjectProductSuggestions description={input.description} />
              <label className="field">
                <span className="field-label">
                  {input.productType === "kit"
                    ? "SKU do KIT"
                    : "SKU do produto"}{" "}
                  <span className="optional">Opcional</span>
                </span>
                <input
                  type="text"
                  maxLength={80}
                  value={principalSku || ""}
                  onChange={event =>
                    update(
                      input.productType === "kit" ? "kitSku" : "productSku",
                      event.target.value
                    )
                  }
                  placeholder={
                    input.productType === "kit"
                      ? "Ex.: KIT-JOIAS-001"
                      : "Ex.: PROD-001"
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">
                  <span className="category-label-main">
                    Categoria
                    {categoryAnswer && (
                      <span
                        className="category-suggestion-badge"
                        title={
                          categoryIsVerified
                            ? categoryAnswer.explanation
                            : "Categoria de cadastro anterior ou não validada. Identifique novamente para confirmar a categoria final."
                        }
                      >
                        {categoryIsVerified ? "API" : "A confirmar"}
                      </span>
                    )}
                  </span>{" "}
                  <span className="optional">Uma categoria final</span>
                </span>
                <div className="category-row">
                  <input
                    aria-label="Categoria final"
                    value={singleCategoryLabel(input.category)}
                    onChange={e => {
                      update("category", e.target.value);
                      setCategoryAnswer(null);
                    }}
                    placeholder="Descreva o produto e identifique a categoria"
                    maxLength={200}
                  />
                  <button
                    type="button"
                    disabled={
                      suggestion.isPending ||
                      input.description.trim().length < 4
                    }
                    onClick={() =>
                      suggestion.mutate({
                        description: input.description.trim(),
                      })
                    }
                    title="Consulta categorias oficiais e verifica qual é compatível com a descrição. Não inclua dados pessoais. Se faltar informação, pede um detalhe em vez de escolher um palpite."
                  >
                    {suggestion.isPending ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Sparkles size={12} />
                    )}{" "}
                    {suggestion.isPending
                      ? "Analisando…"
                      : "Identificar categoria"}
                  </button>
                </div>
              </label>
              {categoryAnswer && (
                <p className="mb-3 text-xs leading-relaxed text-[#786b83]">
                  {categoryIsVerified
                    ? `Categoria ${categoryAnswer.categoryId}. `
                    : "Categoria anterior ainda não validada. "}
                  Confirme as comissões desta categoria: identificar o produto
                  não confirma a tarifa da sua conta.
                </p>
              )}
              {categoryError && (
                <div className="callout error" role="alert">
                  <Info size={13} />
                  <span>{categoryError}</span>
                </div>
              )}
              <div title="Estimado usa o custo previsto antes da chegada da mercadoria. Real usa o custo confirmado depois que ela chega ao pátio.">
                <SelectField
                  label="Tipo de cálculo"
                  value={calculationType}
                  onChange={value =>
                    update(
                      "calculationType",
                      value as PricingInput["calculationType"]
                    )
                  }
                  options={[
                    {
                      value: "estimated",
                      label:
                        "Cálculo Estimado (mercadoria não chegou, custo previsto)",
                    },
                    {
                      value: "real",
                      label: "Cálculo Real (chegou ao pátio, custo confirmado)",
                    },
                  ]}
                />
              </div>
              {input.productType === "kit" ? (
                <KitItemsEditor
                  items={input.kitItems || []}
                  onChange={items => update("kitItems", items)}
                />
              ) : (
                <>
                  <div className="field-row">
                    <SelectField
                      label="Unidade de compra"
                      value="unit"
                      onChange={() => update("costMode", "unit")}
                      options={[{ value: "unit", label: "Unidade" }]}
                    />
                    {f("cost", "Custo da mercadoria", "rs")}
                  </div>
                  <div className="field-row field-space">
                    <NumberField
                      label="Quantidade de unidades"
                      value={input.itemQuantity}
                      onChange={value => update("itemQuantity", value)}
                      suffix="unidades"
                    />
                    <div className="field">
                      <div className="field-label">Total da aquisição</div>
                      <div className="item-cost-total">
                        {Number.isFinite(acquisitionTotal)
                          ? money(acquisitionTotal)
                          : "—"}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </Panel>
            <Panel
              number="02"
              title="Frete do Mercado Livre"
              trailing={<Truck size={15} color="#9784ae" />}
            >
              <AlphaProfileFields
                input={input}
                onUseAlpha={() => {
                  setInput(previous => ({
                    ...alphaProfileInput(previous),
                    calculationType: "estimated",
                  }));
                  setFeeConfirmed(false);
                  setFeeConfirmationPrice(null);
                  toast.success(
                    "Perfil Alpha aplicado: Agência e reputação verde. Salve para atualizar o cadastro."
                  );
                }}
              />
              <PackagingSuggestions
                description={input.description}
                category={input.category}
                selected={input.packagingPreset}
                onSelect={id =>
                  setInput(prev => applyPackagingSelection(prev, id))
                }
              >
                {activePackaging ? (
                  <NumberField
                    label="Altura/espessura do pacote fechado"
                    value={input.height}
                    onChange={value => update("height", value)}
                    suffix="cm"
                    required
                    invalid={
                      !Number.isFinite(input.height) || input.height <= 0
                    }
                  />
                ) : (
                  <div className="field-row">
                    <NumberField
                      label="Comprimento"
                      value={input.length}
                      onChange={v => update("length", v)}
                      suffix="cm"
                      required
                      invalid={
                        !Number.isFinite(input.length) || input.length <= 0
                      }
                    />
                    <NumberField
                      label="Largura"
                      value={input.width}
                      onChange={v => update("width", v)}
                      suffix="cm"
                      required
                      invalid={
                        !Number.isFinite(input.width) || input.width <= 0
                      }
                    />
                    <NumberField
                      label="Altura"
                      value={input.height}
                      onChange={v => update("height", v)}
                      suffix="cm"
                      required
                      invalid={
                        !Number.isFinite(input.height) || input.height <= 0
                      }
                    />
                  </div>
                )}
                <PackageInputNotice input={input} />
              </PackagingSuggestions>
              <fieldset
                disabled={packageDataMissing}
                className="m-0 min-w-0 border-0 p-0"
              >
                <WeightInput
                  input={input}
                  dimensionalWeight={volume}
                  onBand={id => setInput(prev => selectWeightBand(prev, id))}
                  onManual={() => setInput(prev => restoreExactWeight(prev))}
                  onExact={value =>
                    setInput(prev => setExactWeight(prev, value))
                  }
                />
              </fieldset>
              <FreeShippingSwitch
                state={freeShippingState}
                mode={mode}
                onChange={toggleFreeShipping}
              />
              <fieldset
                disabled={packageDataMissing}
                className="m-0 min-w-0 border-0 p-0"
              >
                {input.logistic === "full" && (
                  <div className="field-space">
                    {f("fullExtra", "Custos extras Full por venda", "rs")}
                  </div>
                )}
                <div className="shipping-estimate">
                  <div className="field-label" style={{ marginBottom: 0 }}>
                    Custo de envio calculado
                  </div>
                  <b>{result.valid ? money(result.shipping) : "—"}</b>
                </div>
              </fieldset>
            </Panel>
            <section className="panel">
              <div className="panel-heading">
                <span className="section-no">03</span>
                <h2>Custos e impostos</h2>
              </div>
              <fieldset
                disabled={packageDataMissing}
                className="panel-body m-0 min-w-0 border-0"
              >
                <div className="field-row">
                  {f("operation", "Custo operacional por venda", "rs")}
                  {f("packaging", "Custo da embalagem", "rs")}
                </div>
                <div className="field-row">
                  <AdvertisingSelect
                    input={input}
                    onChange={value =>
                      setInput(prev => ({
                        ...prev,
                        ads: value,
                        adsMode: "rs",
                      }))
                    }
                  />
                  <EditableFederalTaxes
                    input={input}
                    onChange={(key, value) => update(key, value)}
                    onReset={() => {
                      setInput(prev => resetCompanyTax(prev));
                      toast.success(
                        "Alíquotas federais restauradas; demais custos mantidos."
                      );
                    }}
                  />
                </div>
                <StateTaxFields input={input} onChange={update} />
                <CalculatedCostsPreview
                  result={result}
                  goal={goal}
                  mode={mode}
                />
              </fieldset>
            </section>
            <Panel number="04" title="Margem de lucro e tipo de anúncio">
              <fieldset
                disabled={packageDataMissing}
                className="m-0 min-w-0 border-0 p-0"
              >
                <MarginPriceControl
                  mode={mode}
                  goal={goal}
                  goals={goals}
                  calculatedPrice={target.price}
                  error={mode === "target" ? target.error : result.error}
                  manualPrice={input.price}
                  obtainedMargin={result.valid ? result.margin : undefined}
                  obtainedProfit={result.valid ? result.profit : undefined}
                  onGoal={g => {
                    setGoal(g);
                    setMode("target");
                  }}
                  onMode={setMode}
                  onManualPrice={p => {
                    update("price", p);
                    setMode("sale");
                  }}
                />
                <div className="field-row mb-4 mt-4">
                  <NumberField
                    label="Outra margem"
                    value={customGoal}
                    onChange={setCustomGoal}
                    suffix="%"
                  />
                  <button
                    type="button"
                    className="link-button self-end rounded-lg border border-[#dfd4ec] bg-[#f7f2fc] px-4 py-3"
                    onClick={addGoal}
                  >
                    Adicionar margem
                  </button>
                </div>
                <ListingChoices
                  input={input}
                  onSelect={value => update("listing", value)}
                  onRate={update}
                />
              </fieldset>
            </Panel>
            {result.warnings.length > 0 && (
              <details className="mb-4 rounded-xl border border-[#e8e0ef] p-3 text-xs">
                <summary className="cursor-pointer font-semibold text-[#796586]">
                  Avisos da simulação
                </summary>
                <ul className="warning-list mt-2">
                  {result.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <aside className="result-column" id="resultado">
            <ResultCard
              r={result}
              input={input}
              mode={effectiveMode}
              goal={goal}
              onCopy={copy}
              onSave={() => {
                void catalog.save();
              }}
              onPdf={() => openPdf()}
              onPriceChange={
                packageDataMissing
                  ? undefined
                  : value => {
                      update("price", value);
                      setMode("sale");
                    }
              }
              editablePrice={
                mode === "sale"
                  ? input.price
                  : result.valid
                    ? result.price
                    : NaN
              }
            />
            <MarginResults
              input={input}
              goals={goals}
              selected={goal}
              mode={mode}
              onSelect={g => {
                setGoal(g);
                setMode("target");
              }}
              onRemove={g => {
                setGoals(gs => gs.filter(x => x !== g));
                if (goal === g) setGoal(20);
              }}
            />
            <CompareResults input={input} goal={goal} />
            {breakEven.result && (
              <section className="panel margins-panel">
                <h2>Seu ponto de equilíbrio</h2>
                <p style={{ marginBottom: 0 }}>
                  Para cobrir os custos sem lucro, o preço mínimo estimado é{" "}
                  <strong style={{ color: "#5b4281" }}>
                    {money(breakEven.result.price)}
                  </strong>
                  .
                </p>
              </section>
            )}
          </aside>
        </div>
        <footer className="footer">
          <a
            href="/manus-storage/Guia-Frete-Alpha-E-Commerce_6fd38158.pdf"
            target="_blank"
            rel="noreferrer"
          >
            Guia das modalidades de envio (PDF)
          </a>
          <a href="/manus-storage/estudo-frete-mercado-livre_40125432.md" download>
            Baixar o estudo das regras
          </a>
          <div>
            Ferramenta independente, sem vínculo oficial com o Mercado Livre.
            <br />
            Tabela pública consultada em 26/10/2026 · cálculo pela tabela, sem aplicar cotação específica da conta conectada ao Mercato.
          </div>
          <button onClick={() => setModal("help")}>
            Ver regras, fontes e limites da simulação{" "}
            <ArrowRight
              size={11}
              style={{ display: "inline", marginLeft: 4 }}
            />
          </button>
        </footer>
      </main>
      {modal === "help" && (
        <Modal
          title="Como o frete e o lucro são calculados"
          onClose={closeModal}
        >
          <h3>Embalagens sugeridas da Alpha</h3>
          <p>
            P20×30 cm é a referência usada para joias, inclusive várias
            caixinhas no mesmo pedido. G40×60 cm é a referência da barraca.
            M26×36 cm não é utilizada e GG100×100 cm ainda não está disponível;
            aparecem somente para planejamento. As sugestões usam a descrição ou
            categoria e não garantem que o produto caiba.
          </p>
          <p>
            Selecionar uma embalagem Alpha preenche as duas medidas cadastradas
            e pede a altura/espessura do pacote fechado. Peso e custo da
            embalagem não são alterados pela seleção. Se o pacote já medido
            tiver dimensões diferentes, escolha embalagem personalizada e
            informe as três medidas reais. O cálculo usa as dimensões exibidas.
          </p>
          <h3>Você informa os custos. A Alpha determina o preço.</h3>
          <p>
            O fluxo principal não pede preço de venda. Informe custo de chegada,
            categoria, anúncio, envio, peso da embalagem e despesas; escolha a
            margem sobre a venda que deseja manter depois dos custos. A
            calculadora procura o menor preço em centavos que atende a essa
            margem, recalculando frete, comissão e impostos em cada faixa. O
            preço mostrado é uma estimativa baseada nos custos preenchidos e nas
            condições verificadas, não garantia de cobrança da sua conta.
          </p>
          <p>
            Quando faltar um dado ou a meta for impossível, o resultado fica
            indisponível com o motivo. Não substituímos a meta por um preço
            antigo. A conferência de um preço já existente é uma função
            secundária, aberta somente quando você escolhe essa opção.
          </p>
          <h3>O limite é R$ 79, não R$ 78</h3>
          <p>
            Para produtos novos elegíveis de R$ 19 a R$ 78,99, o Mercado Livre
            pode oferecer frete grátis padrão. Abaixo de R$ 79, o vendedor pode
            escolher oferecer grátis rápido, com custo de envio de uma tabela
            própria. A partir de R$ 79, a regra contempla grátis rápido;
            distância, peso, dimensões, categoria e modalidade podem mudar a
            elegibilidade.
          </p>
          <p>
            “Grátis” descreve o benefício do comprador, não um envio sem custo
            para o vendedor. A opção “Padrão / sem grátis rápido opcional” não
            significa que o comprador sempre paga o frete.
          </p>
          <p>
            O custo de envio do vendedor se aplica mesmo quando a tela indica
            “Por conta do comprador”. Não oferecer grátis rápido opcional mantém
            a cobrança da tabela padrão: não calculamos esse cenário como frete
            zero.
          </p>
          <p>
            Abaixo de R$ 19, a nota da tabela oficial limita o custo a no máximo
            metade do preço do produto. Aplicamos esse teto tanto à regra padrão
            quanto ao grátis rápido opcional.
          </p>
          <h3>Reputação é desconto, não uma taxa separada</h3>
          <p>
            A tabela usada aqui é a publicada para MercadoLíder, reputação verde
            e sem reputação. Seus valores já consideram o benefício publicado.
            Aplicar mais 50% de desconto sobre a tabela faria o frete parecer
            menor do que é. Para amarela, laranja/vermelha ou outras condições,
            esta versão solicita o custo confirmado manualmente em vez de
            inventar um multiplicador.
          </p>
          <h3>O que o seu print mostra</h3>
          <p>
            Preço R$ 23,99; comissão informada de 11%: R$ 2,64; envio de R$
            29,50 com desconto de 50%: R$ 14,75. O repasse é R$ 6,60. Esse valor
            ainda não é lucro, porque o produto e outros gastos precisam ser
            descontados. Na tabela consultada, R$ 14,75 também corresponde a
            grátis rápido opcional para peso considerado acima de 1 kg até 1,5
            kg. O print não informa o peso, então essa coincidência não confirma
            o peso real.
          </p>
          <button
            className="link-button"
            onClick={() => {
              setInput(
                applyCompanyTax({
                  ...defaultInput,
                  ...getFederalTaxRates(input),
                  ...getStateTaxSettings(input),
                  calculationType: input.calculationType,
                  automaticShippingOnly: true,
                  taxIcms: input.taxIcms,
                  taxDifal: input.taxDifal,
                  difalMode: input.difalMode ?? "percent",
                  taxDifalValue: input.taxDifalValue ?? 0,
                  description: "Cenário do print — informe seu custo real",
                  category: "Categoria a confirmar",
                  cost: 0,
                  operation: 0,
                  packaging: 0,
                  ads: 0,
                  price: 23.99,
                  classicRate: 11,
                  weight: 1.5,
                  weightInputMode: "exact",
                  weightExact: 1.5,
                  length: 0,
                  width: 0,
                  height: 0,
                  shippingMode: "rapid",
                })
              );
              categoryDescriptionRef.current =
                "Cenário do print — informe seu custo real";
              setCategoryAnswer(null);
              setCategoryError("");
              setMode("sale");
              setFeeConfirmed(false);
              setModal(null);
              toast.success(
                "Cenário ilustrativo carregado. Peso de 1,5 kg é hipótese, não dado do print."
              );
            }}
          >
            Testar o cenário do print com peso hipotético de 1,5 kg{" "}
            <ArrowRight size={11} style={{ display: "inline" }} />
          </button>
          <VideoExamples onLoad={loadVideoExample} />
          <JewelryComparison onLoad={loadJewelryExample} />
          <h3>Peso e dimensões da embalagem final</h3>
          <p>
            O peso volumétrico é comprimento × largura × altura, em centímetros,
            dividido por 6.000. A calculadora usa o maior entre o volumétrico e
            o peso real, em kg. Depois do despacho, o Mercado Livre mede e pesa
            o pacote e pode ajustar o custo. O custo de aquisição por kg é outra
            informação e não substitui o peso de envio.
          </p>
          <h3>Lucro de verdade e preço por margem</h3>
          <p>
            Lucro = preço − custo do produto − operação − embalagem − comissão −
            envio − publicidade − tributos − demais custos preenchidos. Margem =
            lucro ÷ preço × 100. Cada preço sugerido verifica sua faixa de envio
            e arredonda os custos em centavos.
          </p>
          <h3>Quantidade de itens no produto/kit</h3>
          <p>
            O campo Quantidade de itens fica junto ao custo de chegada de1 item.
            Informe as peças na mesma unidade de venda/kit: custo por
            item×quantidade, ou custo/kg×kg por item×quantidade. O preço
            calculado é do produto/kit completo. Não use esse campo para juntar
            vendas independentes em uma cobrança de envio.
          </p>
          <p>
            Peso e medidas são do pacote inteiro com todas as peças e caixinhas.
            Atualize esses dados ao mudar a quantidade. Não multiplicamos frete,
            embalagem ou custos operacionais por peça automaticamente.
          </p>
          <h3>Escolher peso por faixa</h3>
          <p>
            No seletor de peso, escolha uma faixa da tabela ou Digitar peso
            exato. A faixa usa seu limite superior como estimativa: mais de 0,5
            até 1 kg usa 1 kg. Ao voltar para entrada manual, restauramos o peso
            numérico anterior. Mais de 150 kg pede peso exato, pois não existe
            limite superior para preencher automaticamente. Se a cubagem for
            maior que o peso escolhido, ela prevalece no frete. O peso é do
            pacote com todos os itens, não o custo de compra por kg.
          </p>
          <h3>Dimensões da embalagem Alpha</h3>
          <p>
            Selecionar P, M, G ou GG preenche as duas medidas cadastradas; você
            informa somente a altura/espessura do pacote fechado. Trocar de
            tamanho limpa essa medida para não reaproveitar outra embalagem. Sem
            embalagem Alpha selecionada, os três campos são manuais. Peso e
            custo continuam informados por você. Se o pacote final tiver outras
            dimensões, escolha a opção manual e ajuste todas.
          </p>
          <h3>DIFAL muda o frete?</h3>
          <p>
            DIFAL está em Custos e tributos adicionais e entra como imposto na
            simulação, não como tarifa de envio. Escolha % do preço de venda ou
            R$ fixos por venda/kit. Os dois valores são lembrados separadamente,
            mas só a opção selecionada é aplicada. Em reais, o DIFAL entra uma
            vez nos impostos e como custo fixo do preço por margem, sem
            multiplicar pelas peças do kit. Com preço e pacote iguais, alterar
            DIFAL muda tributos e lucro, não o frete. No cálculo por margem, ele
            pode aumentar o preço de venda; se esse preço cruzar uma faixa da
            tabela, o frete pode mudar indiretamente. A alíquota e sua aplicação
            fiscal devem ser confirmadas com seu contador.
          </p>
          <p>
            Você pode editar PIS, COFINS, IRPJ e CSLL individualmente. Os
            valores iniciais são0,65%,3%,1,5% e1%; o total é somado
            automaticamente e aplicado uma única vez. Suas alterações são
            mantidas ao limpar dados do produto ou carregar exemplos. O botão
            Restaurar valores iniciais é a única restauração explícita desse
            perfil. São parâmetros informados para a simulação sobre o preço de
            venda, não uma validação do enquadramento fiscal ou apuração de
            tributos. ICMS e DIFAL são preenchidos manualmente e somados
            separadamente. Confirme a aplicação com seu contador e evite
            duplicidade. No modo automático não somamos uma tarifa fixa antiga
            sobre a tabela de envio. A entrada de frete manual não faz parte
            desta interface.
          </p>
          <h3>O preço não mudou quando alterei kg</h3>
          <p>
            O cálculo principal é por margem: o preço de venda muda quando os
            custos efetivamente mudam. Só na conferência opcional de preço
            existente mantemos o valor digitado e recalculamos o lucro. O custo
            de chegada é informado por item. O peso embalado é outro campo, e a
            tabela usa o maior entre peso físico e volumétrico. Dentro da mesma
            faixa de envio, alterar o peso pode não alterar o frete.
          </p>
          <h3>O que é estimado e o que não está conectado</h3>
          <p>
            Esta versão usa uma tabela pública e não consulta sua conta
            vendedora. Descrição pode gerar sugestão de categoria, mas a
            comissão continua manual. Não usamos CEP de comprador porque a
            tabela pública não é uma cotação de rota específica. Flex, usados,
            tabelas especiais e outros perfis não têm cotação automática nesta
            versão. Full pode ter armazenagem e custos adicionais, que devem ser
            rateados no campo próprio.
          </p>
          <p>
            É possível consultar custo do vendedor antes do anúncio pela API
            oficial usando dimensões e contexto, mas a cotação personalizada
            exige autorização OAuth da conta. Esta versão não faz essa conexão.
            Confira o valor da sua conta antes de publicar.
          </p>
          <h3>Fontes oficiais consultadas</h3>
          <p>
            <a
              href="https://www.mercadolivre.com.br/ajuda/custos-envio-reputacao-verde-mercado-lider_40538"
              target="_blank"
              rel="noreferrer"
            >
              Tabela de custos: reputação verde / MercadoLíder / sem reputação
            </a>
            <br />
            <a
              href="https://www.mercadolivre.com.br/ajuda/16467"
              target="_blank"
              rel="noreferrer"
            >
              Como funcionam os fretes grátis
            </a>
            <br />
            <a
              href="https://www.mercadolivre.com.br/ajuda/Como-calcular-o-custo-dos-seus_4413"
              target="_blank"
              rel="noreferrer"
            >
              Como calcular o peso e o custo de envio
            </a>
            <br />
            <a
              href="https://www.mercadolivre.com.br/simulador-de-custos"
              target="_blank"
              rel="noreferrer"
            >
              Simulador oficial de custos da sua conta
            </a>
            <br />
            <a
              href="https://developers.mercadolivre.com.br/pt_br/mercado-envios-modo-2/comissao-por-vender"
              target="_blank"
              rel="noreferrer"
            >
              API de comissão e tarifas
            </a>
          </p>
          <h3>Vídeos úteis — apoio, não tabela oficial</h3>
          <p>
            <a
              href="https://www.youtube.com/watch?v=zyNvK-w102w"
              target="_blank"
              rel="noreferrer"
            >
              Pesos e Medidas Descomplicado — Vendedores Mercado Livre Brasil
            </a>
            <br />
            <a
              href="https://www.youtube.com/watch?v=KvVyJlYt6w0"
              target="_blank"
              rel="noreferrer"
            >
              Mudanças nas tarifas em agosto de 2026 — Bruno Gontijo
            </a>
          </p>
          <p>
            A data de 26/10/2026 é a data da consulta, não garantia de vigência
            futura. As condições podem mudar; consulte sempre as fontes
            oficiais.
          </p>
        </Modal>
      )}
      {pdfRecord && (
        <Suspense
          fallback={
            <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-[#67458b] px-5 py-3 text-white">
              Preparando a ficha PDF…
            </div>
          }
        >
          <ProductPdfDialog
            record={pdfRecord}
            onClose={() => setPdfRecord(null)}
          />
        </Suspense>
      )}
      {flowOpen && (
        <Suspense
          fallback={
            <div
              role="status"
              className="fixed bottom-5 right-5 z-50 rounded-xl bg-[#67458b] px-5 py-3 text-white"
            >
              Abrindo o fluxograma…
            </div>
          }
        >
          <FlowExplorerDialog
            input={input}
            goal={goal}
            onClose={() => setFlowOpen(false)}
            onApply={(nextInput, nextGoal) => {
              if (
                !isCategoryResponseCurrent(
                  input.description,
                  nextInput.description
                ) ||
                input.category !== nextInput.category
              ) {
                setCategoryAnswer(null);
                setCategoryError("");
              }
              categoryDescriptionRef.current = nextInput.description;
              setInput(nextInput);
              setGoal(nextGoal);
              setMode("target");
              setFeeConfirmed(false);
              setFeeConfirmationPrice(null);
              setFlowOpen(false);
              toast.success(
                "Caminho aplicado à calculadora. Salve o produto para guardar a alteração."
              );
            }}
          />
        </Suspense>
      )}
      <HistoryWorkspaceDialog
        open={modal === "products" || modal === "history"}
        onClose={closeModal}
        section={modal === "products" ? "products" : "simulations"}
        onSectionChange={section => {
          setModal(section === "products" ? "products" : "history");
          if (section === "products") catalog.refresh();
        }}
        catalogProps={{
          records: catalog.records,
          onClose: closeModal,
          onOpen: catalog.open,
          onDelete: catalog.remove,
          onSaveCurrent: () => {
            void catalog.save();
          },
          storageMode: "cloud",
          loading: catalog.loading || catalog.busy,
          error: catalog.error,
          onSignIn: catalog.isAuthenticated ? undefined : catalog.signIn,
        }}
      >
        <div className="mb-4 flex justify-end">
          <button
            className="btn"
            onClick={save}
            disabled={!result.valid || !canSaveLocalHistory}
            title={
              !canSaveLocalHistory
                ? "Cadastros da conta são guardados na nuvem privada, em Meus produtos."
                : undefined
            }
          >
            Salvar simulação atual neste navegador
          </button>
        </div>
        <p>
          Salvas somente neste navegador. Cada PDF usa os dados originais do
          registro.
        </p>
        <Segment
          label="Filtrar histórico"
          value={historyFilter}
          onChange={value =>
            setHistoryFilter(value as "estimated" | "real" | "all")
          }
          options={[
            { value: "estimated", label: "Estimados" },
            { value: "real", label: "Reais" },
            { value: "all", label: "Todos" },
          ]}
        />
        {history.filter(
          item =>
            historyFilter === "all" ||
            item.input.calculationType === historyFilter
        ).length === 0 ? (
          <div className="callout purple">
            <History size={14} />
            <span>
              Nenhuma simulação salva neste navegador. Para guardar cadastros,
              use Meus produtos.
            </span>
          </div>
        ) : (
          history
            .filter(
              item =>
                historyFilter === "all" ||
                item.input.calculationType === historyFilter
            )
            .map(h => (
              <div className="history-item" key={h.id}>
                <div>
                  <strong>
                    {h.input.description || "Produto sem descrição"}
                  </strong>
                  <span>
                    SKU:{" "}
                    {h.input.productType === "kit"
                      ? h.input.kitSku || "Não informado"
                      : h.input.productSku || "Não informado"}
                  </span>
                  <span>
                    {h.input.productType === "kit" ? "KIT" : "Produto único"} ·{" "}
                    {h.input.calculationType === "real"
                      ? "Cálculo Real"
                      : "Cálculo Estimado"}{" "}
                    · {money(h.resultPrice)} · lucro {money(h.profit)} ·{" "}
                    {new Date(h.at).toLocaleString("pt-BR")}
                  </span>
                  <span>
                    Embalagem de referência:{" "}
                    {getPackagingPreset(h.input.packagingPreset)?.label ||
                      "Personalizada"}
                    .
                    {h.input.length > 0 &&
                    h.input.width > 0 &&
                    h.input.height > 0
                      ? ` Pacote final informado: ${h.input.length} × ${h.input.width} × ${h.input.height} cm.`
                      : " Medidas completas do pacote não informadas."}
                  </span>
                  {h.snapshot && (
                    <span>
                      Envio {money(h.snapshot.shipping)} · custos totais{" "}
                      {money(h.snapshot.totalCosts)}. Valores salvos; Carregar
                      recalcula com a tabela atual e os impostos salvos nesta
                      simulação: federais {percent(h.input.taxFederal)}.
                      Quantidade: {getAcquisition(h.input).quantity} itens.
                    </span>
                  )}
                  <span>
                    {h.categoryAnswer?.source === "ai"
                      ? "Categoria: sugestão de IA — não oficial; confirme."
                      : h.categoryAnswer?.source === "mercadolivre"
                        ? "Categoria sugerida pela API; confirme."
                        : "Categoria informada ou origem não registrada; confirme."}
                  </span>
                </div>
                <button
                  onClick={() => {
                    catalog.clearActive();
                    const original = h.rawInput ?? h.input;
                    const next = restoreInput(original);
                    const notice = getInterfaceMigrationNotice(original, next);
                    setInput(next);
                    if (notice)
                      toast.info(notice, { id: "interface-migration" });
                    setGoal(h.goal);
                    if (!goals.includes(h.goal))
                      setGoals(g => [...g, h.goal].slice(0, 8));
                    setMode(h.mode);
                    setFeeConfirmed(false);
                    setCategoryAnswer(h.categoryAnswer ?? null);
                    setModal(null);
                    toast.success(
                      "Simulação carregada com quantidade e impostos salvos nela. Confira os custos e as comissões."
                    );
                  }}
                >
                  Carregar
                </button>
                <button
                  type="button"
                  aria-label={`PDF de ${h.input.description}`}
                  onClick={() => openPdf(h)}
                >
                  PDF
                </button>
                <button
                  aria-label={`Excluir simulação ${h.input.description}`}
                  onClick={() =>
                    setHistory(prev => prev.filter(x => x.id !== h.id))
                  }
                >
                  Excluir
                </button>
              </div>
            ))
        )}
      </HistoryWorkspaceDialog>
    </>
  );
}
