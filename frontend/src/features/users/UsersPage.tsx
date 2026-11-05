import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import type { AppUser } from '@/lib/api/types';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/roles';
import { useAuth } from '@/lib/auth/context';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TextField } from '@/components/ui/Field';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/toast-context';
import { FIELD_CONTROL } from '@/components/ui/styles';
import { formatDateTime } from '@/features/common/format';

interface PendingChange {
  user: AppUser;
  role: Role;
}

export function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .listUsers()
      .then((response) => setUsers(response.items))
      .catch((cause: unknown) => setError(cause instanceof ApiError ? cause : new ApiError(0, 'unknown', 'Users could not be loaded.')));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!users) return [];
    if (!needle) return users;
    return users.filter((user) => user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle));
  }, [users, search]);

  async function confirmChange() {
    if (!pending) return;
    setSaving(true);
    try {
      const updated = await api.updateUserRole(pending.user.user_id, pending.role);
      setUsers((current) => current?.map((user) => (user.user_id === updated.user_id ? updated : user)) ?? null);
      toast.notify({ tone: 'success', title: `${updated.name} is now ${ROLE_LABELS[updated.role]}`, description: 'The change applies at their next token refresh, which can take up to an hour.' });
      setPending(null);
    } catch (cause) {
      toast.notify({ tone: 'error', title: 'The role was not changed', description: cause instanceof ApiError ? cause.message : 'Try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Users</h1>
          <p className="text-sm text-ink-2">People who have signed in. Roles decide what they can see and do.</p>
        </div>
      </header>

      {error && <ErrorState message={error.message} onRetry={load} />}
      {!error && users === null && <SkeletonRows rows={4} label="Loading users" />}

      {users !== null && users.length === 0 && (
        <EmptyState title="No users yet" description="People appear here after their first sign-in." />
      )}

      {users !== null && users.length > 0 && (
        <>
          <TextField label="Find a person" type="search" placeholder="Name or email" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Users and their roles</caption>
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-2">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">Email</th>
                  <th scope="col" className="px-4 py-3 font-medium">Role</th>
                  <th scope="col" className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((user) => {
                  const self = me?.sub === user.user_id;
                  return (
                    <tr key={user.user_id}>
                      <td className="px-4 py-3 font-medium text-ink">
                        {user.name}
                        {self && <span className="ml-2 text-xs font-normal text-ink-2">(you)</span>}
                      </td>
                      <td className="px-4 py-3 text-ink-2">{user.email}</td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`Role for ${user.name}`}
                          className={`${FIELD_CONTROL} w-auto py-1.5 text-sm`}
                          value={user.role}
                          disabled={self}
                          title={self ? 'You cannot change your own role here' : undefined}
                          onChange={(event) => {
                            const role = ROLES.find((candidate) => candidate === event.target.value);
                            if (role && role !== user.role) setPending({ user, role });
                          }}
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-2">{formatDateTime(user.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <p className="text-sm text-ink-2">No one matches “{search}”.</p>}
        </>
      )}

      <Dialog
        open={pending !== null}
        title={pending ? `Change ${pending.user.name} to ${ROLE_LABELS[pending.role]}?` : ''}
        confirmLabel="Change role"
        busy={saving}
        destructive={pending?.role !== 'Admin' && pending?.user.role === 'Admin'}
        onConfirm={() => void confirmChange()}
        onClose={() => setPending(null)}
      >
        {pending && (
          <p>
            {pending.role === 'Admin'
              ? 'Admins can see the dashboard and manage users.'
              : pending.user.role === 'Admin'
                ? 'They will lose admin access.'
                : 'Their access will change to match this role.'}{' '}
            It takes effect at their next token refresh, which can take up to an hour.
          </p>
        )}
      </Dialog>
    </div>
  );
}
