import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Maximize2, Download } from 'lucide-react';
import { buildImageViewerPath, getImageDisplayUrl } from '@/lib/image';

interface ProfilePictureViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  profilePictureUrl: string;
  userName: string;
}

export function ProfilePictureViewerModal({ 
  isOpen, 
  onClose, 
  profilePictureUrl, 
  userName 
}: ProfilePictureViewerModalProps) {
  const displayUrl = getImageDisplayUrl(profilePictureUrl);
  const viewerPath = buildImageViewerPath(profilePictureUrl, `${userName} profile picture`);
  
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = displayUrl;
    link.download = `${userName}-profile-picture.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="admin-dialog max-w-2xl max-h-[90vh] overflow-y-auto bg-[#111] border-[#1e1e1e] text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            Profile Picture - {userName}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            View and download user profile picture.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Profile Picture Display */}
          <div className="flex justify-center">
            <div className="relative group">
              <img 
                src={displayUrl} 
                alt={`${userName}'s profile picture`}
                className="max-w-full max-h-96 object-contain rounded-xl shadow-lg border border-[#1e1e1e]"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden absolute inset-0 bg-[#0a0a0a] rounded-xl flex items-center justify-center">
                <p className="text-gray-500">Failed to load image</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center space-x-3">
            <Button
              variant="outline"
              onClick={() => window.open(viewerPath, '_blank')}
              className="flex items-center space-x-2 bg-transparent border-[#2a2a2a] text-gray-200 hover:bg-[#1a1a1a] hover:text-white"
            >
              <Maximize2 className="h-4 w-4" />
              <span>Open Full View</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleDownload}
              className="flex items-center space-x-2 bg-transparent border-[#2a2a2a] text-gray-200 hover:bg-[#1a1a1a] hover:text-white"
            >
              <Download className="h-4 w-4" />
              <span>Download</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
