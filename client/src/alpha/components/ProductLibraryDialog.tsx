import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Cloud,
  Download,
  FolderOpen,
  Loader2,
  Package,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  filterCatalogProducts,
  type ProductCatalogRecord,
} from "@shared/alpha/productCatalog";
import { Modal } from "./PricingFields";

export type ProductLibraryDialogProps = {
  records: ProductCatalogRecord[];
  onClose: () => void;
  onOpen: (record: ProductCatalogRecord) => void;
  onDelete: (record: ProductCatalogRecord) => void | Promise<void>;
  onSaveCurrent?: () => void;
  onBackup?: () => void;
  onImport?: (file: File) => void | Promise<void>;
  storageMode?: "local" | "cloud" | "pending";
  loading?: boolean;
  error?: string;
  onSignIn?: () => void;
  embedded?: boolean;
};

type TypeFilter = "all" | "single" | "kit";
type CalculationFilter = "all" | "estimated" | "real";
type StatusFilter = "all" | "draft" | "ready";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function principalSku(record: ProductCatalogRecord): string {
  const input = record.input;
  const sku = input.productType === "kit" ? input.kitSku : input.productSku;
  return typeof sku === "string" ? sku : "";
}

function recordDate(record: ProductCatalogRecord): number {
  const updated = Date.parse(record.updatedAt);
  if (Number.isFinite(updated)) return updated;
  const created = Date.parse(record.createdAt);
  return Number.isFinite(created) ? created : 0;
}

function formatRecordDate(record: ProductCatalogRecord): string {
  const value = record.updatedAt || record.createdAt;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Data não informada";
  return `Atualizado em ${dateFormatter.format(parsed)}`;
}

function storageNote(mode: ProductLibraryDialogProps["storageMode"]): string {
  if (mode === "cloud") return "Catálogo privado da sua conta";
  if (mode === "pending") return "Escolha de armazenamento em definição";
  return "Salvo neste navegador. Baixe um backup para guardar fora dele.";
}

function isReadyPrice(record: ProductCatalogRecord): boolean {
  return (
    record.status === "ready" &&
    record.resultPrice !== null &&
    Number.isFinite(record.resultPrice)
  );
}

function resultLabel(record: ProductCatalogRecord): string {
  return isReadyPrice(record)
    ? moneyFormatter.format(record.resultPrice as number)
    : "—";
}

function productKind(record: ProductCatalogRecord): string {
  return record.input.productType === "kit" ? "KIT" : "Produto único";
}

function calculationLabel(record: ProductCatalogRecord): string {
  return record.input.calculationType === "real"
    ? "Cálculo Real"
    : "Cálculo Estimado";
}

function statusLabel(record: ProductCatalogRecord): string {
  return record.status === "ready"
    ? "Pronto para calcular"
    : "Cadastro incompleto";
}

function ProductLibraryFrame({
  embedded,
  onClose,
  children,
}: {
  embedded: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return embedded ? (
    <>{children}</>
  ) : (
    <Modal title="Meus produtos" onClose={onClose}>
      {children}
    </Modal>
  );
}

export function ProductLibraryDialog({
  records,
  onClose,
  onOpen,
  onDelete,
  onSaveCurrent,
  onBackup,
  onImport,
  storageMode = "local",
  loading = false,
  error = "",
  onSignIn,
  embedded = false,
}: ProductLibraryDialogProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [calculationFilter, setCalculationFilter] =
    useState<CalculationFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  const orderedRecords = useMemo(
    () =>
      [...records].sort((a, b) => {
        const byDate = recordDate(b) - recordDate(a);
        return byDate || a.id.localeCompare(b.id, "pt-BR");
      }),
    [records]
  );

  const filteredRecords = useMemo(
    () =>
      filterCatalogProducts(orderedRecords, {
        query,
        productType: typeFilter,
        calculationType: calculationFilter,
        status: statusFilter,
      }),
    [calculationFilter, orderedRecords, query, statusFilter, typeFilter]
  );

  const hasActiveFilters =
    query.trim() !== "" ||
    typeFilter !== "all" ||
    calculationFilter !== "all" ||
    statusFilter !== "all";

  function clearFilters() {
    setQuery("");
    setTypeFilter("all");
    setCalculationFilter("all");
    setStatusFilter("all");
  }

  function openRecord(record: ProductCatalogRecord) {
    onOpen(record);
    onClose();
  }

  function askDelete(record: ProductCatalogRecord) {
    setPendingDeleteId(current => (current === record.id ? null : record.id));
  }

  async function deleteRecord(record: ProductCatalogRecord) {
    setDeletingId(record.id);
    try {
      await onDelete(record);
      setPendingDeleteId(null);
    } catch {
      // The storage adapter exposes the error and preserves the confirmation.
    } finally {
      setDeletingId(null);
    }
  }

  async function importBackup(file: File) {
    if (!onImport) return;
    setImporting(true);
    setImportError("");
    try {
      await onImport(file);
    } catch (caught) {
      setImportError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível importar este backup JSON."
      );
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  return (
    <ProductLibraryFrame embedded={embedded} onClose={onClose}>
      <div className="catalog-dialog" aria-busy={loading || importing}>
        <div className="catalog-toolbar">
          <div className="catalog-intro">
            <div>
              <p className="catalog-eyebrow">Catálogo de produtos</p>
              <h3>Seus produtos salvos</h3>
              <p>
                Encontre uma simulação e continue de onde parou, sem sair da
                calculadora.
              </p>
            </div>
            <span
              className="catalog-count"
              aria-label={`${records.length} produtos salvos`}
            >
              {records.length} {records.length === 1 ? "produto" : "produtos"}
            </span>
          </div>

          <div className="catalog-storage-row">
            <div className="catalog-storage-note">
              {storageMode === "cloud" ? (
                <Cloud size={14} />
              ) : (
                <FolderOpen size={14} />
              )}
              <span>{storageNote(storageMode)}</span>
            </div>
            <div className="catalog-utility-actions">
              {onBackup && (
                <button
                  type="button"
                  className="catalog-secondary-button"
                  onClick={onBackup}
                  disabled={loading || importing}
                >
                  <Download size={14} /> Baixar backup
                </button>
              )}
              {onImport && (
                <>
                  <input
                    ref={importInputRef}
                    className="catalog-file-input"
                    id="catalog-import-backup"
                    type="file"
                    accept="application/json,.json"
                    onChange={event => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void importBackup(file);
                    }}
                  />
                  <label
                    className="catalog-secondary-button catalog-file-label"
                    htmlFor="catalog-import-backup"
                  >
                    {importing ? (
                      <Loader2 size={14} className="catalog-spin" />
                    ) : (
                      <Upload size={14} />
                    )}
                    Importar backup JSON
                  </label>
                </>
              )}
              {onSignIn && (
                <button
                  type="button"
                  className="catalog-signin-button"
                  onClick={onSignIn}
                  disabled={loading || importing}
                >
                  Entrar na conta
                </button>
              )}
            </div>
          </div>

          <div className="catalog-search-row">
            <label className="catalog-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Buscar por nome, SKU ou componente"
                aria-label="Buscar produtos por nome, SKU ou componente"
              />
              {query && (
                <button
                  type="button"
                  className="catalog-clear-search"
                  onClick={() => setQuery("")}
                  aria-label="Limpar busca"
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <div className="catalog-filters" aria-label="Filtros do catálogo">
              <label className="catalog-select-wrap">
                <span>Tipo</span>
                <select
                  value={typeFilter}
                  onChange={event =>
                    setTypeFilter(event.target.value as TypeFilter)
                  }
                  aria-label="Filtrar por tipo de produto"
                >
                  <option value="all">Todos os tipos</option>
                  <option value="single">Produto único</option>
                  <option value="kit">KIT</option>
                </select>
                <ChevronDown size={13} aria-hidden="true" />
              </label>
              <label className="catalog-select-wrap">
                <span>Cálculo</span>
                <select
                  value={calculationFilter}
                  onChange={event =>
                    setCalculationFilter(
                      event.target.value as CalculationFilter
                    )
                  }
                  aria-label="Filtrar por tipo de cálculo"
                >
                  <option value="all">Todos os cálculos</option>
                  <option value="estimated">Cálculo Estimado</option>
                  <option value="real">Cálculo Real</option>
                </select>
                <ChevronDown size={13} aria-hidden="true" />
              </label>
              <label className="catalog-select-wrap">
                <span>Status</span>
                <select
                  value={statusFilter}
                  onChange={event =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                  aria-label="Filtrar por status"
                >
                  <option value="all">Todos os status</option>
                  <option value="draft">Cadastro incompleto</option>
                  <option value="ready">Pronto para calcular</option>
                </select>
                <ChevronDown size={13} aria-hidden="true" />
              </label>
            </div>
          </div>
        </div>

        {loading && (
          <div className="catalog-feedback catalog-loading" role="status">
            <Loader2 size={16} className="catalog-spin" />
            <span>Carregando seus produtos…</span>
          </div>
        )}
        {(error || importError) && (
          <div className="catalog-feedback catalog-error" role="alert">
            {error || importError}
          </div>
        )}

        {records.length === 0 ? (
          <div className="catalog-empty">
            <div className="catalog-empty-icon" aria-hidden="true">
              <Package size={24} />
            </div>
            <h3>
              {onSignIn
                ? "Seu catálogo é privado"
                : "Seu catálogo ainda está vazio"}
            </h3>
            <p>
              {onSignIn
                ? "Seus cadastros ficam no histórico deste sistema, na nuvem privada. Entre para acessar e salvar os produtos da sua conta."
                : "Você pode salvar mesmo sem completar o frete e continuar o cadastro depois."}
            </p>
            {onSaveCurrent && !onSignIn && (
              <button
                type="button"
                className="catalog-primary-button"
                onClick={onSaveCurrent}
                disabled={loading || importing}
              >
                <Check size={15} /> Salvar produto atual
              </button>
            )}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="catalog-empty catalog-empty-filtered">
            <div className="catalog-empty-icon" aria-hidden="true">
              <Search size={22} />
            </div>
            <h3>Nenhum produto encontrado</h3>
            <p>Altere a busca ou os filtros para ver outros produtos.</p>
            {hasActiveFilters && (
              <button
                type="button"
                className="catalog-secondary-button"
                onClick={clearFilters}
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="catalog-list" aria-label="Produtos salvos">
            {filteredRecords.map(record => {
              const sku = principalSku(record).trim() || "Sem SKU";
              const componentCount = record.input.kitItems?.length ?? 0;
              const category =
                record.categoryAnswer?.category || record.input.category;
              const isPendingDelete = pendingDeleteId === record.id;
              const isDeleting = deletingId === record.id;
              return (
                <article className="catalog-card" key={record.id}>
                  <div className="catalog-card-main">
                    <div className="catalog-card-heading">
                      <div className="catalog-card-title-wrap">
                        <h3>
                          {(typeof record.input.description === "string"
                            ? record.input.description.trim()
                            : "") || "Produto sem nome"}
                        </h3>
                        <span
                          className={`catalog-status catalog-status-${record.status}`}
                        >
                          <span
                            className="catalog-status-dot"
                            aria-hidden="true"
                          />
                          {statusLabel(record)}
                        </span>
                      </div>
                      <div
                        className="catalog-result"
                        aria-label="Preço calculado"
                      >
                        <span>Preço</span>
                        <strong>{resultLabel(record)}</strong>
                      </div>
                    </div>
                    <div className="catalog-card-meta">
                      <span>{productKind(record)}</span>
                      <span>{calculationLabel(record)}</span>
                      <span className="catalog-sku">SKU: {sku}</span>
                      {record.mode === "target" &&
                        Number.isFinite(record.goal) && (
                          <span>Meta: {record.goal}%</span>
                        )}
                    </div>
                    <div className="catalog-card-details">
                      <span>{formatRecordDate(record)}</span>
                      {componentCount > 0 && (
                        <span>
                          {componentCount}{" "}
                          {componentCount === 1 ? "componente" : "componentes"}
                        </span>
                      )}
                      {category && (
                        <span className="catalog-category">{category}</span>
                      )}
                    </div>
                  </div>
                  <div className="catalog-card-actions">
                    <button
                      type="button"
                      className="catalog-open-button"
                      onClick={() => openRecord(record)}
                      disabled={isDeleting || importing}
                    >
                      <FolderOpen size={14} /> Abrir na calculadora
                    </button>
                    {!isPendingDelete ? (
                      <button
                        type="button"
                        className="catalog-delete-button"
                        onClick={() => askDelete(record)}
                        disabled={isDeleting || importing}
                        aria-label={`Excluir ${record.input.description || "produto"}`}
                      >
                        <Trash2 size={14} /> Excluir
                      </button>
                    ) : (
                      <div
                        className="catalog-delete-confirm"
                        role="group"
                        aria-label="Confirmar exclusão"
                      >
                        <span>Excluir este produto?</span>
                        <button
                          type="button"
                          className="catalog-cancel-button"
                          onClick={() => setPendingDeleteId(null)}
                          disabled={isDeleting}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="catalog-confirm-delete-button"
                          onClick={() => void deleteRecord(record)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <Loader2 size={13} className="catalog-spin" />
                          ) : (
                            "Excluir"
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </ProductLibraryFrame>
  );
}

export default ProductLibraryDialog;
