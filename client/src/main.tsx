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
    if (!isAuthError(error)) console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    if (!isAuthError(error)) console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
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
