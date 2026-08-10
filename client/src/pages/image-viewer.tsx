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
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Button
            variant="outline"
            onClick={() => window.history.length > 1 ? window.history.back() : setLocation("/")}
            className="bg-transparent border-[#1e1e1e] text-gray-300 hover:bg-[#1a1a1a] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-sm sm:text-base font-semibold text-white truncate">{title}</h1>
          <a href={src} download className="inline-flex">
            <Button
              variant="outline"
              className="bg-transparent border-[#1e1e1e] text-gray-300 hover:bg-[#1a1a1a] hover:text-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </a>
        </div>

        <div className="bg-[#111] border border-[#1e1e1e] rounded-2xl p-4 sm:p-6 min-h-[75vh] flex items-center justify-center overflow-hidden">
          {src ? (
            <img
              src={src}
              alt={title}
              className="max-w-full max-h-[70vh] object-contain rounded-xl"
            />
          ) : (
            <div className="text-gray-500 text-sm">No image source was provided.</div>
          )}
        </div>
      </div>
    </div>
  );
}