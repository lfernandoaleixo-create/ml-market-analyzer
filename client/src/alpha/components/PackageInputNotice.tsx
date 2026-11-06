import { Info } from "lucide-react";
import { getPackageInputIssues, type PricingInput } from "@shared/alpha/pricing";

const FIELD_LABELS = {
  weight: "Peso real",
  length: "Comprimento",
  width: "Largura",
  height: "Altura",
} as const;

export function PackageInputNotice({ input }: { input: PricingInput }) {
  const issue = getPackageInputIssues(input)[0];
  if (!issue) return null;

  function focusField() {
    if (!issue) return;
    const field = document.querySelector<HTMLInputElement>(
      `input[aria-label^="${FIELD_LABELS[issue.field]}"]`
    );
    field?.scrollIntoView({ behavior: "smooth", block: "center" });
    field?.focus({ preventScroll: true });
  }

  return (
    <div className="package-data-error" role="alert">
      <Info size={16} aria-hidden="true" />
      <div>
        <p>{issue.message}</p>
        <button type="button" onClick={focusField}>
          Preencher{" "}
          {issue.field === "height"
            ? "altura/espessura"
            : FIELD_LABELS[issue.field].toLowerCase()}
        </button>
      </div>
    </div>
  );
}
