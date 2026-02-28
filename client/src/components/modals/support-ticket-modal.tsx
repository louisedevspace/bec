import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, AlertCircle, Clock, CheckCircle } from "lucide-react";
import type { CreateSupportTicketData } from "@/types/support";

interface SupportTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateSupportTicketData) => void;
  isLoading: boolean;
}

const categories = [
  { value: 'general', label: 'General Inquiry', icon: MessageSquare },
  { value: 'trading', label: 'Trading Support', icon: MessageSquare },
  { value: 'deposit', label: 'Deposit Issues', icon: MessageSquare },
  { value: 'withdrawal', label: 'Withdrawal Issues', icon: MessageSquare },
  { value: 'kyc', label: 'KYC Verification', icon: MessageSquare },
  { value: 'technical', label: 'Technical Support', icon: MessageSquare },
  { value: 'other', label: 'Other', icon: MessageSquare },
];

const priorities = [
  { value: 'low', label: 'Low', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-800', icon: AlertCircle },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-800', icon: AlertCircle },
];

export function SupportTicketModal({ isOpen, onClose, onSubmit, isLoading }: SupportTicketModalProps) {
  const [formData, setFormData] = useState<CreateSupportTicketData>({
    subject: '',
    category: 'general',
    priority: 'medium',
    message: '',
  });

  const [errors, setErrors] = useState<Partial<CreateSupportTicketData>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: Partial<CreateSupportTicketData> = {};
    
    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject is required';
    }
    
    if (!(formData.message ?? '').trim()) {
      newErrors.message = 'Message is required';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    onSubmit(formData);
  };

  const handleClose = () => {
    setFormData({
      subject: '',
      category: 'general',
      priority: 'medium',
      message: '',
    });
    setErrors({});
    onClose();
  };

  const selectedCategory = categories.find(cat => cat.value === formData.category);
  const selectedPriority = priorities.find(pri => pri.value === formData.priority);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Create Support Ticket
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="Brief description of your issue"
              className={errors.subject ? 'border-red-500' : ''}
            />
            {errors.subject && (
              <p className="text-sm text-red-500">{errors.subject}</p>
            )}
          </div>

          {/* Category and Priority */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as CreateSupportTicketData['category'] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => {
                    const Icon = category.icon;
                    return (
                      <SelectItem key={category.value} value={category.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {category.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value as CreateSupportTicketData['priority'] }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((priority) => {
                    const Icon = priority.icon;
                    return (
                      <SelectItem key={priority.value} value={priority.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {priority.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Selected Category and Priority Preview */}
          <div className="flex items-center gap-4">
            {selectedCategory && (
              <Badge variant="outline" className="flex items-center gap-1">
                <selectedCategory.icon className="h-3 w-3" />
                {selectedCategory.label}
              </Badge>
            )}
            {selectedPriority && (
              <Badge className={`${selectedPriority.color} flex items-center gap-1`}>
                <selectedPriority.icon className="h-3 w-3" />
                {selectedPriority.label} Priority
              </Badge>
            )}
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Message *</Label>
            <Textarea
              id="message"
              value={formData.message}
              onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
              placeholder="Please provide detailed information about your issue. Include any relevant details, steps to reproduce, or error messages."
              rows={6}
              className={errors.message ? 'border-red-500' : ''}
            />
            {errors.message && (
              <p className="text-sm text-red-500">{errors.message}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {(formData.message?.length ?? 0)}/1000 characters
            </p>
          </div>

          {/* Help Tips */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Tips for Better Support
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Be specific about your issue or question</li>
                <li>• Include relevant account information (if applicable)</li>
                <li>• Mention any error messages you've encountered</li>
                <li>• Describe the steps you've already tried</li>
                <li>• For trading issues, include order details or transaction IDs</li>
              </ul>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Creating...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4" />
                  Create Ticket
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
