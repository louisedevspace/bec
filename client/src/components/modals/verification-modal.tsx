import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Camera, User, CheckCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { buildApiUrl } from "@/lib/config";

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VerificationModal({ isOpen, onClose }: VerificationModalProps) {
  const [formData, setFormData] = useState({
    fullName: "",
    ssn: "",
    address: "",
  });

  const [documents, setDocuments] = useState({
    frontId: null as File | null,
    backId: null as File | null,
    selfieWithId: null as File | null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (type: keyof typeof documents, file: File) => {
    setDocuments(prev => ({ ...prev, [type]: file }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.fullName || !formData.ssn || !formData.address) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (!documents.frontId || !documents.backId || !documents.selfieWithId) {
      toast({
        title: "Missing Documents",
        description: "Please upload all required documents.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('User not authenticated');
      }

      console.log('🔍 User authenticated:', session.user.id);

      // Upload documents to Supabase Storage
      const documentUrls: Record<string, string> = {};
      
      // Upload front ID
      console.log('🔍 Uploading front ID...');
      const frontIdExt = documents.frontId!.name.split('.').pop();
      const frontIdFileName = `front-id-${Date.now()}.${frontIdExt}`;
      const frontIdPath = `${session.user.id}/${frontIdFileName}`;
      
      console.log('🔍 Front ID path:', frontIdPath);
      
      const { data: frontIdData, error: frontIdError } = await supabase.storage
        .from('kyc-documents')
        .upload(frontIdPath, documents.frontId!, {
          cacheControl: '3600',
          upsert: true
        });

      if (frontIdError) {
        console.error('🔍 Front ID upload error:', frontIdError);
        throw frontIdError;
      }
      
      console.log('🔍 Front ID uploaded successfully');
      documentUrls.frontIdUrl = `${supabase.storage.from('kyc-documents').getPublicUrl(frontIdPath).data.publicUrl}`;

      // Upload back ID
      console.log('🔍 Uploading back ID...');
      const backIdExt = documents.backId!.name.split('.').pop();
      const backIdFileName = `back-id-${Date.now()}.${backIdExt}`;
      const backIdPath = `${session.user.id}/${backIdFileName}`;
      
      console.log('🔍 Back ID path:', backIdPath);
      
      const { data: backIdData, error: backIdError } = await supabase.storage
        .from('kyc-documents')
        .upload(backIdPath, documents.backId!, {
          cacheControl: '3600',
          upsert: true
        });

      if (backIdError) {
        console.error('🔍 Back ID upload error:', backIdError);
        throw backIdError;
      }
      
      console.log('🔍 Back ID uploaded successfully');
      documentUrls.backIdUrl = `${supabase.storage.from('kyc-documents').getPublicUrl(backIdPath).data.publicUrl}`;

      // Upload selfie with ID
      console.log('🔍 Uploading selfie...');
      const selfieExt = documents.selfieWithId!.name.split('.').pop();
      const selfieFileName = `selfie-${Date.now()}.${selfieExt}`;
      const selfiePath = `${session.user.id}/${selfieFileName}`;
      
      console.log('🔍 Selfie path:', selfiePath);
      
      const { data: selfieData, error: selfieError } = await supabase.storage
        .from('kyc-documents')
        .upload(selfiePath, documents.selfieWithId!, {
          cacheControl: '3600',
          upsert: true
        });

      if (selfieError) {
        console.error('🔍 Selfie upload error:', selfieError);
        throw selfieError;
      }
      
      console.log('🔍 Selfie uploaded successfully');
      documentUrls.selfieWithIdUrl = `${supabase.storage.from('kyc-documents').getPublicUrl(selfiePath).data.publicUrl}`;

      console.log('🔍 All documents uploaded successfully');
      console.log('🔍 Document URLs:', documentUrls);

      // Submit KYC verification request
      console.log('🔍 Submitting KYC request to server...');
      console.log('🔍 Request data:', {
        fullName: formData.fullName,
        ssn: formData.ssn,
        address: formData.address,
        frontIdUrl: documentUrls.frontIdUrl,
        backIdUrl: documentUrls.backIdUrl,
        selfieWithIdUrl: documentUrls.selfieWithIdUrl
      });
      
      const response = await fetch(buildApiUrl('/kyc/submit'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          fullName: formData.fullName,
          ssn: formData.ssn,
          address: formData.address,
          frontIdUrl: documentUrls.frontIdUrl,
          backIdUrl: documentUrls.backIdUrl,
          selfieWithIdUrl: documentUrls.selfieWithIdUrl
        })
      });

      console.log('🔍 Server response status:', response.status);
      console.log('🔍 Server response ok:', response.ok);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('🔍 Server error data:', errorData);
        throw new Error(errorData.message || 'Failed to submit KYC verification');
      }
      
      const responseData = await response.json();
      console.log('🔍 Server response data:', responseData);

      toast({
        title: "Verification Submitted",
        description: "Your KYC verification has been submitted for review. You will be notified once it's processed.",
      });

      // Reset form
      setFormData({ fullName: "", ssn: "", address: "" });
      setDocuments({ frontId: null, backId: null, selfieWithId: null });
      onClose();
    } catch (error: any) {
      console.error('KYC submission error:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit verification. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[#111] border border-[#1e1e1e] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <CheckCircle className="text-primary" size={20} />
            <span>KYC Verification</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="fullName" className="text-gray-300">Please enter your complete legal name</Label>
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={(e) => handleInputChange("fullName", e.target.value)}
                placeholder="Enter your full legal name"
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-gray-600"
                required
              />
            </div>

            <div>
              <Label htmlFor="ssn" className="text-gray-300">Please enter your Social Security Number (SSN)</Label>
              <Input
                id="ssn"
                value={formData.ssn}
                onChange={(e) => handleInputChange("ssn", e.target.value)}
                placeholder="XXX-XX-XXXX"
                className="bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-gray-600"
                required
              />
            </div>

            <div>
              <Label htmlFor="address" className="text-gray-300">Please enter your residential address</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange("address", e.target.value)}
                placeholder="Enter your complete residential address"
                className="h-24 resize-none bg-[#0a0a0a] border-[#2a2a2a] text-white placeholder-gray-600"
                required
              />
            </div>
          </div>

          {/* Document Upload */}
          <div>
            <Label className="text-gray-300 text-base font-medium">
              Please upload the following documents: 1. The front side of your ID card 2. The back side of your ID card 3. A photo of you holding your ID card
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
              <FileUploadArea
                icon={FileText}
                title="Front of ID"
                description="Upload front side"
                file={documents.frontId}
                onChange={(file) => handleFileUpload("frontId", file)}
              />
              <FileUploadArea
                icon={FileText}
                title="Back of ID"
                description="Upload back side"
                file={documents.backId}
                onChange={(file) => handleFileUpload("backId", file)}
              />
              <FileUploadArea
                icon={Camera}
                title="Selfie with ID"
                description="Upload selfie"
                file={documents.selfieWithId}
                onChange={(file) => handleFileUpload("selfieWithId", file)}
              />
            </div>
          </div>

          {/* Important Notes */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="text-sm">
              <p className="font-medium text-blue-500 mb-2">Verification Process</p>
              <ul className="space-y-1 text-gray-500">
                <li>• Document review typically takes 1-3 business days</li>
                <li>• Ensure all information matches your official documents</li>
                <li>• High-quality, clear photos are required</li>
                <li>• Your personal information is encrypted and secure</li>
                <li>• Verification increases account security and limits</li>
              </ul>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "SUBMIT"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface FileUploadAreaProps {
  icon: LucideIcon;
  title: string;
  description: string;
  file: File | null;
  onChange: (file: File) => void;
}

function FileUploadArea({ icon: Icon, title, description, file, onChange }: FileUploadAreaProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      onChange(selectedFile);
    }
  };

  return (
    <div className="relative">
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        file 
          ? "border-green-500 bg-green-500/10" 
          : "border-[#2a2a2a] hover:border-primary/50"
      }`}>
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#0a0a0a] border border-[#2a2a2a] flex items-center justify-center">
          {file ? (
            <CheckCircle className="text-green-500" size={18} />
          ) : (
            <Icon className="text-gray-500" size={18} />
          )}
        </div>
        <h3 className="font-medium mb-1 text-white">{title}</h3>
        <p className="text-sm text-gray-500 mb-2">
          {file ? file.name : description}
        </p>
        {!file && (
          <div className="flex items-center justify-center space-x-1 text-xs text-gray-500">
            <Upload size={10} />
            <span>Click to upload</span>
          </div>
        )}
      </div>
    </div>
  );
}
