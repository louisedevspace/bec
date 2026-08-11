import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X, Upload, Camera, User, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { getImageDisplayUrl } from '@/lib/image';
import { buildInternalAssetPath } from '../../../../shared/supabase-storage';
import { compressUserImage } from '@/lib/image-compress';

interface ProfilePictureModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfilePicture?: string | null;
  userId: string;
  onPictureUpdate: (pictureUrl: string) => void;
}

export function ProfilePictureModal({
  isOpen,
  onClose,
  currentProfilePicture,
  userId,
  onPictureUpdate
}: ProfilePictureModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileSelect = (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const startCamera = async () => {
    // Check if camera API is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Fallback to file input for devices without camera API
      cameraInputRef.current?.click();
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      setStream(mediaStream);
      setShowCamera(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      // Fallback to file input if camera access fails
      setError('Unable to access camera. Using file picker instead.');
      setTimeout(() => {
        setError(null);
        cameraInputRef.current?.click();
      }, 2000);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame to canvas
        context.drawImage(video, 0, 0);

        // Convert canvas to blob
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `camera-capture-${Date.now()}.jpg`, {
              type: 'image/jpeg'
            });
            handleFileSelect(file);
            stopCamera();
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  const switchCamera = async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);

    if (stream) {
      stopCamera();
      setTimeout(() => {
        startCamera();
      }, 100);
    }
  };

  // Cleanup camera when modal closes
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Generate unique filename using user ID and timestamp
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      // Upload file to Supabase Storage
      const compressedFile = await compressUserImage(selectedFile);
      const { data, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, compressedFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error('Failed to upload image');
      }

      const internalImagePath = buildInternalAssetPath('avatars', filePath);

      // Update user profile in database
      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_picture: internalImagePath })
        .eq('id', userId);

      if (updateError) {
        console.error('Database update error:', updateError);
        throw new Error('Failed to update profile');
      }

      setSuccess('Profile picture updated successfully!');
  onPictureUpdate(internalImagePath);

      // Clear form
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';

      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
        setSuccess(null);
      }, 2000);

    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload image');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePicture = async () => {
    if (!currentProfilePicture) return;

    setLoading(true);
    setError(null);

    try {
      // Remove from database
      const { error: updateError } = await supabase
        .from('users')
        .update({ profile_picture: null })
        .eq('id', userId);

      if (updateError) {
        throw new Error('Failed to remove profile picture');
      }

      // Note: We're not deleting from storage to avoid issues with file paths
      // The old files will be cleaned up by a separate process if needed

      setSuccess('Profile picture removed successfully!');
      onPictureUpdate('');

      setTimeout(() => {
        onClose();
        setSuccess(null);
      }, 2000);

    } catch (err: any) {
      setError(err.message || 'Failed to remove profile picture');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md" hideCloseButton>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-foreground text-lg font-semibold">Profile Picture</DialogTitle>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center hover:bg-muted/70 transition-colors"
            >
              <X size={14} className="text-muted-foreground" />
            </button>
          </div>
        </DialogHeader>

        {/* Current Profile Picture */}
        {currentProfilePicture && (
          <div className="mb-4 text-center">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Current Picture</h3>
            <div className="relative inline-block">
              <img
                src={getImageDisplayUrl(currentProfilePicture)}
                alt="Current profile"
                className="w-24 h-24 rounded-full object-cover border-2 border-border"
              />
              <button
                onClick={handleRemovePicture}
                disabled={loading}
                className="absolute -top-2 -right-2 bg-danger text-danger-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs hover:opacity-90 transition-opacity"
                aria-label="Remove profile picture"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Upload Options */}
        <div className="space-y-4">
          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Upload from Device
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground hover:bg-muted transition-colors flex items-center justify-center space-x-2"
            >
              <Upload size={20} />
              <span>Choose File</span>
            </button>
          </div>

          {/* Camera Capture */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Take Photo
            </label>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCameraCapture}
              className="hidden"
            />
            <button
              onClick={startCamera}
              className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground hover:bg-muted transition-colors flex items-center justify-center space-x-2"
            >
              <Camera size={20} />
              <span>Take Photo</span>
            </button>
          </div>

          {/* Preview */}
          {previewUrl && (
            <div className="text-center">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Preview</h3>
              <img
                src={previewUrl}
                alt="Preview"
                className="w-24 h-24 rounded-full object-cover border-2 border-primary mx-auto"
              />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-danger/10 border border-danger/30 rounded-xl">
              <AlertCircle size={18} className="text-danger flex-shrink-0" />
              <span className="text-danger text-sm">{error}</span>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-center space-x-2 p-3 bg-success/10 border border-success/30 rounded-xl">
              <CheckCircle size={18} className="text-success flex-shrink-0" />
              <span className="text-success text-sm">{success}</span>
            </div>
          )}

          {/* Upload Button */}
          {selectedFile && (
            <button
              onClick={handleUpload}
              disabled={loading}
              className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload size={20} />
                  <span>Upload Picture</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-2 p-3 bg-primary/10 border border-primary/20 rounded-xl">
          <div className="flex items-start space-x-2">
            <User size={16} className="text-primary mt-0.5" />
            <div className="text-primary text-sm">
              <p className="font-medium mb-1">Upload Guidelines:</p>
              <ul className="text-xs space-y-1 text-primary/80">
                <li>• Supported formats: JPG, PNG, GIF</li>
                <li>• Maximum file size: 5MB</li>
                <li>• Recommended size: 400x400 pixels</li>
                <li>• Square images work best</li>
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Camera Interface */}
      {showCamera && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Take Photo</h3>
              <button
                onClick={stopCamera}
                className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center hover:bg-muted/70 transition-colors"
              >
                <X size={14} className="text-muted-foreground" />
              </button>
            </div>

            {/* Camera Preview */}
            <div className="relative mb-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-64 object-cover rounded-lg"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Camera Controls */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-4">
                <button
                  onClick={switchCamera}
                  className="p-3 bg-white/20 backdrop-blur-sm rounded-full text-white hover:bg-white/30 transition-colors"
                >
                  <RotateCcw size={20} />
                </button>

                <button
                  onClick={capturePhoto}
                  className="p-4 bg-white rounded-full text-black hover:bg-white/90 transition-colors"
                >
                  <Camera size={24} />
                </button>
              </div>
            </div>

            <div className="text-center text-sm text-muted-foreground">
              <p>Position your face in the center and tap the camera button to capture</p>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}