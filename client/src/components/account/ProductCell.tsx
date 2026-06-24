import { ProductImage } from "@/components/ProductImage";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

/**
 * A product cell used inside tables/lists across the app (Top 10, products by
 * day, sales ranking, etc.). When a `permalink` is available the whole cell
 * becomes a link that opens the Mercado Livre listing in a new tab; otherwise it
 * renders as plain text (no dead link). This keeps "every product is clickable"
 * consistent everywhere a product is shown.
 */
export function ProductCell({
  title,
  thumbnail,
  permalink,
  imgClassName = "h-9 w-9",
  titleClassName = "max-w-[260px]",
  clampTitle = true,
}: {
  title: string;
  thumbnail?: string | null;
  permalink?: string | null;
  imgClassName?: string;
  titleClassName?: string;
  /** When false, the title is shown in full (no line-clamp). Defaults to true. */
  clampTitle?: boolean;
}) {
  const inner = (
    <>
      <ProductImage
        src={thumbnail ?? undefined}
        alt={title}
        className={cn("shrink-0 rounded-lg ring-1 ring-border", imgClassName)}
      />
      <span
        className={cn(
          "text-sm font-medium leading-tight",
          clampTitle && "line-clamp-2",
          titleClassName,
        )}
      >
        {title}
      </span>
    </>
  );

  if (!permalink) {
    return <div className="flex items-center gap-2.5">{inner}</div>;
  }

  return (
    <a
      href={permalink}
      target="_blank"
      rel="noopener noreferrer"
      title="Ver anúncio no Mercado Livre"
      className="group flex items-center gap-2.5 rounded-lg outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {inner}
      <ExternalLink
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary"
        aria-hidden
      />
    </a>
  );
}
