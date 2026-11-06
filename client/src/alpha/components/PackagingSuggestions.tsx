import type { ReactNode } from "react";
import { Check, Package } from "lucide-react";
import {
  PACKAGING_PRESETS,
  getPackagingPreset,
  suggestPackaging,
  type PackagingPresetId,
} from "@shared/alpha/packagingCatalog";

export function PackagingSuggestions({
  description,
  category,
  selected,
  onSelect,
  children,
}: {
  description: string;
  category: string;
  selected: PackagingPresetId;
  onSelect: (id: PackagingPresetId) => void;
  children?: ReactNode;
}) {
  const suggested = suggestPackaging(description, category);
  const current = getPackagingPreset(selected);
  return (
    <section
      className="packaging-suggestions"
      aria-label="Seleção da embalagem"
    >
      <div className="packaging-title">
        <Package size={16} aria-hidden="true" />
        <strong>Selecione a embalagem</strong>
        <span className="packaging-alpha-badge">Alpha</span>
      </div>
      {suggested && (
        <div className="packaging-recommendation">
          <span>
            Sugestão:{" "}
            <strong>
              {suggested.label} · {suggested.sideA} × {suggested.sideB} cm
            </strong>
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() => onSelect(suggested.id)}
          >
            {selected === suggested.id
              ? "Selecionada"
              : `Usar ${suggested.label}`}
          </button>
        </div>
      )}
      <div
        className="packaging-presets"
        role="group"
        aria-label="Escolha uma embalagem Alpha ou preencha manualmente"
      >
        {PACKAGING_PRESETS.map(preset => (
          <button
            type="button"
            key={preset.id}
            className={`packaging-preset ${selected === preset.id ? "active" : ""} ${preset.status !== "used" ? "planning" : ""}`}
            onClick={() => onSelect(preset.id)}
            aria-pressed={selected === preset.id}
            aria-label={`Embalagem ${preset.label}, ${preset.sideA} por ${preset.sideB} centímetros, ${preset.statusLabel}`}
          >
            <span className="packaging-preset-heading">
              <strong>{preset.label}</strong>
              <b>
                {preset.sideA} × {preset.sideB} cm
              </b>
            </span>
            <small className="packaging-preset-meta">
              {preset.statusLabel}
              {preset.status !== "used" ? " · planejamento" : ""}
              {selected === preset.id && (
                <span className="packaging-preset-selected">
                  <Check size={12} strokeWidth={3} aria-hidden="true" />
                  Selecionada
                </span>
              )}
            </small>
          </button>
        ))}
        <button
          type="button"
          className={`packaging-preset packaging-manual-card ${!current ? "active" : ""}`}
          aria-pressed={!current}
          onClick={() => onSelect("custom")}
        >
          <span className="packaging-preset-heading">
            <Package size={17} />
            <strong>Outra embalagem / manual</strong>
          </span>
          <small className="packaging-preset-meta">
            Informar as três medidas
            {!current && (
              <span className="packaging-preset-selected">
                <Check size={12} strokeWidth={3} />
                Selecionada
              </span>
            )}
          </small>
        </button>
      </div>
      <div className="mt-4" aria-live="polite">
        {children}
      </div>
    </section>
  );
}
