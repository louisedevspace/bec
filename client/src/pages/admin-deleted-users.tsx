import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { buildApiUrl } from '@/lib/config';
import AdminLayout from './admin-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, RefreshCw, Search, ShieldX, UserX } from 'lucide-react';
import { formatDateTime, timeAgo } from '@/lib/date-utils';

type DeletionType = 'admin' | 'self';

interface DeletedUserRow {
  id: number;
  deleted_at: string;
  deletion_type: DeletionType;
  reason: string | null;
  target_user_id: string | null;
  target_email: string | null;
  target_full_name: string | null;
  target_display_id: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_full_name: string | null;
}

export default function AdminDeletedUsers() {
  const [rows, setRows] = useState<DeletedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | DeletionType>('all');

  const fetchDeletedUsers = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No authentication token');

      const res = await fetch(buildApiUrl('/admin/deleted-users'), {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to fetch deleted users');

      setRows(Array.isArray(data?.deletedUsers) ? data.deletedUsers : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch deleted users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedUsers();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (typeFilter !== 'all' && row.deletion_type !== typeFilter) return false;
      if (!q) return true;

      const haystack = [
        row.target_email,
        row.target_full_name,
        row.target_display_id,
        row.target_user_id,
        row.actor_email,
        row.actor_full_name,
        row.reason,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [rows, search, typeFilter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const adminDeleted = rows.filter((r) => r.deletion_type === 'admin').length;
    const selfDeleted = rows.filter((r) => r.deletion_type === 'self').length;
    return { total, adminDeleted, selfDeleted };
  }, [rows]);

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Deleted Users</h1>
            <p className="text-sm text-gray-400 mt-1">
              Track both admin-deleted accounts and self-deleted accounts.
            </p>
          </div>
          <Button
            onClick={fetchDeletedUsers}
            variant="outline"
            className="border-[#2b2b2b] bg-[#161616] text-gray-200 hover:bg-[#1f1f1f]"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-[#111] border-[#222]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400">Total Deleted</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-white">{stats.total}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#111] border-[#222]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400">Deleted by Admin</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-orange-400">{stats.adminDeleted}</p>
            </CardContent>
          </Card>
          <Card className="bg-[#111] border-[#222]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-400">Self Deleted</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-cyan-400">{stats.selfDeleted}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by user, actor, reason, or ID"
              className="pl-9 bg-[#111] border-[#2a2a2a] text-white"
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant={typeFilter === 'all' ? 'default' : 'outline'}
              className={typeFilter === 'all' ? '' : 'border-[#2b2b2b] bg-[#161616] text-gray-200 hover:bg-[#1f1f1f]'}
              onClick={() => setTypeFilter('all')}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={typeFilter === 'admin' ? 'default' : 'outline'}
              className={typeFilter === 'admin' ? '' : 'border-[#2b2b2b] bg-[#161616] text-gray-200 hover:bg-[#1f1f1f]'}
              onClick={() => setTypeFilter('admin')}
            >
              Admin Deleted
            </Button>
            <Button
              size="sm"
              variant={typeFilter === 'self' ? 'default' : 'outline'}
              className={typeFilter === 'self' ? '' : 'border-[#2b2b2b] bg-[#161616] text-gray-200 hover:bg-[#1f1f1f]'}
              onClick={() => setTypeFilter('self')}
            >
              Self Deleted
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="space-y-3">
          {loading && (
            <div className="text-gray-400 text-sm">Loading deleted users...</div>
          )}

          {!loading && filteredRows.length === 0 && (
            <Card className="bg-[#111] border-[#222]">
              <CardContent className="py-10 text-center text-gray-400 text-sm">
                No deleted users found for the selected filters.
              </CardContent>
            </Card>
          )}

          {!loading && filteredRows.map((row) => (
            <Card key={row.id} className="bg-[#111] border-[#222]">
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge className={row.deletion_type === 'admin' ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'}>
                      {row.deletion_type === 'admin' ? (
                        <span className="inline-flex items-center gap-1">
                          <ShieldX className="w-3 h-3" /> Admin Deleted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <UserX className="w-3 h-3" /> Self Deleted
                        </span>
                      )}
                    </Badge>
                    <span className="text-xs text-gray-500">{timeAgo(row.deleted_at)}</span>
                  </div>
                  <span className="text-xs text-gray-500">{formatDateTime(row.deleted_at)}</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md bg-[#0d0d0d] border border-[#1f1f1f] p-3">
                    <p className="text-xs text-gray-500 mb-1">Deleted Account</p>
                    <p className="text-white font-medium">{row.target_full_name || 'Unknown user'}</p>
                    <p className="text-gray-300">{row.target_email || 'No email snapshot'}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      ID: {row.target_display_id || row.target_user_id || 'Unavailable'}
                    </p>
                  </div>

                  <div className="rounded-md bg-[#0d0d0d] border border-[#1f1f1f] p-3">
                    <p className="text-xs text-gray-500 mb-1">Deletion Source</p>
                    {row.deletion_type === 'admin' ? (
                      <>
                        <p className="text-white font-medium">Admin action</p>
                        <p className="text-gray-300">{row.actor_full_name || row.actor_email || 'Unknown admin'}</p>
                        <p className="text-xs text-gray-500 mt-1">Admin ID: {row.actor_user_id || 'Unavailable'}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-white font-medium">User self-deleted</p>
                        <p className="text-gray-300">Initiated by the account owner</p>
                      </>
                    )}
                  </div>
                </div>

                {row.reason && (
                  <div className="text-xs text-gray-400 border-t border-[#1f1f1f] pt-3">
                    Reason: {row.reason}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
