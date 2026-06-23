import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { formatNumber, isoToWeekdayLong } from "@/lib/format";
import { Eye, ExternalLink, Loader2, ImageOff, TrendingUp } from "lucide-react";

/**
 * Modal that breaks a single day's total visits down by listing. Given an ISO
 * day (yyyy-mm-dd), it queries `account.visitsByListing` (30-day per-listing
 * series), picks each listing's visits for that day, and renders them sorted
 * desc. Progressive: keeps polling while the backend collector is still
 * gathering data (`collecting`).
 */
export function DayVisitsBreakdownDialog({
  date,
  open,
  onOpenChange,
}: {
  /** ISO day (yyyy-mm-dd, BRT) to break down. Null when no day is selected. */
  date: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const todayKey = new Date(Date.now() - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const isToday = date === todayKey;

  const query = trpc.account.visitsByListing.useQuery(
    { days: 30 },
    {
      // Only fetch while the dialog is open.
      enabled: open,
      // Poll every 6s while the background collector is still gathering.
      refetchInterval: (q) =>
        q.state.data?.collecting ? 6 * 1000 : 5 * 60 * 1000,
      staleTime: 60 * 1000,
    },
  );

  const collecting = query.data?.collecting === true;

  // Resolve each listing's visits for the selected day, drop zeros, sort desc.
  const rows = useMemo(() => {
    if (!date || !query.data) return [];
    return query.data.listings
      .map((l) => ({
        itemId: l.itemId,
        title: l.title,
        thumbnail: l.thumbnail,
        permalink: l.permalink,
        visits: l.series.find((p) => p.date === date)?.visits ?? 0,
      }))
      .filter((r) => r.visits > 0)
      .sort((a, b) => b.visits - a.visits);
  }, [date, query.data]);

  const dayTotal = useMemo(
    () => rows.reduce((s, r) => s + r.visits, 0),
    [rows],
  );

  const loading = query.isLoading || (open && !query.data);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Visitas por anúncio
          </DialogTitle>
          <DialogDescription>
            {date ? (
              <>
                {isoToWeekdayLong(date)}
                {isToday && <span className="text-primary"> · hoje (parcial)</span>} —{" "}
                <span className="font-medium text-foreground">
                  {formatNumber(dayTotal)} visita(s)
                </span>{" "}
                distribuídas entre {rows.length} anúncio(s)
              </>
            ) : (
              "Selecione um dia no gráfico."
            )}
          </DialogDescription>
        </DialogHeader>

        {collecting && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Ainda coletando os dados de alguns anúncios — a lista vai se completando.
          </div>
        )}

        {loading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <TrendingUp className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {collecting
                ? "Carregando as visitas deste dia…"
                : "Nenhum anúncio registrou visitas neste dia."}
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[55vh] pr-3">
            <ul className="space-y-1.5">
              {rows.map((r, i) => {
                const pct = dayTotal > 0 ? (r.visits / dayTotal) * 100 : 0;
                return (
                  <li
                    key={r.itemId}
                    className="flex items-center gap-3 rounded-lg border bg-card px-2.5 py-2"
                  >
                    <span className="w-5 shrink-0 text-center text-xs font-medium tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
                      {r.thumbnail ? (
                        <img
                          src={r.thumbnail}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <ImageOff className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground" title={r.title}>
                        {r.title}
                      </p>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(3, pct)}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="inline-flex items-center gap-1 font-display text-sm tabular-nums text-primary">
                        <Eye className="h-3.5 w-3.5" />
                        {formatNumber(r.visits)}
                      </span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    {r.permalink && (
                      <a
                        href={r.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                        title="Abrir anúncio no Mercado Livre"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
