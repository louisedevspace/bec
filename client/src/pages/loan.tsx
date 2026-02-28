import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cryptoApi } from "@/services/crypto-api";
import { Upload, FileText, Camera, User } from "lucide-react";
import type { LoanApplication } from "@/types/crypto";
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

export default function LoanPage() {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    dateOfBirth: "",
    amount: "",
    purpose: "",
    duration: "",
    monthlyIncome: "",
    termsAccepted: false,
  });

  const [documents, setDocuments] = useState({
    frontId: null as File | null,
    backId: null as File | null,
    selfieWithId: null as File | null,
  });

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { toast } = useToast();

  const loanMutation = useMutation({
    mutationFn: (applicationData: Omit<LoanApplication, "id" | "createdAt">) =>
      cryptoApi.createLoanApplication(applicationData),
    onSuccess: () => {
      toast({
        title: "Application Submitted",
        description: "Your loan application has been submitted successfully.",
      });
      // Reset form
      setFormData({
        fullName: "",
        email: "",
        phoneNumber: "",
        dateOfBirth: "",
        amount: "",
        purpose: "",
        duration: "",
        monthlyIncome: "",
        termsAccepted: false,
      });
      setDocuments({
        frontId: null,
        backId: null,
        selfieWithId: null,
      });
    },
    onError: () => {
      toast({
        title: "Submission Failed",
        description: "Failed to submit loan application. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (type: keyof typeof documents, file: File) => {
    setDocuments(prev => ({ ...prev, [type]: file }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.termsAccepted) {
      toast({
        title: "Terms Required",
        description: "Please accept the terms and conditions.",
        variant: "destructive",
      });
      return;
    }

    // Generate unique UUID for this loan application
    const loanId = uuidv4();

    // Upload documents first
    setUploading(true);
    setUploadError(null);
    try {
      const docUrls: Record<string, string> = {};
      for (const key of Object.keys(documents) as (keyof typeof documents)[]) {
        const file = documents[key];
        if (file) {
          const formData = new FormData();
          formData.append('userId', loanId); // Use unique UUID as folder name
          formData.append('file', file);
          const res = await axios.post('/api/upload-loan-doc', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          docUrls[key] = res.data.url;
        }
      }

    const applicationData: any = {
      user_id: loanId, // Use the same UUID as user_id (snake_case)
      amount: formData.amount ? formData.amount.toString() : "0",
      purpose: formData.purpose,
      duration: parseInt(formData.duration),
      monthlyIncome: formData.monthlyIncome ? formData.monthlyIncome.toString() : undefined,
      status: "pending",
      documents: docUrls,
    };

    loanMutation.mutate(applicationData);
    } catch (err: any) {
      setUploadError('Failed to upload documents. Please try again.');
      toast({
        title: "Document Upload Failed",
        description: "Failed to upload one or more documents. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Loan Application</h1>
        <p className="text-muted-foreground">
          Apply for a cryptocurrency-backed loan with competitive rates
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange("fullName", e.target.value)}
                  placeholder="Enter your full name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="Enter your email"
                  required
                />
              </div>
              <div>
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                  placeholder="Enter your phone number"
                  required
                />
              </div>
              <div>
                <Label htmlFor="dateOfBirth">Date of Birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => handleInputChange("dateOfBirth", e.target.value)}
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loan Details */}
        <Card>
          <CardHeader>
            <CardTitle>Loan Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amount">Loan Amount (USDT)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1000"
                  max="1000000"
                  value={formData.amount}
                  onChange={(e) => handleInputChange("amount", e.target.value)}
                  placeholder="Enter loan amount"
                  required
                />
              </div>
              <div>
                <Label htmlFor="duration">Loan Duration</Label>
                <Select value={formData.duration} onValueChange={(value) => handleInputChange("duration", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 Days</SelectItem>
                    <SelectItem value="60">60 Days</SelectItem>
                    <SelectItem value="90">90 Days</SelectItem>
                    <SelectItem value="180">180 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="purpose">Purpose of Loan</Label>
                <Select value={formData.purpose} onValueChange={(value) => handleInputChange("purpose", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select purpose" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trading">Trading</SelectItem>
                    <SelectItem value="investment">Investment</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="monthlyIncome">Monthly Income (USDT)</Label>
                <Input
                  id="monthlyIncome"
                  type="number"
                  min="0"
                  value={formData.monthlyIncome}
                  onChange={(e) => handleInputChange("monthlyIncome", e.target.value)}
                  placeholder="Enter monthly income"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Document Upload */}
        <Card>
          <CardHeader>
            <CardTitle>Required Documents</CardTitle>
            <p className="text-sm text-muted-foreground">
              Please upload the following documents: Front side of your ID card, Back side of your ID card, A photo of you holding your ID card
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          </CardContent>
        </Card>

        {/* Terms and Submit */}
        <Card>
          <CardContent className="pt-6">
            {uploading && <div className="mb-4 text-blue-500">Uploading documents...</div>}
            {uploadError && <div className="mb-4 text-red-500">{uploadError}</div>}
            <div className="flex items-start space-x-3 mb-6">
              <Checkbox
                id="terms"
                checked={formData.termsAccepted}
                onCheckedChange={(checked) => handleInputChange("termsAccepted", !!checked)}
              />
              <label htmlFor="terms" className="text-sm leading-relaxed">
                I agree to the Terms and Conditions and Privacy Policy. I understand that loan approval is subject to verification and credit assessment.
              </label>
            </div>
            
            <Button
              type="submit"
              className="w-full"
              disabled={loanMutation.isPending || !formData.termsAccepted}
            >
              {loanMutation.isPending ? "Submitting..." : "Submit Loan Application"}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

import type { LucideIcon } from 'lucide-react';
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
      <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        file 
          ? "border-green-500 bg-green-500/10" 
          : "border-border hover:border-primary/50"
      }`}>
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
          {file ? (
            <User className="text-green-500" size={18} />
          ) : (
            <Icon className="text-muted-foreground" size={18} />
          )}
        </div>
        <h3 className="font-medium mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground mb-2">
          {file ? file.name : description}
        </p>
        {!file && (
          <p className="text-xs text-muted-foreground">Click to upload</p>
        )}
      </div>
    </div>
  );
}
