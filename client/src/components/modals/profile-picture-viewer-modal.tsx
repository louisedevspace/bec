import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Download } from 'lucide-react';

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
  
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = profilePictureUrl;
    link.download = `${userName}-profile-picture.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenInNewTab = () => {
    window.open(profilePictureUrl, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="admin-dialog max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Profile Picture - {userName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Profile Picture Display */}
          <div className="flex justify-center">
            <div className="relative group">
              <img 
                src={profilePictureUrl} 
                alt={`${userName}'s profile picture`}
                className="max-w-full max-h-96 object-contain rounded-lg shadow-lg border border-gray-200"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden absolute inset-0 bg-gray-100 rounded-lg flex items-center justify-center">
                <p className="text-gray-500">Failed to load image</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center space-x-3">
            <Button
              variant="outline"
              onClick={handleOpenInNewTab}
              className="flex items-center space-x-2"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open in New Tab</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleDownload}
              className="flex items-center space-x-2"
            >
              <Download className="h-4 w-4" />
              <span>Download</span>
            </Button>
          </div>

          {/* Image URL */}
          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">Image URL:</p>
            <p className="text-xs font-mono break-all text-gray-800">
              {profilePictureUrl}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
