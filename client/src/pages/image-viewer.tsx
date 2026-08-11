import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getImageDisplayUrl } from "@/lib/image";
import { useLocation } from "wouter";

export default function ImageViewerPage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title") || "Image Viewer";
  const src = getImageDisplayUrl(params.get("src"));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Button
            variant="outline"
            onClick={() => window.history.length > 1 ? window.history.back() : setLocation("/")}
            className="bg-transparent border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-sm sm:text-base font-semibold text-foreground truncate">{title}</h1>
          <a href={src} download className="inline-flex">
            <Button
              variant="outline"
              className="bg-transparent border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </a>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 sm:p-6 min-h-[75vh] flex items-center justify-center overflow-hidden shadow-sm">
          {src ? (
            <img
              src={src}
              alt={title}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
          ) : (
            <div className="text-muted-foreground text-sm">No image source was provided.</div>
          )}
        </div>
      </div>
    </div>
  );
}
