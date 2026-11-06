import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeLLM, listLLMModels } from "./llmAdapter";

vi.mock("../_core/env", () => ({ ENV: { forgeApiUrl: "https://forge.test", forgeApiKey: "mock-token-not-a-credential" } }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const params = { model: "gpt-6-luna", messages: [{ role: "user" as const, content: "Mock category" }],
  response_format: { type: "json_schema" as const, json_schema: { name: "mock", strict: true,
    schema: { type: "object", properties: {}, required: [], additionalProperties: false } } },
  reasoning: { effort: "low" } };

describe("Alpha-only cancelable LLM adapter (fetch mocks)", () => {
  it("passes actual AbortSignal to transport, not into JSON payload", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await invokeLLM({ ...params, signal: controller.signal });
    expect(fetchMock).toHaveBeenCalledWith("https://forge.test/v1/chat/completions", expect.objectContaining({ signal: controller.signal }));
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body).toMatchObject({ model: "gpt-6-luna", reasoning: { effort: "low" }, response_format: { type: "json_schema" } });
    expect(body).not.toHaveProperty("signal");
  });
  it("aborts a real in-flight fetch mock and does not retry", async () => {
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const result = invokeLLM({ ...params, signal: controller.signal });
    const expected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await expected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("aborts retry sleep after 429 immediately, preventing a second network attempt", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response("rate limit", { status: 429, headers: { "retry-after": "10" } }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const result = invokeLLM({ ...params, signal: controller.signal });
    const expected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await expected;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("refuses already-aborted requests before starting fetch", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController(); controller.abort();
    await expect(invokeLLM({ ...params, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("model catalog also supports transport cancellation", async () => {
    const fetchMock = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const result = listLLMModels(controller.signal);
    const expected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); await expected;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://forge.test/v1/models");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
