import { Plus, Trash2 } from "lucide-react";
import { money as roundMoney, type KitItem } from "@shared/alpha/pricing";
import { money as formatMoney } from "@/alpha/lib/format";
import { NumberField } from "./PricingFields";

export interface KitItemsEditorProps {
  items: KitItem[];
  onChange: (items: KitItem[]) => void;
}

function createEmptyKitItem(): KitItem {
  return {
    id: crypto.randomUUID(),
    description: "",
    sku: "",
    quantity: 1,
    unitCost: 0,
  };
}

function isValidQuantity(quantity: number): boolean {
  return (
    Number.isFinite(quantity) && Number.isInteger(quantity) && quantity > 0
  );
}

function itemSubtotal(item: KitItem): number | null {
  if (!isValidQuantity(item.quantity)) return null;
  if (!Number.isFinite(item.unitCost) || item.unitCost < 0) return null;

  const subtotal = item.quantity * item.unitCost;
  return Number.isFinite(subtotal) ? roundMoney(subtotal) : null;
}

function acquisitionTotal(subtotals: Array<number | null>): number | null {
  if (subtotals.length === 0) return null;
  let total = 0;
  for (const subtotal of subtotals) {
    if (subtotal === null) return null;
    total += subtotal;
  }
  return roundMoney(total);
}

export function KitItemsEditor({ items, onChange }: KitItemsEditorProps) {
  const subtotals = items.map(itemSubtotal);
  const totalItems = items.reduce(
    (total, item) =>
      total + (isValidQuantity(item.quantity) ? item.quantity : 0),
    0
  );
  const totalAcquisition = acquisitionTotal(subtotals);

  const updateItem = (index: number, patch: Partial<KitItem>) => {
    onChange(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <section className="kit-items-editor" aria-label="Itens do KIT">
      <div className="kit-items-header">
        <div>
          <h3>Itens do KIT</h3>
        </div>
        <button
          type="button"
          className="kit-items-add"
          onClick={() => onChange([...items, createEmptyKitItem()])}
        >
          <Plus size={15} aria-hidden="true" />
          Adicionar item
        </button>
      </div>

      {items.length === 0 ? (
        <div className="kit-items-empty">Adicione os itens do KIT</div>
      ) : (
        <div className="kit-items-list">
          {items.map((item, index) => {
            const subtotal = subtotals[index];
            return (
              <article className="kit-item-card" key={item.id}>
                <div className="kit-item-card-header">
                  <strong>Item {index + 1}</strong>
                  <button
                    type="button"
                    className="kit-item-remove"
                    title="Remover item"
                    aria-label={`Remover item ${index + 1}`}
                    onClick={() => removeItem(index)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>

                <div className="kit-item-text-fields">
                  <label className="kit-item-text-field">
                    <span className="kit-item-field-label">
                      Descrição do item
                    </span>
                    <input
                      className="kit-item-text-input"
                      type="text"
                      maxLength={80}
                      value={item.description}
                      aria-label="Descrição do item"
                      onChange={event =>
                        updateItem(index, { description: event.target.value })
                      }
                    />
                  </label>
                  <label className="kit-item-text-field">
                    <span className="kit-item-field-label">
                      SKU do item (opcional)
                    </span>
                    <input
                      className="kit-item-text-input"
                      type="text"
                      maxLength={80}
                      value={item.sku}
                      aria-label="SKU do item (opcional)"
                      onChange={event =>
                        updateItem(index, { sku: event.target.value })
                      }
                    />
                  </label>
                </div>

                <div className="kit-item-number-fields">
                  <NumberField
                    label="Quantidade"
                    value={item.quantity}
                    suffix="unidades"
                    onChange={quantity => updateItem(index, { quantity })}
                  />
                  <NumberField
                    label="Custo unitário"
                    value={item.unitCost}
                    prefix="R$"
                    onChange={unitCost => updateItem(index, { unitCost })}
                  />
                  <div className="kit-item-subtotal" aria-live="polite">
                    <span className="kit-item-field-label">Subtotal</span>
                    <strong>
                      {subtotal === null ? "—" : formatMoney(subtotal)}
                    </strong>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="kit-items-summary" aria-live="polite">
        <div>
          <span>Total de itens</span>
          <strong>{totalItems}</strong>
        </div>
        <div>
          <span>Total da aquisição</span>
          <strong>
            {totalAcquisition === null ? "—" : formatMoney(totalAcquisition)}
          </strong>
        </div>
      </div>
    </section>
  );
}
