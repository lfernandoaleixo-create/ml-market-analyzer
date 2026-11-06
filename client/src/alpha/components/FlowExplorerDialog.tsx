import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronDown, ChevronUp, GitBranch, LockKeyhole } from "lucide-react";
import {
  buildScenarioInput,
  DEFAULT_MATRIX_ADS_AMOUNTS,
  DEFAULT_MATRIX_DESTINATIONS,
  DEFAULT_MATRIX_LISTINGS,
  DEFAULT_MATRIX_LOGISTICS,
  DEFAULT_MATRIX_MARGINS,
  DEFAULT_MATRIX_SHIPPING_MODES,
  MATRIX_SHIPPING_LABELS,
  type MatrixDestination,
  type MatrixListing,
  type MatrixLogistic,
  type MatrixShippingMode,
} from "@shared/alpha/decisionReport";
import {
  solveTarget,
  type PricingInput,
  type PricingResult,
  type Reputation,
} from "@shared/alpha/pricing";
import {
  FLOW_REPUTATION_OPTIONS,
  flowReputationCacheKey,
  flowReputationLabel,
  flowReputationReason,
  flowReputationVisibleValues,
  isFlowReputation,
} from "@shared/alpha/flowReputation";
import {
  canApplyShippingScenario,
  mandatoryFreeShippingChoiceReason,
} from "@shared/alpha/freeShippingControl";
import {
  ALPHA_LOGISTIC,
  ALPHA_LOGISTICS,
  ALPHA_REPUTATION,
  alphaProfileInput,
} from "@shared/alpha/alphaProfile";
import {
  flowCompactLayout,
  flowOverviewZoom,
  flowReadingZoom,
} from "@shared/alpha/flowGeometry";
import { SHIPPING_METHODS } from "@shared/alpha/shippingMethods";
import "./FlowExplorer.css";

export interface FlowExplorerDialogProps {
  input: PricingInput;
  goal: number;
  onClose: () => void;
  onApply: (input: PricingInput, goal: number) => void;
}

type StageKey =
  | "reputation"
  | "logistic"
  | "ads"
  | "destination"
  | "listing"
  | "shipping";
type ChoiceValue =
  | MatrixLogistic
  | MatrixDestination
  | MatrixListing
  | MatrixShippingMode
  | Reputation
  | number;

type Selection = {
  reputation: Reputation | null;
  logistic: MatrixLogistic | null;
  adsAmount: number | null;
  destination: MatrixDestination | null;
  listing: MatrixListing | null;
  shippingMode: MatrixShippingMode | null;
};

type ChoiceOption = {
  value: ChoiceValue | null;
  label: string;
  detail: string;
  unavailable?: boolean;
};

type MarginEvaluation = {
  valid: boolean;
  price: number | null;
  profit: number | null;
  shipping: number | null;
  result: PricingResult | null;
  reason?: string;
  blockedChoice?: boolean;
};

type GraphNode = {
  id: string;
  group: string;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  detail: string;
  note?: string;
  kind: "choice" | "margin";
  selected: boolean;
  unavailable?: boolean;
  margin?: number;
  stage?: StageKey;
  value?: ChoiceValue | null;
};

type GraphEdge = {
  id: string;
  from: GraphNode;
  to: GraphNode;
  selected: boolean;
};

const STAGE_DEFINITIONS: readonly {
  key: StageKey;
  label: string;
  shortLabel: string;
}[] = [
  { key: "reputation", label: "Reputação", shortLabel: "Reputação" },
  { key: "logistic", label: "Logística", shortLabel: "Logística" },
  { key: "ads", label: "Publicidade R$", shortLabel: "Publicidade" },
  { key: "destination", label: "Destino", shortLabel: "Destino" },
  { key: "listing", label: "Anúncio", shortLabel: "Anúncio" },
  { key: "shipping", label: "Frete", shortLabel: "Frete" },
];

const LOGISTIC_LABELS: Record<MatrixLogistic, string> = {
  agency: "Agência",
  collection: "Coleta",
  full: "Full",
  flex: "Flex",
  other: "Outra",
};

const FIXED_STAGE_KEYS: readonly StageKey[] = ["reputation", "logistic"];

function isFixedStage(key: StageKey): boolean {
  return FIXED_STAGE_KEYS.includes(key);
}

const MARGIN_EPSILON = 1e-9;
const NODE_WIDTH = 226;
const CHOICE_HEIGHT = 146;
const ROOT_HEIGHT = 164;
const MARGIN_HEIGHT = 192;
const COLUMN_WIDTH = 248;
const ROW_GAP = 24;
const SCENE_PADDING = 28;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.35;

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function money(value: number | null): string {
  return value !== null && finite(value) ? moneyFormatter.format(value) : "—";
}

function marginLabel(value: number): string {
  return `${numberFormatter.format(value)}%`;
}

function adsLabel(value: number): string {
  return `${money(value)} por venda`;
}

function sameValue(
  left: ChoiceValue | null,
  right: ChoiceValue | null
): boolean {
  if (typeof left === "number" && typeof right === "number")
    return Math.abs(left - right) < MARGIN_EPSILON;
  return left === right;
}

function safeId(value: unknown): string {
  return (
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "valor"
  );
}

function yieldToHost(): Promise<void> {
  return new Promise(resolve => {
    if (typeof setTimeout === "function") setTimeout(resolve, 0);
    else resolve();
  });
}

function inputFingerprint(input: PricingInput): string {
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function initialSelection(input: PricingInput, goal: number): Selection {
  const alphaInput = alphaProfileInput(input);
  const reputation = ALPHA_REPUTATION;
  const logistic = ALPHA_LOGISTIC;
  const destination = DEFAULT_MATRIX_DESTINATIONS.includes(
    input.saleDestination
  )
    ? input.saleDestination
    : null;
  const listing = DEFAULT_MATRIX_LISTINGS.includes(input.listing)
    ? input.listing
    : null;
  const shippingMode = DEFAULT_MATRIX_SHIPPING_MODES.includes(
    input.shippingMode as MatrixShippingMode
  )
    ? (input.shippingMode as MatrixShippingMode)
    : null;
  let initialShippingMode = shippingMode;
  if (shippingMode === "auto" && finite(goal)) {
    const target = solveTarget(alphaInput, goal, alphaInput.listing);
    if (
      target.price !== null &&
      target.result?.valid &&
      mandatoryFreeShippingChoiceReason(alphaInput, target.result)
    ) {
      initialShippingMode = "rapid";
    }
  }
  return {
    reputation,
    logistic,
    adsAmount: finite(input.ads) ? input.ads : null,
    destination,
    listing,
    shippingMode: initialShippingMode,
  };
}

function choiceValue(selection: Selection, key: StageKey): ChoiceValue | null {
  switch (key) {
    case "reputation":
      return selection.reputation;
    case "logistic":
      return selection.logistic;
    case "ads":
      return selection.adsAmount;
    case "destination":
      return selection.destination;
    case "listing":
      return selection.listing;
    case "shipping":
      return selection.shippingMode;
  }
}

function stageChoiceLabel(key: StageKey, option: ChoiceOption): string {
  if (key === "ads") return adsLabel(option.value as number);
  return option.label;
}

function selectionSummary(selection: Selection): string {
  const parts = [
    selection.reputation
      ? flowReputationLabel(selection.reputation)
      : "Reputação não informada",
    selection.logistic
      ? LOGISTIC_LABELS[selection.logistic]
      : "Logística não informada",
    selection.adsAmount !== null
      ? adsLabel(selection.adsAmount)
      : "Publicidade não informada",
    selection.destination === "outside"
      ? "Fora do estado"
      : selection.destination === "inside"
        ? "Dentro do estado"
        : "Destino não informado",
    selection.listing === "premium"
      ? "Premium"
      : selection.listing === "classic"
        ? "Clássico"
        : "Anúncio não informado",
    selection.shippingMode
      ? MATRIX_SHIPPING_LABELS[selection.shippingMode]
      : "Frete não informado",
  ];
  return parts.join(" · ");
}

function unsupportedPathReason(
  input: PricingInput,
  selection: Selection
): string | undefined {
  const reputationReason = flowReputationReason(selection.reputation);
  if (reputationReason) return reputationReason;
  if (input.condition !== "new") {
    return "A condição usada não possui tabela automática disponível para este explorador.";
  }
  if (selection.logistic === "flex" || selection.logistic === "other") {
    return `A logística ${LOGISTIC_LABELS[selection.logistic]} não possui tabela automática disponível. O cenário fica bloqueado para não inventar frete.`;
  }
  if (selection.shippingMode === null) {
    return "O modo de frete atual não está entre as duas opções automáticas comparadas.";
  }
  return undefined;
}

function missingChoiceReason(selection: Selection): string | undefined {
  if (selection.reputation === null)
    return "Escolha uma reputação para abrir este caminho.";
  if (selection.logistic === null)
    return "Escolha uma logística para abrir este caminho.";
  if (selection.adsAmount === null)
    return "Publicidade não informada: escolha um valor em reais por venda.";
  if (selection.destination === null) return "Escolha o destino da venda.";
  if (selection.listing === null) return "Escolha o tipo de anúncio.";
  if (selection.shippingMode === null)
    return "Escolha uma das modalidades de frete comparadas.";
  return undefined;
}

type CompleteSelection = {
  reputation: Reputation;
  logistic: MatrixLogistic;
  adsAmount: number;
  destination: MatrixDestination;
  listing: MatrixListing;
  shippingMode: MatrixShippingMode;
};

function isCompleteSelection(
  selection: Selection
): selection is CompleteSelection {
  return (
    selection.reputation !== null &&
    selection.logistic !== null &&
    finite(selection.adsAmount) &&
    selection.destination !== null &&
    selection.listing !== null &&
    selection.shippingMode !== null
  );
}

function evaluateMargin(
  input: PricingInput,
  selection: Selection,
  margin: number
): MarginEvaluation {
  if (!isCompleteSelection(selection)) {
    return {
      valid: false,
      price: null,
      profit: null,
      shipping: null,
      result: null,
      reason: missingChoiceReason(selection),
    };
  }

  const unsupported = unsupportedPathReason(input, selection);
  if (unsupported) {
    return {
      valid: false,
      price: null,
      profit: null,
      shipping: null,
      result: null,
      reason: unsupported,
    };
  }

  const scenarioInput = buildScenarioInput(alphaProfileInput(input), {
    adsAmount: selection.adsAmount,
    destination: selection.destination,
    listing: selection.listing,
    logistic: ALPHA_LOGISTIC,
    reputation: ALPHA_REPUTATION,
    shippingMode: selection.shippingMode,
  });
  const target = solveTarget(scenarioInput, margin, selection.listing);
  const result = target.result;
  if (
    target.price === null ||
    result === null ||
    !result.valid ||
    !finite(result.price) ||
    !finite(result.profit) ||
    !finite(result.shipping)
  ) {
    return {
      valid: false,
      price: null,
      profit: null,
      shipping: null,
      result: null,
      reason:
        target.error ??
        result?.error ??
        "Cenário indisponível para os dados informados.",
    };
  }

  if (selection.shippingMode === "auto") {
    const blockedChoiceReason = mandatoryFreeShippingChoiceReason(
      scenarioInput,
      result
    );
    if (blockedChoiceReason) {
      return {
        valid: false,
        price: null,
        profit: null,
        shipping: null,
        result: null,
        reason: blockedChoiceReason,
        blockedChoice: true,
      };
    }
  }

  return {
    valid: true,
    price: result.price,
    profit: result.profit,
    shipping: result.shipping,
    result,
  };
}

export function FlowExplorerDialog({
  input,
  goal,
  onClose,
  onApply,
}: FlowExplorerDialogProps) {
  const dialogTitleId = useId();
  const markerId = `${useId().replace(/:/g, "")}-flow-arrow`;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<Map<string, MarginEvaluation>>(new Map());
  const initialViewApplied = useRef(false);
  const requestRef = useRef(0);
  const [selection, setSelection] = useState<Selection>(() =>
    initialSelection(input, goal)
  );
  const [localGoal, setLocalGoal] = useState(goal);
  const [expanded, setExpanded] = useState<Record<StageKey, boolean>>({
    reputation: false,
    logistic: false,
    ads: false,
    destination: false,
    listing: false,
    shipping: false,
  });
  const [zoom, setZoom] = useState(0.86);
  const [storedEvaluations, setStoredEvaluations] = useState<{
    scope: string;
    values: Record<string, MarginEvaluation>;
  }>({ scope: "", values: {} });
  const [computing, setComputing] = useState(false);

  const options = useMemo<Record<StageKey, ChoiceOption[]>>(() => {
    const adsValues: number[] = [...DEFAULT_MATRIX_ADS_AMOUNTS];
    if (
      finite(input.ads) &&
      !adsValues.some(value => Math.abs(value - input.ads) < MARGIN_EPSILON)
    ) {
      adsValues.push(input.ads);
    }
    return {
      reputation: FLOW_REPUTATION_OPTIONS.filter(
        option => option.value === ALPHA_REPUTATION
      ).map(option => ({
        value: ALPHA_REPUTATION,
        label: "Verde",
        detail: option.detail,
      })),
      logistic: ALPHA_LOGISTICS.map(value => ({
        value,
        label: LOGISTIC_LABELS[value],
        detail: SHIPPING_METHODS[value].quickHelp,
      })),
      ads: adsValues.map(value => ({
        value,
        label: adsLabel(value),
        detail: DEFAULT_MATRIX_ADS_AMOUNTS.some(preset => preset === value)
          ? "Preset Alpha por venda"
          : "Valor atual mantido",
      })),
      destination: DEFAULT_MATRIX_DESTINATIONS.map(value => ({
        value,
        label: value === "inside" ? "Dentro do estado" : "Fora do estado",
        detail:
          value === "inside"
            ? "ICMS de venda dentro do estado"
            : "ICMS/DIFAL conforme perfil por destino",
      })),
      listing: DEFAULT_MATRIX_LISTINGS.map(value => ({
        value,
        label: value === "classic" ? "Clássico" : "Premium",
        detail:
          value === "classic"
            ? "Comissão do anúncio Clássico"
            : "Comissão do anúncio Premium",
      })),
      shipping: DEFAULT_MATRIX_SHIPPING_MODES.map(value => ({
        value,
        label: MATRIX_SHIPPING_LABELS[value],
        detail:
          value === "auto"
            ? "Regra obrigatória por preço mantida"
            : "Oferta opcional de frete grátis rápido",
      })),
    };
  }, [input.ads]);

  const marginOptions = useMemo(() => {
    const values: number[] = [...DEFAULT_MATRIX_MARGINS];
    if (
      finite(localGoal) &&
      !values.some(value => Math.abs(value - localGoal) < MARGIN_EPSILON)
    ) {
      values.push(localGoal);
    }
    return values;
  }, [localGoal]);

  const inputKey = useMemo(() => inputFingerprint(input), [input]);
  const selectionKey = useMemo(
    () =>
      [
        selection.reputation,
        selection.logistic,
        selection.adsAmount,
        selection.destination,
        selection.listing,
        selection.shippingMode,
      ].join("|"),
    [selection]
  );
  const evaluationScope = useMemo(
    () => flowReputationCacheKey(inputKey, selectionKey, selection.reputation),
    [inputKey, selectionKey, selection.reputation]
  );
  const evaluations = useMemo(
    () => flowReputationVisibleValues(storedEvaluations, evaluationScope),
    [storedEvaluations, evaluationScope]
  );

  useEffect(() => {
    setLocalGoal(goal);
  }, [goal]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    let cancelled = false;
    setStoredEvaluations({ scope: evaluationScope, values: {} });
    setComputing(true);

    const run = async () => {
      for (const margin of marginOptions) {
        await yieldToHost();
        if (cancelled || requestRef.current !== requestId) return;
        const marginKey = String(margin);
        const cacheKey = `${evaluationScope}|${marginKey}`;
        const cached = cacheRef.current.get(cacheKey);
        const evaluation = cached ?? evaluateMargin(input, selection, margin);
        if (!cached) cacheRef.current.set(cacheKey, evaluation);
        if (cancelled || requestRef.current !== requestId) return;
        setStoredEvaluations(previous =>
          previous.scope === evaluationScope
            ? {
                scope: evaluationScope,
                values: { ...previous.values, [marginKey]: evaluation },
              }
            : previous
        );
      }
      if (!cancelled && requestRef.current === requestId) setComputing(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    input,
    inputKey,
    selection,
    selectionKey,
    marginOptions,
    evaluationScope,
  ]);

  const stageOptions = useMemo(
    () =>
      STAGE_DEFINITIONS.map(definition => ({
        ...definition,
        options: options[definition.key],
      })),
    [options]
  );

  const graph = useMemo(() => {
    const groups: GraphNode[][] = [];
    const stageNodes: Record<StageKey, GraphNode[]> = {
      reputation: [],
      logistic: [],
      ads: [],
      destination: [],
      listing: [],
      shipping: [],
    };
    const selectedNodeValue = (key: StageKey): ChoiceValue | null =>
      choiceValue(selection, key);

    for (const stage of stageOptions) {
      const selectedValue = selectedNodeValue(stage.key);
      const visibleOptions = isFixedStage(stage.key)
        ? stage.options.filter(option => sameValue(option.value, selectedValue))
        : expanded[stage.key]
          ? stage.options
          : stage.options.filter(option =>
              sameValue(option.value, selectedValue)
            );
      const effectiveOptions = visibleOptions.length
        ? visibleOptions
        : [
            {
              value: null,
              label: "Escolha uma alternativa",
              detail: "Nenhum valor atual foi preenchido",
              unavailable: true,
            },
          ];
      stageNodes[stage.key] = effectiveOptions.map((option, index) => ({
        id: `flow-${stage.key}-${safeId(option.value)}-${index}`,
        group: stage.key,
        x: 0,
        y: 0,
        width: NODE_WIDTH,
        height: stage.key === "reputation" ? ROOT_HEIGHT : CHOICE_HEIGHT,
        title: stageChoiceLabel(stage.key, option),
        detail: option.detail,
        note: option.unavailable
          ? "Sem cotação automática"
          : stage.key === "logistic" &&
              (option.value === "flex" || option.value === "other")
            ? "Inspeção bloqueada sem tabela"
            : undefined,
        kind: "choice",
        selected: sameValue(option.value, selectedValue),
        unavailable: option.unavailable,
        stage: stage.key,
        value: option.value,
      }));
      groups.push(stageNodes[stage.key]);
    }

    const marginNodes: GraphNode[] = marginOptions.map((margin, index) => {
      const isPreset = DEFAULT_MATRIX_MARGINS.some(
        value => Math.abs(value - margin) < MARGIN_EPSILON
      );
      const evaluation = evaluations[String(margin)];
      return {
        id: `flow-margin-${safeId(margin)}-${index}`,
        group: "margin",
        x: 0,
        y: 0,
        width: NODE_WIDTH,
        height: MARGIN_HEIGHT,
        title: `Margem ${marginLabel(margin)}`,
        detail: isPreset ? "Terminal comparado" : "Meta atual mantida",
        note: evaluation?.valid
          ? undefined
          : (evaluation?.reason ??
            (computing ? "Calculando cenários…" : "Aguardando cálculo")),
        kind: "margin",
        selected:
          finite(localGoal) && Math.abs(localGoal - margin) < MARGIN_EPSILON,
        unavailable: evaluation !== undefined && !evaluation.valid,
        margin,
      };
    });
    groups.push(marginNodes);

    const routeGroups = groups.slice(0, -1);
    const layout = flowCompactLayout(
      routeGroups.map(group => group.map(node => node.height)),
      marginNodes.length,
      NODE_WIDTH,
      MARGIN_HEIGHT,
      COLUMN_WIDTH,
      ROW_GAP,
      SCENE_PADDING
    );

    routeGroups.forEach((group, groupIndex) => {
      const groupHeight =
        group.reduce((height, node) => height + node.height, 0) +
        Math.max(0, group.length - 1) * ROW_GAP;
      const top = 82 + (layout.routeHeight - groupHeight) / 2;
      group.forEach((node, rowIndex) => {
        node.x = SCENE_PADDING + groupIndex * COLUMN_WIDTH;
        node.y =
          top +
          group
            .slice(0, rowIndex)
            .reduce(
              (height, previous) => height + previous.height + ROW_GAP,
              0
            );
      });
    });
    marginNodes.forEach((node, index) => {
      node.x = SCENE_PADDING + index * layout.marginStep;
      node.y = layout.marginY;
    });

    const edges: GraphEdge[] = [];
    for (let groupIndex = 1; groupIndex < groups.length; groupIndex += 1) {
      const previousGroup = groups[groupIndex - 1];
      const currentGroup = groups[groupIndex];
      for (const from of previousGroup) {
        for (const to of currentGroup) {
          edges.push({
            id: `${from.id}-${to.id}`,
            from,
            to,
            selected: from.selected && to.selected,
          });
        }
      }
    }

    const labels = [
      ...stageOptions.map((stage, index) => ({
        label: stage.shortLabel,
        x: SCENE_PADDING + index * COLUMN_WIDTH,
        y: 34,
      })),
      {
        label: "Compare as margens",
        x: SCENE_PADDING,
        y: layout.marginY - 86,
      },
    ];

    return {
      nodes: groups.flat(),
      edges,
      labels,
      width: layout.width,
      height: layout.height,
    };
  }, [
    computing,
    evaluations,
    expanded,
    localGoal,
    marginOptions,
    options,
    selection,
    stageOptions,
  ]);

  const fitBoard = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setZoom(
      flowOverviewZoom(
        graph.width,
        graph.height,
        viewport.clientWidth,
        viewport.clientHeight
      )
    );
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }, [graph.height, graph.width]);

  const showReading = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const scale = flowReadingZoom(graph.width, viewport.clientWidth);
    setZoom(scale);
    viewport.scrollLeft = 0;
    viewport.scrollTop = Math.max(
      0,
      (graph.height * scale - viewport.clientHeight) / 2
    );
  }, [graph.height, graph.width]);

  useEffect(() => {
    if (initialViewApplied.current) return;
    const frame = requestAnimationFrame(() => {
      initialViewApplied.current = true;
      showReading();
    });
    return () => cancelAnimationFrame(frame);
  }, [showReading]);

  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const setStageValue = useCallback((stage: StageKey, value: ChoiceValue) => {
    if (isFixedStage(stage)) return;
    setSelection(previous => {
      if (stage === "reputation" && isFlowReputation(value))
        return { ...previous, reputation: value };
      if (stage === "ads" && finite(value))
        return { ...previous, adsAmount: value };
      if (
        stage === "logistic" &&
        DEFAULT_MATRIX_LOGISTICS.some(option => option === value)
      )
        return { ...previous, logistic: value as MatrixLogistic };
      if (
        stage === "destination" &&
        DEFAULT_MATRIX_DESTINATIONS.some(option => option === value)
      )
        return { ...previous, destination: value as MatrixDestination };
      if (
        stage === "listing" &&
        DEFAULT_MATRIX_LISTINGS.some(option => option === value)
      )
        return { ...previous, listing: value as MatrixListing };
      if (
        stage === "shipping" &&
        DEFAULT_MATRIX_SHIPPING_MODES.some(option => option === value)
      )
        return { ...previous, shippingMode: value as MatrixShippingMode };
      return previous;
    });
  }, []);

  const pan = useCallback((left: number, top: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({ left, top, behavior: "smooth" });
  }, []);

  const selectedEvaluation = evaluations[String(localGoal)];
  const readyToApply =
    isCompleteSelection(selection) &&
    finite(localGoal) &&
    canApplyShippingScenario(selectedEvaluation);

  const apply = useCallback(() => {
    if (!readyToApply) return;
    const nextInput = buildScenarioInput(alphaProfileInput(input), {
      adsAmount: selection.adsAmount,
      destination: selection.destination,
      listing: selection.listing,
      logistic: ALPHA_LOGISTIC,
      reputation: ALPHA_REPUTATION,
      shippingMode: selection.shippingMode,
    });
    onApply(nextInput, localGoal);
  }, [input, localGoal, onApply, readyToApply, selection]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, callback: () => void) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        callback();
      }
    },
    []
  );

  const anyExpanded = STAGE_DEFINITIONS.some(
    stage => !isFixedStage(stage.key) && expanded[stage.key]
  );
  const activeReason =
    (selectedEvaluation?.blockedChoice
      ? selectedEvaluation.reason
      : undefined) ??
    unsupportedPathReason(input, selection) ??
    missingChoiceReason(selection);
  const canvasStyle = {
    width: `${graph.width * zoom}px`,
    height: `${graph.height * zoom}px`,
  } satisfies CSSProperties;
  const sceneStyle = {
    width: `${graph.width}px`,
    height: `${graph.height}px`,
    transform: `scale(${zoom})`,
  } satisfies CSSProperties;

  return (
    <div
      className="flow-explorer__overlay"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="flow-explorer__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
      >
        <header className="flow-explorer__header">
          <span className="flow-explorer__header-icon" aria-hidden="true">
            <GitBranch size={24} />
          </span>
          <div>
            <span className="flow-explorer__eyebrow">
              Alpha E-Commerce · decisões de venda
            </span>
            <h2 id={dialogTitleId}>Fluxograma interativo</h2>
            <p>
              Compare os caminhos. O produto só muda ao clicar em{" "}
              <strong>Aplicar na calculadora</strong>.
            </p>
          </div>
          <button
            type="button"
            className="flow-explorer__close"
            aria-label="Fechar fluxograma"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="flow-explorer__notice" role="status">
          <span className="flow-explorer__notice-dot" aria-hidden="true" />
          <span>
            <strong>Perfil Alpha:</strong> Verde · Agência
          </span>
          {input.reputation !== ALPHA_REPUTATION ||
          input.logistic !== ALPHA_LOGISTIC ? (
            <span className="flow-explorer__notice-profile">
              Comparação Alpha temporária: abrir ou fechar não reescreve o
              cadastro original; <strong>Aplicar</strong> transfere
              explicitamente o perfil para Verde · Agência.
            </span>
          ) : null}
          {selectedEvaluation?.blockedChoice && selectedEvaluation.reason ? (
            <span className="flow-explorer__notice-reason">
              {selectedEvaluation.reason}
            </span>
          ) : null}
          <span className="flow-explorer__notice-count">
            <LockKeyhole size={12} aria-hidden="true" />
            {marginOptions.length} margens no trajeto ativo
          </span>
        </div>

        <div
          className="flow-explorer__stage-rail"
          aria-label="Etapas do caminho"
        >
          {stageOptions.map((stage, index) => {
            const current = choiceValue(selection, stage.key);
            const selectedOption = stage.options.find(option =>
              sameValue(option.value, current)
            );
            return (
              <div
                className={`flow-explorer__stage-card${expanded[stage.key] ? " is-expanded" : ""}${isFixedStage(stage.key) ? " is-fixed" : ""}`}
                key={stage.key}
              >
                <span className="flow-explorer__stage-index">0{index + 1}</span>
                <div className="flow-explorer__stage-copy">
                  <strong>{stage.label}</strong>
                  <span>
                    {selectedOption
                      ? stageChoiceLabel(stage.key, selectedOption)
                      : "Não informado"}
                  </span>
                </div>
                {isFixedStage(stage.key) ? (
                  <span className="flow-explorer__stage-fixed">Fixo</span>
                ) : (
                  <button
                    type="button"
                    className="flow-explorer__stage-toggle"
                    aria-expanded={expanded[stage.key]}
                    aria-label={`${expanded[stage.key] ? "Ocultar" : "Mostrar"} opções de ${stage.label}`}
                    onClick={() =>
                      setExpanded(previous => ({
                        ...previous,
                        [stage.key]: !previous[stage.key],
                      }))
                    }
                  >
                    <span>
                      {expanded[stage.key]
                        ? "Ocultar opções"
                        : `${stage.options.length} opções`}
                    </span>
                    {expanded[stage.key] ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flow-explorer__toolbar">
          <div className="flow-explorer__toolbar-copy">
            <strong>Caminho ativo</strong>
            <span>{selectionSummary(selection)}</span>
            {activeReason ? <small>{activeReason}</small> : null}
          </div>
          <div className="flow-explorer__toolbar-actions">
            <button
              type="button"
              className="flow-explorer__tool-button"
              onClick={() =>
                setExpanded({
                  reputation: false,
                  logistic: false,
                  ads: !anyExpanded,
                  destination: !anyExpanded,
                  listing: !anyExpanded,
                  shipping: !anyExpanded,
                })
              }
            >
              {anyExpanded ? "Fechar alternativas" : "Abrir alternativas"}
            </button>
            <div
              className="flow-explorer__zoom-group"
              aria-label="Controles de zoom e navegação"
            >
              <button
                type="button"
                className="flow-explorer__tool-button flow-explorer__icon-button"
                onClick={() =>
                  setZoom(value => Math.max(MIN_ZOOM, value - 0.1))
                }
                aria-label="Reduzir zoom"
              >
                −
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="flow-explorer__tool-button flow-explorer__icon-button"
                onClick={() =>
                  setZoom(value => Math.min(MAX_ZOOM, value + 0.1))
                }
                aria-label="Aumentar zoom"
              >
                +
              </button>
              <button
                type="button"
                className="flow-explorer__tool-button"
                onClick={fitBoard}
                title="Enquadrar todos os cartões; o texto fica menor nesta visão"
              >
                Visão geral
              </button>
              <button
                type="button"
                className="flow-explorer__tool-button flow-explorer__read-button"
                onClick={showReading}
                title="Ampliar para leitura; role o painel para navegar"
              >
                Leitura
              </button>
            </div>
            <div
              className="flow-explorer__pan-group"
              aria-label="Pan do fluxograma"
            >
              <button
                type="button"
                className="flow-explorer__tool-button flow-explorer__icon-button"
                onClick={() => pan(-220, 0)}
                aria-label="Mover para a esquerda"
              >
                ←
              </button>
              <button
                type="button"
                className="flow-explorer__tool-button flow-explorer__icon-button"
                onClick={() => pan(220, 0)}
                aria-label="Mover para a direita"
              >
                →
              </button>
              <button
                type="button"
                className="flow-explorer__tool-button flow-explorer__icon-button"
                onClick={() => pan(0, -180)}
                aria-label="Mover para cima"
              >
                ↑
              </button>
              <button
                type="button"
                className="flow-explorer__tool-button flow-explorer__icon-button"
                onClick={() => pan(0, 180)}
                aria-label="Mover para baixo"
              >
                ↓
              </button>
            </div>
          </div>
        </div>

        <div
          ref={viewportRef}
          className="flow-explorer__viewport"
          aria-label="Área rolável do fluxograma"
        >
          <div className="flow-explorer__canvas" style={canvasStyle}>
            <div className="flow-explorer__scene" style={sceneStyle}>
              <svg
                className="flow-explorer__edges"
                width={graph.width}
                height={graph.height}
                viewBox={`0 0 ${graph.width} ${graph.height}`}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id={markerId}
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L8,4 L0,8 z" />
                  </marker>
                </defs>
                {[...graph.edges]
                  .sort((a, b) => Number(a.selected) - Number(b.selected))
                  .map(edge => {
                    if (edge.to.kind === "margin") {
                      const right = graph.width - 8;
                      const branchY = edge.to.y - 58;
                      const targetX = edge.to.x + edge.to.width / 2;
                      return (
                        <path
                          key={edge.id}
                          className={edge.selected ? "is-selected" : ""}
                          d={`M ${edge.from.x + edge.from.width} ${edge.from.y + edge.from.height / 2} H ${right} V ${branchY} H ${targetX} V ${edge.to.y}`}
                          markerEnd={`url(#${markerId})`}
                        />
                      );
                    }
                    return (
                      <line
                        key={edge.id}
                        className={edge.selected ? "is-selected" : ""}
                        x1={edge.from.x + edge.from.width}
                        y1={edge.from.y + edge.from.height / 2}
                        x2={edge.to.x}
                        y2={edge.to.y + edge.to.height / 2}
                        markerEnd={`url(#${markerId})`}
                      />
                    );
                  })}
              </svg>

              <div className="flow-explorer__column-labels" aria-hidden="true">
                {graph.labels.map(label => (
                  <span
                    key={`${label.label}-${label.x}`}
                    style={{ left: label.x, top: label.y }}
                  >
                    {label.label}
                  </span>
                ))}
              </div>

              {graph.nodes.map(node => {
                const evaluation =
                  node.margin === undefined
                    ? undefined
                    : evaluations[String(node.margin)];
                const nodeStyle = {
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${node.width}px`,
                  minHeight: `${node.height}px`,
                } satisfies CSSProperties;
                const fixedNode =
                  node.stage !== undefined && isFixedStage(node.stage);
                const className = [
                  "flow-explorer__node",
                  node.stage === "reputation" ? "is-reputation" : "",
                  fixedNode ? "is-fixed" : "",
                  node.kind === "margin" ? "is-margin" : "",
                  node.selected ? "is-selected" : "",
                  node.unavailable ? "is-unavailable" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                if (node.kind === "margin") {
                  const isCustom = !DEFAULT_MATRIX_MARGINS.some(
                    value =>
                      Math.abs(value - (node.margin ?? Number.NaN)) <
                      MARGIN_EPSILON
                  );
                  return (
                    <button
                      type="button"
                      key={node.id}
                      className={className}
                      style={nodeStyle}
                      aria-pressed={node.selected}
                      onClick={() => {
                        if (finite(node.margin)) setLocalGoal(node.margin);
                      }}
                      onKeyDown={event =>
                        handleKeyDown(event, () => {
                          if (finite(node.margin))
                            setLocalGoal(node.margin as number);
                        })
                      }
                    >
                      <span className="flow-explorer__node-kicker">
                        Terminal {isCustom ? "personalizado" : "comparado"}
                      </span>
                      <strong>{node.title}</strong>
                      {evaluation?.valid ? (
                        <span className="flow-explorer__terminal-result">
                          <span>
                            <em>Preço</em>
                            <b>{money(evaluation.price)}</b>
                          </span>
                          <span>
                            <em>Lucro</em>
                            <b>{money(evaluation.profit)}</b>
                          </span>
                          <span>
                            <em>Frete</em>
                            <b>{money(evaluation.shipping)}</b>
                          </span>
                        </span>
                      ) : (
                        <span className="flow-explorer__node-error">
                          {computing && !evaluation
                            ? "Calculando cenários…"
                            : node.note}
                        </span>
                      )}
                      {node.selected ? (
                        <span className="flow-explorer__node-active">
                          Meta escolhida
                        </span>
                      ) : null}
                    </button>
                  );
                }

                const choiceContent = (
                  <>
                    <span className="flow-explorer__node-kicker">
                      {node.stage
                        ? STAGE_DEFINITIONS.find(
                            stage => stage.key === node.stage
                          )?.label
                        : "Escolha"}
                    </span>
                    <strong>{node.title}</strong>
                    <span className="flow-explorer__node-detail">
                      {node.detail}
                    </span>
                    {node.note ? <small>{node.note}</small> : null}
                    {node.selected ? (
                      <span className="flow-explorer__node-active">
                        {fixedNode ? "Fixo" : "No caminho ativo"}
                      </span>
                    ) : null}
                  </>
                );
                const nodeTitle =
                  node.stage === "logistic" && typeof node.value === "string"
                    ? SHIPPING_METHODS[node.value as MatrixLogistic]
                        ?.explanation
                    : undefined;
                const nodeReputation =
                  node.stage === "reputation" && isFlowReputation(node.value)
                    ? node.value
                    : undefined;

                if (fixedNode) {
                  return (
                    <div
                      key={node.id}
                      className={className}
                      style={nodeStyle}
                      data-reputation={nodeReputation}
                      title={nodeTitle}
                    >
                      {choiceContent}
                    </div>
                  );
                }

                return (
                  <button
                    type="button"
                    key={node.id}
                    className={className}
                    style={nodeStyle}
                    data-reputation={nodeReputation}
                    aria-pressed={node.selected}
                    title={nodeTitle}
                    onClick={() => {
                      if (
                        node.stage &&
                        node.value !== undefined &&
                        node.value !== null
                      )
                        setStageValue(node.stage, node.value);
                    }}
                    onKeyDown={event =>
                      handleKeyDown(event, () => {
                        if (
                          node.stage &&
                          node.value !== undefined &&
                          node.value !== null
                        )
                          setStageValue(node.stage, node.value);
                      })
                    }
                  >
                    {choiceContent}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="flow-explorer__footer">
          <div className="flow-explorer__footer-copy">
            <strong>
              Meta ao aplicar:{" "}
              {finite(localGoal) ? marginLabel(localGoal) : "não informada"}
            </strong>
            <span>
              {computing
                ? "Calculando as margens do caminho ativo…"
                : "Valores inválidos permanecem indisponíveis; nenhum R$0 é criado."}
            </span>
          </div>
          <div
            className="flow-explorer__summary"
            aria-label="Resumo do caminho selecionado"
            aria-live="polite"
          >
            <span>
              <small>Preço de venda</small>
              <b>
                {money(
                  selectedEvaluation?.valid ? selectedEvaluation.price : null
                )}
              </b>
            </span>
            <span>
              <small>Lucro</small>
              <b>
                {money(
                  selectedEvaluation?.valid ? selectedEvaluation.profit : null
                )}
              </b>
            </span>
            <span>
              <small>Frete</small>
              <b>
                {money(
                  selectedEvaluation?.valid ? selectedEvaluation.shipping : null
                )}
              </b>
            </span>
          </div>
          <div className="flow-explorer__footer-actions">
            <button
              type="button"
              className="flow-explorer__cancel"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="flow-explorer__apply"
              onClick={apply}
              disabled={!readyToApply}
            >
              Aplicar na calculadora
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export default FlowExplorerDialog;
