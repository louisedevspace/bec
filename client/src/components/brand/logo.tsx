import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import { useExchangeName } from "@/hooks/use-exchange-name";

type Props = {
  className?: string;
  alt?: string;
  loading?: "eager" | "lazy";
};

export function Logo({ className, alt, loading = "eager" }: Props) {
  const exchangeName = useExchangeName();
  const resolvedAlt = alt ?? `${exchangeName} logo`;

  return (
    <img
      src={logo}
      alt={resolvedAlt}
      className={cn("object-contain", className)}
      decoding="async"
      loading={loading}
      onError={(e) => {
        const el = e.currentTarget;
        el.style.display = "none";
        const fallback = document.createElement("span");
        fallback.textContent = exchangeName;
        fallback.className = cn("text-sm text-foreground");
        el.parentElement?.appendChild(fallback);
      }}
    />
  );
}
