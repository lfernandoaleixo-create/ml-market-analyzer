export const SKU_SHEET_PATH = "/planilha-sku";
export const PACKAGING_SHEET_PATH = "/planilha-sku/embalagens";

export type MercatoNavId =
  | "painel"
  | "vendas"
  | "anuncios"
  | "projeto"
  | "sku"
  | "calculadora"
  | "publicidade"
  | "configuracoes";

export type MercatoNavItem = {
  id: MercatoNavId;
  label: string;
  path: string;
};

export const MERCATO_MENU_GROUPS: { title: string | null; items: MercatoNavItem[] }[] = [
  {
    title: "Mercato",
    items: [
      { id: "painel", label: "Painel", path: "/" },
      { id: "vendas", label: "Vendas", path: "/vendas" },
      { id: "anuncios", label: "Meus anúncios", path: "/anuncios" },
      { id: "projeto", label: "Projeto", path: "/projeto" },
      { id: "sku", label: "Planilha SKU", path: SKU_SHEET_PATH },
      { id: "calculadora", label: "Calculadora de precificação", path: "/calculadora" },
      { id: "publicidade", label: "Publicidade Mercado Livre", path: "/ads" },
    ],
  },
  {
    title: null,
    items: [{ id: "configuracoes", label: "Configurações", path: "/configuracoes" }],
  },
];

/** Retired only from the interface. No records or backend tables are deleted. */
export const RETIRED_MODULE_PATHS = [
  "/lucratividade",
  "/pos-venda",
  "/reputacao",
  "/radar",
  "/buscar",
  "/mais-vendidos",
  "/oportunidades",
  "/comparar",
  "/categorias",
  "/monitoramento",
  "/alertas",
] as const;

export const LEGACY_MERCATO_ROUTES = [
  ...RETIRED_MODULE_PATHS,
  "/luis-timeline",
  "/luis-timeline/timeline",
  "/luis-timeline/analise",
  "/luis-timeline/produto/:id",
  "/pedro-timeline",
  "/pedro-timeline/timeline",
  "/pedro-timeline/analise",
  "/pedro-timeline/produto/:id",
  "/pedro-timeline/planilha-sku",
  "/pedro-timeline/embalagens",
] as const;

export function resolveLegacyMercatoPath(location: string): string | null {
  const path = location.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  const product = /^\/(?:luis|pedro)-timeline\/produto\/(\d+)$/.exec(path);
  if (product) return `/projeto/produto/${product[1]}`;
  if (path === "/pedro-timeline/embalagens") return PACKAGING_SHEET_PATH;
  if (["/pedro-timeline", "/pedro-timeline/timeline", "/pedro-timeline/analise", "/pedro-timeline/planilha-sku"].includes(path)) {
    return SKU_SHEET_PATH;
  }
  if (["/luis-timeline", "/luis-timeline/timeline", "/luis-timeline/analise"].includes(path)) {
    return "/projeto";
  }
  if ((RETIRED_MODULE_PATHS as readonly string[]).includes(path)) return "/";
  return null;
}

export function isMercatoNavItemActive(item: MercatoNavItem, location: string): boolean {
  const path = resolveLegacyMercatoPath(location) ?? location.split(/[?#]/)[0];
  return path === item.path || (item.path !== "/" && path.startsWith(`${item.path}/`));
}
