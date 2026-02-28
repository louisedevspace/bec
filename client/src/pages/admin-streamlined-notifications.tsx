import { useEffect, useState } from "react";
import AdminLayout from "./admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Send, Users, Bell, CheckCircle, AlertCircle } from "lucide-react";

type NotificationStats = {
  totalUsers: number;
  pushSubscribers: number;
  recentNotifications: number;
  recentSuccess: number;
  recentFailed: number;
};

type SendResult = {
  success: boolean;
  totalUsers: number;
  sentCount: number;
  failedCount: number;
  message: string;
  errors?: string[];
};

export default function AdminStreamlinedNotifications() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [lastResult, setLastResult] = useState<SendResult | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/admin/notifications/streamlined/stats", { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }

  async function handleSendNotification() {
    if (!title.trim() || !body.trim()) {
      toast({
        title: "Validation Error",
        description: "Title and body are required",
        variant: "destructive",
      });
      return;
    }

    if (title.length > 100) {
      toast({
        title: "Validation Error",
        description: "Title must be 100 characters or less",
        variant: "destructive",
      });
      return;
    }

    if (body.length > 500) {
      toast({
        title: "Validation Error",
        description: "Body must be 500 characters or less",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    setLastResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const res = await fetch("/api/admin/notifications/streamlined/send", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          role: selectedRole === "all" ? undefined : selectedRole,
          channel: "push" // Only push notifications in streamlined version
        })
      });

      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.message || "Failed to send notification");
      }

      setLastResult(result);
      
      toast({
        title: "Success!",
        description: result.message,
        variant: "default",
        duration: 5000,
      });

      // Clear form
      setTitle("");
      setBody("");
      setSelectedRole("all");
      
      // Refresh stats
      fetchStats();

    } catch (error: any) {
      console.error("Failed to send notification:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send notification",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Send Notification</h1>
          <Button 
            onClick={fetchStats} 
            variant="outline" 
            size="sm"
            disabled={sending}
          >
            <Users className="h-4 w-4 mr-2" />
            Refresh Stats
          </Button>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Users</p>
                    <p className="text-2xl font-bold">{stats.totalUsers.toLocaleString()}</p>
                  </div>
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Push Subscribers</p>
                    <p className="text-2xl font-bold">{stats.pushSubscribers.toLocaleString()}</p>
                  </div>
                  <Bell className="h-8 w-8 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Recent Success</p>
                    <p className="text-2xl font-bold text-green-600">{stats.recentSuccess.toLocaleString()}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Recent Failed</p>
                    <p className="text-2xl font-bold text-red-600">{stats.recentFailed.toLocaleString()}</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-red-600" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Send Notification Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Send className="h-5 w-5 mr-2" />
              Send Notification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role">Target Audience</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole} disabled={sending}>
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select target audience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="user">Regular Users</SelectItem>
                  <SelectItem value="admin">Administrators</SelectItem>
                  <SelectItem value="moderator">Moderators</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Notification Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter notification title..."
                maxLength={100}
                disabled={sending}
                className="placeholder-light-gray"
              />
              <p className="text-xs text-muted-foreground">
                {title.length}/100 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Notification Message *</Label>
              <Textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Enter your notification message..."
                rows={4}
                maxLength={500}
                disabled={sending}
                className="placeholder-light-gray"
              />
              <p className="text-xs text-muted-foreground">
                {body.length}/500 characters
              </p>
            </div>

            <div className="flex items-center justify-between pt-4">
              <div className="text-sm text-muted-foreground">
                This will send a push notification to {selectedRole === "all" ? "all users" : `${selectedRole} users`} who have enabled notifications.
              </div>
              <Button
                onClick={handleSendNotification}
                disabled={sending || !title.trim() || !body.trim()}
                size="lg"
                className="min-w-[120px]"
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Now
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Last Result */}
        {lastResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                Notification Sent Successfully
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{lastResult.totalUsers.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                </div>
                <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{lastResult.sentCount.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Successfully Sent</p>
                </div>
                <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{lastResult.failedCount.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Failed</p>
                </div>
              </div>
              
              {lastResult.errors && lastResult.errors.length > 0 && (
                <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <p className="text-sm font-medium mb-2">Sample Errors:</p>
                  <ul className="text-xs space-y-1">
                    {lastResult.errors.slice(0, 5).map((error, index) => (
                      <li key={index} className="text-muted-foreground">• {error}</li>
                    ))}
                    {lastResult.errors.length > 5 && (
                      <li className="text-muted-foreground">• ... and {lastResult.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}