import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Headphones, Plus, Search, Trash2, KeyRound, Power, PowerOff,
  Loader2, Copy, Check, ShieldCheck, MessageSquare, X, RefreshCw, Eye, EyeOff,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { formatDate } from "@/lib/date-utils";
import AdminLayout from "./admin-layout";

// ─── Types ───────────────────────────────────────────────────────
interface SupportAgent {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  replies?: number;
  last_reply_at?: string | null;
}

const AGENTS_KEY = ["/api/admin/support-agents"];

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("No authentication token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function request(url: string, init: RequestInit = {}) {
  const headers = await authHeaders();
  const res = await fetch(url, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || "Request failed");
  return body;
}

// Password that satisfies the server policy: upper, lower, digit, symbol, 8+
function generatePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];

  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 14) chars.push(pick(all));

  // Fisher–Yates so the guaranteed characters aren't always in front
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// ─── Password field with show/hide + generate ────────────────────
function PasswordField({
  value, onChange, label, placeholder,
}: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-400">{label}</label>
        <button
          type="button"
          onClick={() => { onChange(generatePassword()); setVisible(true); }}
          className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          Generate
        </button>
      </div>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "Minimum 8 characters"}
          autoComplete="new-password"
          className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl pl-3 pr-11 py-3 text-base sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-gray-500 hover:text-gray-300 transition-colors"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <p className="text-[11px] text-gray-600 mt-1.5">
        Needs an uppercase letter, a lowercase letter, a digit and a symbol.
      </p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────
export default function AdminSupportAgentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [createdAgent, setCreatedAgent] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetTarget, setResetTarget] = useState<SupportAgent | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SupportAgent | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<{ agents: SupportAgent[] }>({
    queryKey: AGENTS_KEY,
    queryFn: () => request("/api/admin/support-agents"),
    refetchInterval: 60000,
  });

  const agents = data?.agents ?? [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return agents;
    return agents.filter((a) =>
      (a.full_name || "").toLowerCase().includes(term) ||
      a.email.toLowerCase().includes(term)
    );
  }, [agents, search]);

  const activeCount = agents.filter((a) => a.is_active).length;
  const totalReplies = agents.reduce((sum, a) => sum + (a.replies || 0), 0);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: AGENTS_KEY });

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) =>
      request("/api/admin/support-agents", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (_res, variables) => {
      invalidate();
      setShowCreate(false);
      setCreatedAgent({ email: variables.email, password: variables.password });
      setForm({ fullName: "", email: "", password: "" });
    },
    onError: (err: Error) => toast({ title: "Could not create agent", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; isActive?: boolean; password?: string; fullName?: string }) =>
      request(`/api/admin/support-agents/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: (_res, variables) => {
      invalidate();
      toast({ title: variables.password ? "Password updated" : "Agent updated" });
      setResetTarget(null);
      setResetPassword("");
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => request(`/api/admin/support-agents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Support agent deleted" });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const copyCredentials = async () => {
    if (!createdAgent) return;
    try {
      await navigator.clipboard.writeText(`Email: ${createdAgent.email}\nPassword: ${createdAgent.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Copy the credentials manually.", variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="w-full space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">Support Agents</h1>
            <p className="text-sm text-gray-500 mt-1">
              Create login accounts for the people who answer customer chats.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="h-10 px-3 rounded-xl border border-[#2a2a2a] text-gray-400 hover:text-white hover:bg-[#1a1a1a] transition-colors flex items-center gap-1.5 text-sm"
            >
              <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => { setForm({ fullName: "", email: "", password: generatePassword() }); setShowCreate(true); }}
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors flex items-center gap-2 text-sm"
            >
              <Plus size={16} />
              New Agent
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Agents", value: agents.length, icon: Headphones, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "Active", value: activeCount, icon: ShieldCheck, color: "text-green-400", bg: "bg-green-500/10" },
            { label: "Replies", value: totalReplies, icon: MessageSquare, color: "text-gray-300", bg: "bg-[#1a1a1a]" },
          ].map((s) => (
            <div key={s.label} className="bg-[#111] rounded-2xl border border-[#1e1e1e] p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{s.label}</p>
                <div className={`w-7 h-7 ${s.bg} rounded-lg flex items-center justify-center`}>
                  <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                </div>
              </div>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full bg-[#111] border border-[#1e1e1e] rounded-xl pl-10 pr-3 py-3 text-base sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Agent list */}
        <div className="bg-[#111] rounded-2xl border border-[#1e1e1e] overflow-hidden">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mb-3 text-blue-500" />
              <p className="text-sm">Loading agents...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 px-6 text-center">
              <div className="w-14 h-14 bg-[#1a1a1a] rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <Headphones className="h-6 w-6 text-gray-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-300 mb-1">
                {agents.length === 0 ? "No support agents yet" : "No matching agents"}
              </h3>
              <p className="text-xs text-gray-600 max-w-xs mx-auto">
                {agents.length === 0
                  ? "Create an account so a teammate can sign in and answer customer chats."
                  : "Try a different name or email."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#1e1e1e]">
              {filtered.map((agent) => (
                <li key={agent.id} className="p-4 hover:bg-[#0d0d0d] transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm ${
                      agent.is_active ? "bg-blue-500/15 text-blue-400" : "bg-[#1a1a1a] text-gray-600"
                    }`}>
                      {(agent.full_name || agent.email)[0]?.toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-white truncate">{agent.full_name || agent.username}</h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                          agent.is_active
                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                            : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                        }`}>
                          {agent.is_active ? "Active" : "Disabled"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{agent.email}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-600 flex-wrap">
                        <span>{agent.replies ?? 0} replies</span>
                        <span>Added {formatDate(agent.created_at)}</span>
                        {agent.last_reply_at && <span>Last reply {formatDate(agent.last_reply_at)}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions — full-width touch targets on mobile */}
                  <div className="flex items-center gap-2 mt-3 sm:mt-2 sm:justify-end">
                    <button
                      onClick={() => updateMutation.mutate({ id: agent.id, isActive: !agent.is_active })}
                      disabled={updateMutation.isPending}
                      className={`flex-1 sm:flex-none h-10 px-3 rounded-xl border text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                        agent.is_active
                          ? "border-[#2a2a2a] text-gray-400 hover:text-yellow-400 hover:border-yellow-500/30"
                          : "border-green-500/20 text-green-400 hover:bg-green-500/10"
                      }`}
                    >
                      {agent.is_active ? <PowerOff size={14} /> : <Power size={14} />}
                      {agent.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => { setResetTarget(agent); setResetPassword(generatePassword()); }}
                      className="flex-1 sm:flex-none h-10 px-3 rounded-xl border border-[#2a2a2a] text-gray-400 hover:text-blue-400 hover:border-blue-500/30 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      <KeyRound size={14} />
                      Password
                    </button>
                    <button
                      onClick={() => setDeleteTarget(agent)}
                      className="h-10 w-10 sm:w-auto sm:px-3 rounded-xl border border-[#2a2a2a] text-gray-500 hover:text-red-400 hover:border-red-500/30 transition-colors flex items-center justify-center"
                      aria-label="Delete agent"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[11px] text-gray-600">
          Support agents sign in with these credentials and land straight in the support inbox.
          They can read and answer tickets only — the rest of the admin panel stays admin-only.
        </p>
      </div>

      {/* ─── Create agent ───────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md" hideCloseButton>
          <div className="flex items-start justify-between mb-1">
            <h2 className="text-lg font-bold text-white">New Support Agent</h2>
            <button onClick={() => setShowCreate(false)} className="p-1.5 -mr-1.5 -mt-1 rounded-lg text-gray-500 hover:text-white hover:bg-[#1a1a1a]">
              <X size={18} />
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-5">
            The account can sign in immediately — no email confirmation needed.
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-400 block mb-2">Agent name</label>
              <input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="e.g. Sarah from Support"
                className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl px-3 py-3 text-base sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-400 block mb-2">Email</label>
              <input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="agent@company.com"
                className="w-full bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl px-3 py-3 text-base sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <PasswordField
              label="Password"
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
            />
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={() => setShowCreate(false)}
              className="flex-1 h-11 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-medium rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.fullName || !form.email || !form.password || createMutation.isPending}
              className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Create Agent
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Credentials handoff ────────────────────────────── */}
      <Dialog open={!!createdAgent} onOpenChange={(open) => !open && setCreatedAgent(null)}>
        <DialogContent className="max-w-md" hideCloseButton>
          <h2 className="text-lg font-bold text-white mb-1">Agent created</h2>
          <p className="text-xs text-gray-500 mb-4">
            Share these credentials with the agent. You can always reset the password later.
          </p>
          <div className="bg-[#0a0a0a] border border-[#1e1e1e] rounded-xl p-3 space-y-2 font-mono text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Email</span>
              <span className="text-white truncate">{createdAgent?.email}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Password</span>
              <span className="text-white truncate">{createdAgent?.password}</span>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button
              onClick={copyCredentials}
              className="flex-1 h-11 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={() => setCreatedAgent(null)}
              className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Reset password ─────────────────────────────────── */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="max-w-md" hideCloseButton>
          <h2 className="text-lg font-bold text-white mb-1">Reset password</h2>
          <p className="text-xs text-gray-500 mb-5 truncate">{resetTarget?.email}</p>
          <PasswordField label="New password" value={resetPassword} onChange={setResetPassword} />
          <div className="flex gap-2 mt-6">
            <button
              onClick={() => setResetTarget(null)}
              className="flex-1 h-11 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-medium rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => resetTarget && updateMutation.mutate({ id: resetTarget.id, password: resetPassword })}
              disabled={!resetPassword || updateMutation.isPending}
              className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {updateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              Update
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirm ─────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md" hideCloseButton>
          <h2 className="text-lg font-bold text-white mb-1">Delete support agent?</h2>
          <p className="text-sm text-gray-400 mb-2">
            <span className="text-white">{deleteTarget?.full_name || deleteTarget?.email}</span> will lose access
            immediately.
          </p>
          <p className="text-xs text-gray-600 mb-5">
            Replies they already sent stay in the ticket history.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 h-11 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-white font-medium rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="flex-1 h-11 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
