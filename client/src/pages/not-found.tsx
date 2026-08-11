import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 rounded-xl bg-muted border border-border mx-auto mb-6 flex items-center justify-center">
          <Compass className="h-7 w-7 text-muted-foreground" />
        </div>

        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-2">Error 404</p>
        <h1 className="text-xl font-bold text-foreground mb-2">Page Not Found</h1>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          The page you're looking for doesn't exist or may have been moved.
        </p>

        <Button className="rounded-lg gap-2" onClick={() => setLocation("/")}>
          <Home className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
