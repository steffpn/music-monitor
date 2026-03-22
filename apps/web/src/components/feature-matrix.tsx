"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { FeatureForm } from "@/components/feature-form";
import type { Feature, Plan, PlanMatrix, MatrixFeature, Role, Tier } from "@/lib/types";

const PLAN_COLUMNS: { role: Role; tier: Tier; label: string }[] = [
  { role: "ARTIST", tier: "FREE", label: "Artist Free" },
  { role: "ARTIST", tier: "PREMIUM", label: "Artist Premium" },
  { role: "LABEL", tier: "FREE", label: "Label Free" },
  { role: "LABEL", tier: "PREMIUM", label: "Label Premium" },
  { role: "STATION", tier: "FREE", label: "Station Free" },
  { role: "STATION", tier: "PREMIUM", label: "Station Premium" },
];

const ROLE_COLORS: Record<Role, string> = {
  ARTIST: "text-purple-400",
  LABEL: "text-blue-400",
  STATION: "text-emerald-400",
};

export function FeatureMatrix() {
  const [data, setData] = useState<PlanMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState<MatrixFeature | Feature | null>(null);

  const fetchMatrix = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Not authenticated. Please log in.");
      setLoading(false);
      return;
    }

    try {
      const matrix = await apiFetch<PlanMatrix>("/admin/plans/matrix", { token });
      setData(matrix);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load matrix");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatrix();
  }, [fetchMatrix]);

  function findPlan(role: Role, tier: Tier): Plan | undefined {
    return data?.plans.find((p) => p.role === role && p.tier === tier);
  }

  function isIncluded(feature: MatrixFeature, role: Role, tier: Tier): boolean {
    const plan = findPlan(role, tier);
    if (!plan) return false;
    const entry = feature.plans.find((p) => p.planId === plan.id);
    return entry?.included ?? false;
  }

  function isFeatureApplicable(feature: MatrixFeature, role: Role): boolean {
    return feature.roles.includes(role);
  }

  async function toggleFeature(feature: MatrixFeature, role: Role, tier: Tier) {
    const plan = findPlan(role, tier);
    if (!plan) return;

    const token = getToken();
    if (!token) return;

    const toggleKey = `${role}-${tier}-${feature.id}`;
    setToggling(toggleKey);

    const currentlyIncluded = isIncluded(feature, role, tier);

    try {
      if (currentlyIncluded) {
        await apiFetch(`/admin/plans/${plan.id}/features/${feature.id}`, {
          method: "DELETE",
          token,
        });
      } else {
        await apiFetch(`/admin/plans/${plan.id}/features`, {
          method: "POST",
          token,
          body: JSON.stringify({ featureId: feature.id }),
        });
      }
      // Refresh from server
      fetchMatrix();
    } catch {
      fetchMatrix();
    } finally {
      setToggling(null);
    }
  }

  function handleEdit(feature: MatrixFeature) {
    setEditingFeature(feature);
    setFormOpen(true);
  }

  function handleAddNew() {
    setEditingFeature(null);
    setFormOpen(true);
  }

  function handleSaved() {
    fetchMatrix();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex items-center gap-3 text-zinc-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading feature matrix...
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
            onClick={() => { setLoading(true); setError(null); fetchMatrix(); }}
            className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Feature & Permission Matrix</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {data.categories.reduce((sum, c) => sum + c.features.length, 0)} features across {data.plans.length} plans
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-white text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Feature
        </button>
      </div>

      {/* Matrix table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-3 text-sm font-medium text-zinc-400 w-80 min-w-[320px]">
                  Feature
                </th>
                {PLAN_COLUMNS.map((col) => (
                  <th
                    key={`${col.role}-${col.tier}`}
                    className="px-3 py-3 text-center text-sm font-medium text-zinc-400 min-w-[100px]"
                  >
                    <div className={cn("text-xs font-semibold", ROLE_COLORS[col.role])}>
                      {col.role}
                    </div>
                    <div className="text-zinc-500 text-xs mt-0.5">{col.tier}</div>
                  </th>
                ))}
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {data.categories.map((cat) => (
                <CategoryGroup
                  key={cat.category}
                  category={cat.category}
                  features={cat.features}
                  isIncluded={isIncluded}
                  isFeatureApplicable={isFeatureApplicable}
                  toggleFeature={toggleFeature}
                  toggling={toggling}
                  onEdit={handleEdit}
                />
              ))}
            </tbody>
          </table>
        </div>

        {data.categories.length === 0 && (
          <div className="py-16 text-center text-zinc-500">
            <p className="mb-2">No features defined yet.</p>
            <button
              onClick={handleAddNew}
              className="text-sm text-white hover:underline"
            >
              Add your first feature
            </button>
          </div>
        )}
      </div>

      {/* Feature Form Modal */}
      <FeatureForm
        feature={editingFeature}
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingFeature(null); }}
        onSaved={handleSaved}
      />
    </div>
  );
}

/* ---------- Category Group ---------- */

interface CategoryGroupProps {
  category: string;
  features: MatrixFeature[];
  isIncluded: (feature: MatrixFeature, role: Role, tier: Tier) => boolean;
  isFeatureApplicable: (feature: MatrixFeature, role: Role) => boolean;
  toggleFeature: (feature: MatrixFeature, role: Role, tier: Tier) => void;
  toggling: string | null;
  onEdit: (feature: MatrixFeature) => void;
}

function CategoryGroup({
  category,
  features,
  isIncluded,
  isFeatureApplicable,
  toggleFeature,
  toggling,
  onEdit,
}: CategoryGroupProps) {
  return (
    <>
      {/* Category header row */}
      <tr className="bg-zinc-800/40">
        <td
          colSpan={PLAN_COLUMNS.length + 2}
          className="px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider"
        >
          {category}
        </td>
      </tr>

      {/* Feature rows */}
      {features.map((feature) => (
        <tr
          key={feature.id}
          className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors"
        >
          <td className="px-4 py-3">
            <div className="text-sm font-medium text-white">{feature.name}</div>
            {feature.description && (
              <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{feature.description}</div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-mono text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
                {feature.key}
              </span>
              {feature.roles.map((role) => (
                <span
                  key={role}
                  className={cn("text-[10px] font-medium", ROLE_COLORS[role as Role])}
                >
                  {role}
                </span>
              ))}
            </div>
          </td>

          {PLAN_COLUMNS.map((col) => {
            const applicable = isFeatureApplicable(feature, col.role);
            const checked = isIncluded(feature, col.role, col.tier);
            const isToggling = toggling === `${col.role}-${col.tier}-${feature.id}`;

            return (
              <td key={`${col.role}-${col.tier}`} className="px-3 py-3 text-center">
                {applicable ? (
                  <button
                    onClick={() => toggleFeature(feature, col.role, col.tier)}
                    disabled={!!toggling}
                    className="inline-flex items-center justify-center"
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                        isToggling && "opacity-50",
                        checked
                          ? "bg-white border-white"
                          : "border-zinc-600 hover:border-zinc-400"
                      )}
                    >
                      {checked && (
                        <svg className="w-3.5 h-3.5 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                ) : (
                  <span className="text-zinc-700">—</span>
                )}
              </td>
            );
          })}

          <td className="px-2 py-3">
            <button
              onClick={() => onEdit(feature)}
              className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
              title="Edit feature"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}
