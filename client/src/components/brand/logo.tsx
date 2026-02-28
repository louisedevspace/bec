import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  alt?: string;
  loading?: "eager" | "lazy";
};

export function Logo({ className, alt = "Becxus logo", loading = "eager" }: Props) {
  return (
    <img
      src={logo}
      alt={alt}
      className={cn("object-contain", className)}
      decoding="async"
      loading={loading}
      onError={(e) => {
        const el = e.currentTarget;
        el.style.display = "none";
        const fallback = document.createElement("span");
        fallback.textContent = "Becxus";
        fallback.className = cn("text-sm text-white");
        el.parentElement?.appendChild(fallback);
      }}
    />
  );
}
