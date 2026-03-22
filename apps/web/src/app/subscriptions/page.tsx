"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/cn";

interface Subscription {
  id: number;
  userName: string;
  userEmail: string;
  planName: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "unpaid";
  billingInterval: "monthly" | "annual";
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  trialing: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  past_due: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  canceled: "bg-red-400/10 text-red-400 border-red-400/20",
  incomplete: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20",
  unpaid: "bg-orange-400/10 text-orange-400 border-orange-400/20",
};

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated. Please log in.");
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<Subscription[]>("/admin/subscriptions", { token });
      setSubscriptions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-zinc-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading subscriptions...
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
            onClick={() => { setLoading(true); setError(null); fetchSubscriptions(); }}
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const statusCounts = subscriptions.reduce<Record<string, number>>((acc, sub) => {
    acc[sub.status] = (acc[sub.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Subscriptions</h1>
          <p className="text-sm text-zinc-400 mt-1">{subscriptions.length} total subscriptions</p>
        </div>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {(["active", "trialing", "past_due", "canceled"] as const).map((status) => (
          <div
            key={status}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
          >
            <div className="text-sm text-zinc-500 capitalize">{status.replace("_", " ")}</div>
            <div className="text-2xl font-bold text-white mt-1">{statusCounts[status] || 0}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">User</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Plan</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Interval</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Trial End</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Period End</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400">Cancel</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr
                  key={sub.id}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-white">{sub.userName}</div>
                    <div className="text-xs text-zinc-500">{sub.userEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-300">{sub.planName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-block text-xs font-medium px-2 py-1 rounded-full border",
                        STATUS_STYLES[sub.status] || "text-zinc-400 border-zinc-700"
                      )}
                    >
                      {sub.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-400 capitalize">{sub.billingInterval}</td>
                  <td className="px-4 py-3 text-sm text-zinc-500">
                    {sub.trialEnd
                      ? new Date(sub.trialEnd).toLocaleDateString()
                      : "--"}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-500">
                    {sub.currentPeriodEnd
                      ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                      : "--"}
                  </td>
                  <td className="px-4 py-3">
                    {sub.cancelAtPeriodEnd ? (
                      <span className="text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-1 rounded-full border border-amber-400/20">
                        Canceling
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-600">--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {subscriptions.length === 0 && (
          <div className="py-16 text-center text-zinc-500">No subscriptions found.</div>
        )}
      </div>
    </div>
  );
}
