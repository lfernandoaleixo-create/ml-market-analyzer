export const MAX_ALPHA_PDF_BYTES = 15 * 1024 * 1024;

/** Encode bytes exactly; unlike spreading the whole PDF this is safe for large files. */
export function alphaPdfBase64(bytes: Uint8Array): string {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ALPHA_PDF_BYTES) {
    throw new Error("O PDF precisa ter conteúdo e no máximo 15 MB para ser salvo no Mercato.");
  }
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/** Keep non-finite values explicit instead of silently converting them to null. */
export function encodeAlphaReportSnapshot(record: unknown): string {
  return JSON.stringify(record, (_key, value) => {
    if (typeof value === "number" && !Number.isFinite(value)) {
      return { $alphaNumber: Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity" };
    }
    return value;
  });
}

/** A label rename is not a new destination; only its real ID and owner define the attempt. */
export function alphaPdfAttemptSignature(record: unknown, destination: { ownerId: number; projectProductId: number | null; label?: string }, options: unknown): string {
  return JSON.stringify({ record: encodeAlphaReportSnapshot(record), ownerId: destination.ownerId, projectProductId: destination.projectProductId, options });
}

export function projectIdFromSearch(search: string): number | null {
  const value = new URLSearchParams(search).get("projectProductId");
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function normalizeProjectProductName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Suggestions never identify a record automatically: a user must select its real Project ID. */
export function matchingProjectProducts<T extends { id: number; name: string }>(description: string, projects: readonly T[]): T[] {
  const query = normalizeProjectProductName(description);
  if (query.length < 2) return [];
  return projects.filter((product) => {
    const name = normalizeProjectProductName(product.name);
    return name.length >= 2 && (name.includes(query) || (` ${query} `).includes(` ${name} `));
  }).sort((left, right) => {
    const exactLeft = normalizeProjectProductName(left.name) === query ? 0 : 1;
    const exactRight = normalizeProjectProductName(right.name) === query ? 0 : 1;
    return exactLeft - exactRight || left.name.localeCompare(right.name, "pt-BR");
  });
}

export function alphaPdfFilename(input: { name: string; scope: "selected" | "compact" | "complete"; exportId: string; createdAt: Date; includeProductSheet: boolean }): string {
  const name = (input.name || "produto").replace(/[^a-zA-Z0-9À-ÿ_-]/g, "-").replace(/-+/g, "-").slice(0, 65);
  const scope = input.scope === "compact" ? "fluxos-compactos" : input.scope === "complete" ? "fluxos-completos" : "fluxo-selecionado";
  const stamp = input.createdAt.toISOString().replace(/[:.]/g, "-");
  return `CalculadoraFinal-${name}-${scope}${input.includeProductSheet ? "-com-ficha" : ""}-${stamp}-${input.exportId}.pdf`;
}
