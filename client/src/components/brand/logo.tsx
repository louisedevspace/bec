import bundledLogo from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import { useExchangeName, useBrandLogoUrl } from "@/hooks/use-exchange-name";

type Props = {
  className?: string;
  alt?: string;
  loading?: "eager" | "lazy";
};

export function Logo({ className, alt, loading = "eager" }: Props) {
  const exchangeName = useExchangeName();
  const brandLogoUrl = useBrandLogoUrl();
  const resolvedAlt = alt ?? `${exchangeName} logo`;

  return (
    <img
      src={brandLogoUrl}
      alt={resolvedAlt}
      className={cn("object-contain", className)}
      decoding="async"
      loading={loading}
      onError={(e) => {
        const el = e.currentTarget;
        // Server-derived icon failed to load (network hiccup) — fall back to
        // the bundled default once, then give up to a text placeholder.
        if (el.dataset.fallback !== "1") {
          el.dataset.fallback = "1";
          el.src = bundledLogo;
          return;
        }
        el.style.display = "none";
        const fallback = document.createElement("span");
        fallback.textContent = exchangeName;
        fallback.className = cn("text-sm text-foreground");
        el.parentElement?.appendChild(fallback);
      }}
    />
  );
}
