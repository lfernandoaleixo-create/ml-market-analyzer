import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

/**
 * Defensive DOM patch for browser translation extensions (e.g. Google Translate).
 *
 * Those extensions mutate text nodes directly. When React 19 later tries to
 * remove/insert nodes it sometimes finds them already detached, throwing
 * "NotFoundError: Failed to execute 'removeChild' on 'Node'". This swallows that
 * specific, harmless DOM-state mismatch so the whole app does not crash.
 * See: https://github.com/facebook/react/issues/11538
 */
if (typeof Node === "function" && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      return child;
    }
    // eslint-disable-next-line prefer-rest-params
    return originalRemoveChild.apply(this, arguments as unknown as [T]) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      return newNode;
    }
    // eslint-disable-next-line prefer-rest-params
    return originalInsertBefore.apply(this, arguments as unknown as [T, Node | null]) as T;
  };
}

const isAuthError = (error: unknown): boolean =>
  error instanceof TRPCClientError &&
  (error.message === UNAUTHED_ERR_MSG ||
    error.data?.code === "UNAUTHORIZED" ||
    /sess[ãa]o|session|unauthor/i.test(error.message ?? ""));

// A Mercado Livre rate limit (429) is an EXPECTED, already-handled state: the UI
// shows an honest banner + "Atualizar agora" and the server retried with backoff.
// It must NOT be logged as console.error, or the global "1 error" badge alarms
// the user over a transient throttle. We log it as a warning instead.
const isHandledTransient = (error: unknown): boolean =>
  error instanceof TRPCClientError &&
  (error.data?.code === "TOO_MANY_REQUESTS" ||
    // Reputation/data NOT_FOUND is an EXPECTED transient (a brief ML hiccup): the
    // UI already shows a friendly message + "Atualizar agora" and recovers on the
    // next poll, so it must not inflate the global error badge.
    error.data?.code === "NOT_FOUND");

// A query/mutation that was CANCELLED (component unmount, route change, or the
// adaptive polling refetching before the previous request settled) shows up as
// an "AbortError" / "signal is aborted without reason". This is normal lifecycle
// behaviour, NOT an application failure, so it must never reach console.error
// (otherwise the global error badge falsely accuses the system of being broken).
const isAbortError = (error: unknown): boolean => {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /abort|aborted|cancell?ed|the operation was aborted/i.test(msg);
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep previously fetched data on screen while refetching, so a brief
      // session/cookie hiccup in the preview does not blank the UI.
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (isAuthError(error)) return false;
        // Never auto-retry a rate limit: the server already retried with backoff,
        // and hammering ML again only deepens the throttle. The user retries
        // manually via the on-screen "Atualizar agora" button instead.
        if (error instanceof TRPCClientError && error.data?.code === "TOO_MANY_REQUESTS") {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    // Session/cookie drops are expected in the preview; don't surface them as
    // app errors (avoids the global "1 error" badge for a transient condition).
    if (isAuthError(error)) return;
    if (isHandledTransient(error)) {
      console.warn("[API Query] estado transitório do Mercado Livre (429/indisponível) — tratado na UI", error);
      return;
    }
    // Cancelled/aborted requests are expected lifecycle noise, not failures.
    if (isAbortError(error)) return;
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    if (isAuthError(error)) return;
    if (isHandledTransient(error)) {
      console.warn("[API Mutation] estado transitório do Mercado Livre (429/indisponível) — tratado na UI", error);
      return;
    }
    if (isAbortError(error)) return;
    console.error("[API Mutation Error]", error);
  }
});

/**
 * Client-side request deadline (ms). This is the LAST line of defense against a
 * frozen screen: even if the server stalls (e.g. ML OAuth/endpoint hanging),
 * the browser aborts the request after this deadline so the query resolves with
 * an error and the UI can show a friendly message + retry instead of an endless
 * spinner. The server already has its own (shorter) timeouts; this is a safety
 * net set comfortably above them.
 */
const CLIENT_REQUEST_TIMEOUT_MS = 45_000;

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        // Compose our timeout AbortController with any signal React Query passes
        // (so component unmount / query cancellation still aborts the request).
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(new DOMException("Tempo limite da requisição excedido", "TimeoutError")),
          CLIENT_REQUEST_TIMEOUT_MS,
        );
        const upstream = init?.signal;
        if (upstream) {
          if (upstream.aborted) controller.abort();
          else upstream.addEventListener("abort", () => controller.abort(), { once: true });
        }
        return globalThis
          .fetch(input, {
            ...(init ?? {}),
            credentials: "include",
            signal: controller.signal,
          })
          .finally(() => clearTimeout(timer));
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
