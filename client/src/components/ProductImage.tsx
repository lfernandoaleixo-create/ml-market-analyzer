import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Robust product thumbnail.
 *
 * The Mercado Livre catalog occasionally returns products without a usable
 * picture URL, and some CDN images reject hotlinking when a referrer header is
 * sent. This component normalizes the URL to https, drops the referrer, and
 * falls back to a tasteful placeholder instead of a broken-image icon.
 */
export function ProductImage({
  src,
  alt = "",
  className,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  const normalized = (src ?? "").trim().replace(/^http:/, "https:");
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !normalized || failed;

  if (showPlaceholder) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground/50",
          className,
        )}
        aria-label={alt || "Sem imagem"}
      >
        <ImageOff className="h-1/2 w-1/2" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={normalized}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-md bg-muted object-cover", className)}
    />
  );
}
