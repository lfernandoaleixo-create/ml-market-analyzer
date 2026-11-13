// Autoria: Manus e Fernando. Somente proteção local; não envia nem armazena gravações.
import { MutationCache, onlineManager } from "@tanstack/react-query";

export const MERCATO_OFFLINE_MESSAGE =
  "Sem conexão de rede. Reconecte à internet para editar e salvar. Esta ação não foi executada nem agendada; tente novamente quando estiver online.";

function isOffline() {
  return (
    (typeof navigator !== "undefined" && navigator.onLine === false) ||
    !onlineManager.isOnline()
  );
}

/** Use with defaultOptions.mutations = { networkMode: 'always', retry: false }.
 * TanStack awaits this global hook BEFORE the local optimistic onMutate.
 * Throwing here makes a new offline mutation fail, rather than pause/resume.
 */
export function createMercatoMutationCache() {
  return new MutationCache({
    onMutate() {
      if (isOffline()) throw new Error(MERCATO_OFFLINE_MESSAGE);
    },
  });
}

const controls =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="checkbox"], [role="switch"], [role="radio"], [role="combobox"], [role="spinbutton"], [role="slider"], [role="option"]';
const buttons =
  'button, [role="button"], [role="menuitem"], input[type="submit"], input[type="button"], input[type="reset"]';
const navigation =
  'a[href], [role="link"], [role="tab"], [data-sidebar="menu-button"], [data-sidebar="trigger"], [data-sidebar="rail"], [data-slot="sidebar-trigger"], [aria-haspopup="menu"], [data-slot="dialog-close"], [data-slot="alert-dialog-cancel"]';
const safeName =
  /^(cancelar|cancel|fechar|close|copiar|copy|voltar|back|navegar|navigate|instalar|install|entendi|historico|colunas|exportar)\b|^(abrir|recolher|expandir|alternar|toggle|open|collapse|expand)\s+(o\s+)?(menu|sidebar|navegacao)\b/;
const actionName =
  /^(sim[,\s]+)?(salvar|save|criar|create|adicionar|add|excluir|delete|remover|remove|editar|edit|atualizar|update|confirmar|confirm|aplicar|apply|enviar|send|submit|entrar|login|gerar|generate|definir|escolher|reutilizar|limpar|clear|bloquear|desbloquear|marcar|vincular|desvincular|importar|sincronizar|duplicar|restaurar|redefinir|nova|novo|cor)\b|^manter o mesmo sku\b/;

function accessibleName(element: Element) {
  const labelledBy = element
    .getAttribute("aria-labelledby")
    ?.split(/\s+/)
    .map(id => element.ownerDocument.getElementById(id)?.textContent ?? "")
    .join(" ");
  // Never guess an action from a child SVG/icon: use accessible labels/text.
  return (
    element.getAttribute("aria-label") ||
    labelledBy ||
    element.getAttribute("title") ||
    (element instanceof HTMLInputElement
      ? element.value
      : element.textContent) ||
    ""
  )
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function shouldBlock(target: Element) {
  const control = target.closest(`${buttons}, ${controls}`);
  if (
    !control ||
    control.matches(
      ':disabled, [aria-disabled="true"], [readonly], [aria-readonly="true"]'
    )
  )
    return false;
  const name = accessibleName(control);
  if (target.closest('a[href], [role="link"]')) return false;
  if (control.matches(buttons)) {
    if (control.matches(navigation) || safeName.test(name)) return false;
    if (control.closest('nav, [role="navigation"]') && !actionName.test(name))
      return false;
    // Explicit actions and unnamed native buttons (e.g. a color swatch).
    // Unknown named page/view controls remain usable; APIs still have the cache barrier.
    return (
      actionName.test(name) ||
      !name ||
      control.matches('[type="submit"], [type="reset"]')
    );
  }
  // Searching/filtering already-visible information is not a write operation.
  if (
    control.matches('[type="search"], [role="searchbox"]') ||
    /^(buscar|pesquisar|filtrar|search|filter)\b/.test(name) ||
    /^(buscar|pesquisar|filtrar|search|filter)\b/i.test(
      control.getAttribute("placeholder") ?? ""
    )
  )
    return false;
  return true;
}

/** Install once before React handlers. Returns an idempotent cleanup function.
 * Capturing input/change also covers React onChange and non-cancelable changes;
 * pointerup covers an already-open custom select; keydown covers keyboard actions.
 * Online interactions and Escape/Tab/copy shortcuts are left untouched.
 */
export function installOnlineInteractionGuard(
  notify: (message: string) => void
) {
  if (typeof window === "undefined" || typeof document === "undefined")
    return () => {};
  const events = [
    "click",
    "beforeinput",
    "input",
    "change",
    "pointerup",
    "keydown",
    "submit",
  ] as const;
  const guard = (event: Event) => {
    if (!isOffline()) return;
    const target = event.composedPath().find(node => node instanceof Element);
    if (!(target instanceof Element)) return;
    if (event instanceof KeyboardEvent) {
      if (
        event.key === "Escape" ||
        event.key === "Tab" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (
        event.key.length !== 1 &&
        ![
          "Enter",
          "Backspace",
          "Delete",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          "PageUp",
          "PageDown",
        ].includes(event.key)
      )
        return;
    }
    const formSubmit =
      event.type === "submit" && target instanceof HTMLFormElement;
    if (
      formSubmit
        ? !!target.closest('nav, [role="search"]')
        : !shouldBlock(target)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notify(MERCATO_OFFLINE_MESSAGE);
  };
  for (const event of events) window.addEventListener(event, guard, true);
  return () => {
    for (const event of events) window.removeEventListener(event, guard, true);
  };
}
