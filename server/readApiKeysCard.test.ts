import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  READ_API_ROUTES,
  READ_API_SCOPES,
  type ReadApiKeyMetadata,
} from "../shared/readApi";

const state = vi.hoisted(() => ({
  user: { id: 1, role: "admin" } as { id: number; role: string } | null,
  authLoading: false,
  data: [] as ReadApiKeyMetadata[],
  listLoading: false,
  listFetching: false,
  listError: null as Error | null,
  hooks: [] as any[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  inputs: [] as any[],
  checkboxes: [] as any[],
  buttons: [] as any[],
  form: null as any,
  select: null as any,
  create: {
    isPending: false,
    data: undefined as unknown,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
  },
  revoke: {
    isPending: false,
    variables: undefined as { id: number } | undefined,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
  },
  listQuery: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
  clipboard: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

// SSR does not commit state/effects. A tiny hook harness lets handlers update
// the next SSR render without adding a DOM/browser dependency or reading source.
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.cursor++;
      if (!(index in state.hooks)) {
        state.hooks[index] =
          typeof initial === "function" ? initial() : initial;
      }
      return [
        state.hooks[index],
        (next: unknown) => {
          state.hooks[index] =
            typeof next === "function" ? next(state.hooks[index]) : next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = state.cursor++;
      if (!(index in state.hooks)) state.hooks[index] = { current: initial };
      return state.hooks[index];
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const index = state.cursor++;
      const previous = state.hooks[index] as unknown[] | undefined;
      if (
        !deps ||
        !previous ||
        deps.some((value, i) => !Object.is(value, previous[i]))
      ) {
        state.effects.push(effect);
        state.hooks[index] = deps;
      }
    },
  };
});
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: state.user, loading: state.authLoading }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      readApiKeys: { list: { invalidate: state.invalidate } },
    }),
    readApiKeys: {
      list: {
        useQuery: (...args: unknown[]) => {
          state.listQuery(...args);
          return {
            data: state.data,
            isLoading: state.listLoading,
            isFetching: state.listFetching,
            error: state.listError,
            refetch: state.refetch,
          };
        },
      },
      create: { useMutation: () => state.create },
      revoke: { useMutation: () => state.revoke },
    },
  },
}));
vi.mock("sonner", () => ({
  toast: { success: state.success, error: state.error },
}));
vi.mock("@/components/ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: (props: any) => {
      state.buttons.push(props);
      if (props.asChild) return props.children;
      const { variant, size, asChild, ...attributes } = props;
      return createElement("button", attributes);
    },
  };
});
vi.mock("@/components/ui/input", async () => {
  const { createElement } = await import("react");
  return {
    Input: (props: any) => {
      state.inputs.push(props);
      return createElement("input", props);
    },
  };
});
vi.mock("@/components/ui/checkbox", async () => {
  const { createElement } = await import("react");
  return {
    Checkbox: (props: any) => {
      state.checkboxes.push(props);
      const { onCheckedChange, ...attributes } = props;
      return createElement("input", {
        ...attributes,
        type: "checkbox",
        readOnly: true,
      });
    },
  };
});
vi.mock("@/components/ui/select", async () => {
  const { createElement } = await import("react");
  const Wrapper = ({ children, id }: any) =>
    createElement("div", { id }, children);
  return {
    Select: (props: any) => {
      state.select = props;
      return createElement(
        "div",
        { "data-value": props.value },
        props.children
      );
    },
    SelectTrigger: Wrapper,
    SelectContent: Wrapper,
    SelectItem: Wrapper,
    SelectValue: () => null,
  };
});

import ReadApiKeysCard from "../client/src/components/settings/ReadApiKeysCard";

const metadata: ReadApiKeyMetadata = {
  id: 42,
  name: "IA comercial",
  prefix: "read_test_prefix",
  scopes: ["mercado:read"],
  createdAt: new Date("2026-11-01T12:00:00Z"),
  expiresAt: new Date("2099-12-01T12:00:00Z"),
  revokedAt: null,
};
const plaintext = "TEST_ONLY_PLAINTEXT_NEVER_A_REAL_KEY";

function text(children: any): string {
  if (Array.isArray(children)) return children.map(text).join("");
  if (typeof children === "string" || typeof children === "number")
    return String(children);
  return children?.props ? text(children.props.children) : "";
}
function button(label: string) {
  const found = state.buttons.find(
    props => text(props.children).trim() === label
  );
  expect(found, `Botão ${label}`).toBeDefined();
  return found;
}
function findForm(node: any): any {
  if (!node || typeof node !== "object") return null;
  if (node.type === "form") return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = findForm(child);
    if (found) return found;
  }
  return null;
}
function Capture() {
  const element = ReadApiKeysCard();
  state.form = findForm(element);
  return element;
}
function render() {
  state.cursor = 0;
  state.effects = [];
  state.buttons = [];
  state.inputs = [];
  state.checkboxes = [];
  const html = renderToStaticMarkup(React.createElement(Capture));
  for (const effect of state.effects) effect();
  return html;
}
// Capture the actual form handler without replacing the component being tested.
async function submit() {
  render();
  expect(state.form).not.toBeNull();
  await state.form.props.onSubmit({ preventDefault: vi.fn() });
}
function setName(value: string) {
  state.inputs[0].onChange({ target: { value } });
}
async function generate() {
  render();
  setName("  IA comercial  ");
  await submit();
  return render();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", {
    location: { origin: "https://app.example" },
    confirm: state.confirm,
  });
  vi.stubGlobal("navigator", { clipboard: { writeText: state.clipboard } });
  state.user = { id: 1, role: "admin" };
  state.authLoading = false;
  state.data = [];
  state.listLoading = false;
  state.listFetching = false;
  state.listError = null;
  state.hooks = [];
  state.cursor = 0;
  state.effects = [];
  state.create.isPending = false;
  state.create.data = undefined;
  state.revoke.isPending = false;
  state.revoke.variables = undefined;
  state.create.reset.mockImplementation(() => {
    state.create.data = undefined;
  });
  state.create.mutateAsync.mockImplementation(async () => {
    const result = { key: plaintext, metadata };
    state.create.data = result;
    return result;
  });
  state.revoke.mutateAsync.mockResolvedValue({ success: true });
  state.invalidate.mockResolvedValue(undefined);
  state.clipboard.mockResolvedValue(undefined);
  state.confirm.mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe("ReadApiKeysCard — permissões e exposição única", () => {
  it.each([null, { id: 1, role: "user" }])(
    "não administrador recebe aviso e consulta desabilitada (%j)",
    user => {
      state.user = user;
      state.data = [metadata];
      const html = render();
      expect(html).toContain("Somente administradores");
      expect(html).not.toContain(metadata.name);
      expect(html).not.toContain("Gerar chave de leitura");
      expect(state.listQuery).toHaveBeenCalledWith(undefined, {
        enabled: false,
        retry: false,
      });
      expect(state.create.mutateAsync).not.toHaveBeenCalled();
    }
  );
  it("aguarda autenticação e não consulta chaves durante loading", () => {
    state.authLoading = true;
    expect(render()).toContain("Verificando sua permissão");
    expect(state.listQuery).toHaveBeenCalledWith(undefined, {
      enabled: false,
      retry: false,
    });
  });
  it("admin tem default 30 dias e somente mercado:read; nenhuma chave é gerada automaticamente", () => {
    const html = render();
    expect(html).toContain("Nenhuma chave criada");
    expect(state.select.value).toBe("30");
    expect(
      state.checkboxes
        .filter(props => props.checked)
        .map(props => props.id.split("-").pop())
    ).toEqual(["mercado:read"]);
    expect(state.checkboxes).toHaveLength(READ_API_SCOPES.length);
    expect(state.listQuery).toHaveBeenCalledWith(undefined, {
      enabled: true,
      retry: false,
    });
    expect(state.create.mutateAsync).not.toHaveBeenCalled();
    expect(html).not.toContain(plaintext);
  });
  it("valida nome e pelo menos um escopo sem chamar backend", async () => {
    render();
    await submit();
    expect(render()).toContain("Informe um nome");
    setName("IA");
    state.checkboxes
      .find(props => props.id.endsWith("mercado:read"))
      .onCheckedChange(false);
    await submit();
    expect(render()).toContain("Selecione pelo menos um escopo");
    expect(state.create.mutateAsync).not.toHaveBeenCalled();
  });
  it("gera explicitamente, mostra a chave só na área temporária e reseta o resultado da mutation", async () => {
    const html = await generate();
    expect(state.create.mutateAsync).toHaveBeenCalledWith({
      name: "IA comercial",
      scopes: ["mercado:read"],
      expiresDays: 30,
    });
    expect(html).toContain("esta chave aparece uma única vez");
    expect(html).toContain(plaintext);
    expect(html.split(plaintext)).toHaveLength(2);
    expect(state.create.data).toBeUndefined();
    expect(state.invalidate).toHaveBeenCalledOnce();
    expect(html).toContain("SUA_CHAVE");
    await button("Copiar chave").onClick();
    expect(state.clipboard).toHaveBeenCalledWith(plaintext);
    button("Ocultar e descartar").onClick();
    expect(render()).not.toContain(plaintext);
    expect(render()).not.toContain("Copiar chave");
  });
  it("remove exposição ao sair e não restaura a chave ao entrar novamente", async () => {
    await generate();
    state.user = null;
    expect(render()).not.toContain(plaintext);
    state.user = { id: 1, role: "admin" };
    expect(render()).not.toContain(plaintext);
  });
  it("não expõe resposta que chegou depois do logout", async () => {
    let finish!: (result: {
      key: string;
      metadata: ReadApiKeyMetadata;
    }) => void;
    state.create.mutateAsync.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    render();
    setName("IA");
    const pending = submit();
    state.user = null;
    render();
    finish({ key: plaintext, metadata });
    await pending;
    state.user = { id: 1, role: "admin" };
    expect(render()).not.toContain(plaintext);
  });
  it("revogar exige confirmação, invalida a lista e descarta a chave exibida", async () => {
    state.data = [metadata];
    await generate();
    state.confirm.mockReturnValueOnce(false);
    await button("Revogar").onClick();
    expect(state.confirm.mock.calls[0][0]).toContain("Tem certeza?");
    expect(state.revoke.mutateAsync).not.toHaveBeenCalled();
    await button("Revogar").onClick();
    expect(state.revoke.mutateAsync).toHaveBeenCalledWith({ id: 42 });
    expect(state.invalidate).toHaveBeenCalledTimes(2);
    expect(render()).not.toContain(plaintext);
  });
  it("descarta a exposição quando a lista informa revogação externa", async () => {
    await generate();
    state.data = [{ ...metadata, revokedAt: new Date() }];
    render();
    expect(render()).not.toContain(plaintext);
  });
  it("lista prefixos, escopos, expiração e estados sem chave completa", () => {
    state.data = [
      metadata,
      {
        ...metadata,
        id: 43,
        name: "IA antiga",
        expiresAt: new Date("2020-01-01"),
      },
      {
        ...metadata,
        id: 44,
        name: "IA revogada",
        revokedAt: new Date("2026-11-01"),
      },
    ];
    const html = render();
    for (const label of [
      metadata.name,
      metadata.prefix,
      "mercado:read",
      "Expira em",
      "Ativa",
      "Expirada",
      "Revogada",
      "Revogada em",
    ])
      expect(html).toContain(label);
    expect(
      state.buttons.filter(props => text(props.children).trim() === "Revogar")
    ).toHaveLength(2);
    expect(html).not.toContain(plaintext);
  });
  it("renderiza loading e erro da consulta sem informar lista vazia", () => {
    state.listLoading = true;
    expect(render()).toContain("Carregando chaves");
    state.listLoading = false;
    state.listError = new Error("Servidor indisponível");
    const html = render();
    expect(html).toContain("Não foi possível carregar");
    expect(html).not.toContain("Nenhuma chave criada");
    button("Tentar novamente").onClick();
    expect(state.refetch).toHaveBeenCalledOnce();
  });
  it("mostra loading de geração e erro explícito sem exposição", async () => {
    state.create.isPending = true;
    expect(render()).toContain("Gerando chave");
    expect(button("Gerando chave…").disabled).toBe(true);
    state.create.isPending = false;
    state.create.mutateAsync.mockRejectedValueOnce(
      new Error("Falha de geração")
    );
    render();
    setName("IA");
    await submit();
    const html = render();
    expect(html).toContain("Falha de geração");
    expect(html).not.toContain(plaintext);
  });
  it("documentação pública usa placeholder, todos os endpoints e limites de leitura", () => {
    const html = render();
    expect(html).toContain("https://app.example/api/public/v1/openapi.json");
    expect(html).toContain("Authorization: Bearer SUA_CHAVE");
    expect(html).toContain("somente o schema");
    expect(html).toContain("não pode alterar anúncios, campanhas ou SKUs");
    for (const expected of [
      "60 requisições/minuto",
      "limit até 100",
      "cache de 5 minutos",
      "partial",
      "stale",
    ])
      expect(html).toContain(expected);
    for (const route of READ_API_ROUTES)
      expect(html).toContain(`GET ${route.path}`);
    button("Copiar URL OpenAPI").onClick();
    expect(state.clipboard).toHaveBeenCalledWith(
      "https://app.example/api/public/v1/openapi.json"
    );
    expect(html).not.toContain(plaintext);
  });
  it("SSR sem window usa caminho relativo seguro", () => {
    vi.stubGlobal("window", undefined);
    expect(render()).toContain('href="/api/public/v1/openapi.json"');
  });
  it("falha de clipboard mostra toast sem registrar ou armazenar a chave", async () => {
    await generate();
    state.clipboard.mockRejectedValueOnce(new Error("Permission denied"));
    await button("Copiar chave").onClick();
    expect(state.error).toHaveBeenCalledWith(
      "Não foi possível copiar. Selecione e copie o texto manualmente."
    );
    expect(
      state.success.mock.calls.every(
        args => !args.some(value => String(value).includes(plaintext))
      )
    ).toBe(true);
  });
});
