import { useEffect, useMemo, useState } from "react";
import AdminLayout from "./admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";

type Template = {
  id: number;
  name: string;
  title: string;
  body: string;
  deeplink_url?: string;
};

export default function AdminNotifications() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deeplink, setDeeplink] = useState("");
  const [role, setRole] = useState<string | undefined>(undefined);
  const [isVerified, setIsVerified] = useState<boolean | undefined>(undefined);
  const [isActive, setIsActive] = useState<boolean | undefined>(undefined);
  const [minCredit, setMinCredit] = useState<string>("");
  const [emailSearch, setEmailSearch] = useState("");
  const [channels, setChannels] = useState<{ push: boolean; email: boolean; sms: boolean }>({ push: true, email: false, sms: false });
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [variant, setVariant] = useState<string | undefined>(undefined);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [campaignId, setCampaignId] = useState<number | null>(null);
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/admin/notifications/templates", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const list = await res.json();
      setTemplates(list || []);
    } catch {}
  }

  function applyTemplate(t: Template) {
    setTitle(t.title);
    setBody(t.body);
    setDeeplink(t.deeplink_url || "");
  }

  async function createCampaign() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const payload = {
        title,
        body,
        deeplink_url: deeplink || null,
        channels: [
          ...(channels.push ? ["push"] : []),
          ...(channels.email ? ["email"] : []),
          ...(channels.sms ? ["sms"] : []),
        ],
        segment_role: role || null,
        segment_is_verified: typeof isVerified === "boolean" ? isVerified : null,
        segment_is_active: typeof isActive === "boolean" ? isActive : null,
        segment_min_credit_score: minCredit ? Number(minCredit) : null,
        segment_email_search: emailSearch || null,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        status: scheduledAt ? "scheduled" : "draft",
        variant: variant || null,
      };
      const res = await fetch("/api/admin/notifications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create campaign");
      setCampaignId(data.id);
      toast({ title: "Campaign created", description: `ID ${data.id}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function sendCampaign() {
    if (!campaignId) return;
    try {
      setSending(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/admin/notifications/campaigns/${campaignId}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send campaign");
      toast({ title: "Notifications dispatch complete", description: `Targets ${data.targets}, Push sent ${data.sent}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  async function refreshStatus() {
    if (!campaignId) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/admin/notifications/campaigns/${campaignId}/status`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to get status");
      setStatus(data.summary);
    } catch {}
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compose Notification</h1>
          <p className="text-sm text-muted-foreground mt-1">Legacy campaign composer — segment, schedule, and dispatch notifications</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compose Notification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Deep-link URL (optional)</Label>
                <Input value={deeplink} onChange={(e) => setDeeplink(e.target.value)} placeholder="/futures" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Message</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="resize-none" />
            </div>
            <div className="space-y-2 border-t border-border pt-4">
              <Label className="text-muted-foreground text-xs">Channels</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                  <Checkbox
                    aria-label="Enable Push channel"
                    checked={channels.push}
                    onCheckedChange={(v) => setChannels((c) => ({ ...c, push: !!v }))}
                  />
                  <span className="text-sm text-foreground">Push</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                  <Checkbox
                    aria-label="Enable Email channel"
                    checked={channels.email}
                    onCheckedChange={(v) => setChannels((c) => ({ ...c, email: !!v }))}
                  />
                  <span className="text-sm text-foreground">Email</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                  <Checkbox
                    aria-label="Enable SMS channel"
                    checked={channels.sms}
                    onCheckedChange={(v) => setChannels((c) => ({ ...c, sms: !!v }))}
                  />
                  <span className="text-sm text-foreground">SMS</span>
                </label>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border pt-4">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Role</Label>
                <Select onValueChange={(v) => setRole(v === "any" ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Verified</Label>
                <Select onValueChange={(v) => setIsVerified(v === "any" ? undefined : v === "true")}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="true">Verified</SelectItem>
                    <SelectItem value="false">Unverified</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Active</Label>
                <Select onValueChange={(v) => setIsActive(v === "any" ? undefined : v === "true")}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="true">Active</SelectItem>
                    <SelectItem value="false">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Min credit score</Label>
                <Input value={minCredit} onChange={(e) => setMinCredit(e.target.value)} placeholder="0.6" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Email contains</Label>
                <Input value={emailSearch} onChange={(e) => setEmailSearch(e.target.value)} placeholder="@gmail.com" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Schedule (optional)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border pt-4">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Variant</Label>
                <Select onValueChange={(v) => setVariant(v === "any" ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">None</SelectItem>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Templates</Label>
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <Button key={t.id} variant="outline" size="sm" onClick={() => applyTemplate(t)} className="text-xs">
                      {t.name}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} className="text-xs">
                    Preview
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button onClick={createCampaign} className="w-full sm:w-auto">Create Campaign</Button>
              <Button onClick={sendCampaign} disabled={!campaignId || sending} variant="outline" className="w-full sm:w-auto">
                {sending ? "Sending..." : "Send Now"}
              </Button>
              <Button onClick={refreshStatus} disabled={!campaignId} variant="outline" className="w-full sm:w-auto">
                Refresh Status
              </Button>
            </div>
            {status && (
              <div className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/40 p-3 space-y-1">
                {Object.entries(status).map(([k, v]) => (
                  <div key={k}>
                    <span className="text-foreground">{k}</span>: {v as any}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
