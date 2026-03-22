"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/cn";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  scopes: Array<{ entityType: string; entityId: number }>;
  createdAt: string;
}

const ROLES = ["ARTIST", "LABEL", "STATION", "ADMIN"] as const;

const ROLE_COLORS: Record<string, string> = {
  ARTIST: "bg-purple-400/10 text-purple-400 border-purple-400/20",
  LABEL: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  STATION: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  ADMIN: "bg-amber-400/10 text-amber-400 border-amber-400/20",
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchUsers = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated. Please log in.");
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<User[]>("/admin/users", { token });
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function toggleActive(user: User) {
    const token = getToken();
    if (!token) return;
    setActionLoading(user.id);
    try {
      const action = user.isActive ? "deactivate" : "reactivate";
      await apiFetch(`/admin/users/${user.id}/${action}`, {
        method: "PATCH",
        token,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, isActive: !u.isActive } : u
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function changeRole(userId: number, newRole: string) {
    const token = getToken();
    if (!token) return;
    setActionLoading(userId);
    try {
      await apiFetch(`/admin/users/${userId}/role`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ role: newRole }),
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to change role");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-zinc-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading users...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12">
        <div className="bg-red-400/10 border border-red-400/20 rounded-xl p-6 text-center">
          <p className="text-red-400 mb-3">{error}</p>
          <button
            onClick={() => { setLoading(true); setError(null); fetchUsers(); }}
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-sm text-zinc-400 mt-1">{users.length} users</p>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Email</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Role</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Last Login</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Scopes</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-zinc-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-white font-medium">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{user.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => changeRole(user.id, e.target.value)}
                      disabled={actionLoading === user.id}
                      className={cn(
                        "text-xs font-medium px-2 py-1 rounded-md border bg-transparent cursor-pointer",
                        ROLE_COLORS[user.role] || "text-zinc-400 border-zinc-700"
                      )}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r} className="bg-zinc-900 text-white">
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-block text-xs font-medium px-2 py-1 rounded-full border",
                        user.isActive
                          ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                          : "bg-red-400/10 text-red-400 border-red-400/20"
                      )}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-500">
                    {user.lastLogin
                      ? new Date(user.lastLogin).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.scopes?.length > 0
                        ? user.scopes.map((scope, i) => (
                            <span
                              key={`${scope.entityType}-${scope.entityId}-${i}`}
                              className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded"
                            >
                              {scope.entityType}:{scope.entityId}
                            </span>
                          ))
                        : <span className="text-xs text-zinc-600">--</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive(user)}
                      disabled={actionLoading === user.id}
                      className={cn(
                        "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                        actionLoading === user.id && "opacity-50 cursor-not-allowed",
                        user.isActive
                          ? "bg-red-400/10 text-red-400 hover:bg-red-400/20"
                          : "bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20"
                      )}
                    >
                      {user.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="py-16 text-center text-zinc-500">No users found.</div>
        )}
      </div>
    </div>
  );
}
