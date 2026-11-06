import { describe, expect, it } from "vitest";
import {
  isMercatoNavItemActive,
  LEGACY_MERCATO_ROUTES,
  MERCATO_MENU_GROUPS,
  PACKAGING_SHEET_PATH,
  resolveLegacyMercatoPath,
  RETIRED_MODULE_PATHS,
  SKU_SHEET_PATH,
} from "./mercatoNavigation";

const items = MERCATO_MENU_GROUPS.flatMap((group) => group.items);

describe("Navegação principal do Mercato", () => {
  it("mantém as telas solicitadas, SKU principal, precificação, publicidade e configurações", () => {
    expect(items.map((item) => item.id)).toEqual([
      "painel", "vendas", "anuncios", "projeto", "sku", "calculadora", "publicidade", "configuracoes",
    ]);
    expect(items.find((item) => item.id === "sku")?.path).toBe(SKU_SHEET_PATH);
    expect(new Set(items.map((item) => item.path)).size).toBe(items.length);
  });

  it("não oferece telas retiradas nem grupo Em construção", () => {
    expect(MERCATO_MENU_GROUPS.some((group) => group.title === "Em construção")).toBe(false);
    for (const retired of RETIRED_MODULE_PATHS) {
      expect(items.some((item) => item.path === retired)).toBe(false);
      expect(resolveLegacyMercatoPath(retired)).toBe("/");
    }
    expect(items.some((item) => item.path.startsWith("/luis-timeline"))).toBe(false);
    expect(items.some((item) => item.path.startsWith("/pedro-timeline"))).toBe(false);
  });

  it.each([
    "/pedro-timeline", "/pedro-timeline/", "/pedro-timeline/timeline",
    "/pedro-timeline/analise", "/pedro-timeline/planilha-sku",
    "/pedro-timeline/planilha-sku?produto=38",
  ])("abre a planilha diretamente pelo antigo endereço %s", (path) => {
    expect(resolveLegacyMercatoPath(path)).toBe(SKU_SHEET_PATH);
  });

  it("preserva o acesso à planilha Embalagens", () => {
    expect(resolveLegacyMercatoPath("/pedro-timeline/embalagens")).toBe(PACKAGING_SHEET_PATH);
  });

  it.each(["luis", "pedro"])("preserva o ID do produto no atalho antigo de %s", (name) => {
    expect(resolveLegacyMercatoPath(`/${name}-timeline/produto/330001`)).toBe("/projeto/produto/330001");
  });

  it("leva o acesso da negociação ao Projeto mantido", () => {
    for (const path of ["/luis-timeline", "/luis-timeline/timeline", "/luis-timeline/analise"]) {
      expect(resolveLegacyMercatoPath(path)).toBe("/projeto");
    }
  });

  it("não redireciona páginas atuais nem inventa um ID de produto", () => {
    expect(resolveLegacyMercatoPath(SKU_SHEET_PATH)).toBeNull();
    expect(resolveLegacyMercatoPath("/projeto/produto/38")).toBeNull();
    expect(resolveLegacyMercatoPath("/pedro-timeline/produto/invalid" )).toBeNull();
    expect(LEGACY_MERCATO_ROUTES).toContain("/pedro-timeline/produto/:id");
  });

  it("destaca SKU ao abrir embalagens, sem destacar Painel", () => {
    const sku = items.find((item) => item.id === "sku")!;
    const painel = items.find((item) => item.id === "painel")!;
    expect(isMercatoNavItemActive(sku, PACKAGING_SHEET_PATH)).toBe(true);
    expect(isMercatoNavItemActive(sku, "/pedro-timeline/planilha-sku")).toBe(true);
    expect(isMercatoNavItemActive(painel, PACKAGING_SHEET_PATH)).toBe(false);
    expect(isMercatoNavItemActive(sku, "/planilha-sku-inexistente")).toBe(false);
  });

  it("destaca Projeto também no detalhe sem confundir prefixos", () => {
    const project = items.find((item) => item.id === "projeto")!;
    expect(isMercatoNavItemActive(project, "/projeto/produto/42")).toBe(true);
    expect(isMercatoNavItemActive(project, "/luis-timeline/produto/42")).toBe(true);
    expect(isMercatoNavItemActive(project, "/projeto-antigo")).toBe(false);
  });
});
