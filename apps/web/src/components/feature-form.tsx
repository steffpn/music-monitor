"use client";

import { useState, FormEvent, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { cn } from "@/lib/cn";
import type { Feature, MatrixFeature, FeatureFormData, Role } from "@/lib/types";

const CATEGORIES = [
  "analytics",
  "exports",
  "curation",
  "alerts",
  "reports",
  "live",
  "songs",
  "label",
  "general",
];

const ALL_ROLES: Role[] = ["ARTIST", "LABEL", "STATION"];

interface FeatureFormProps {
  feature?: Feature | MatrixFeature | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function FeatureForm({ feature, open, onClose, onSaved }: FeatureFormProps) {
  const [form, setForm] = useState<FeatureFormData>({
    key: "",
    name: "",
    description: "",
    category: "general",
    roles: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!feature;

  useEffect(() => {
    if (feature) {
      setForm({
        key: feature.key,
        name: feature.name,
        description: feature.description || "",
        category: ("category" in feature ? feature.category : "general") || "general",
        roles: feature.roles as Role[],
      });
    } else {
      setForm({ key: "", name: "", description: "", category: "general", roles: [] });
    }
    setError(null);
  }, [feature, open]);

  function toggleRole(role: Role) {
    setForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role],
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    try {
      if (isEditing) {
        await apiFetch(`/admin/features/${feature.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/admin/features", {
          method: "POST",
          token,
          body: JSON.stringify(form),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save feature");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? "Edit Feature" : "Add Feature"}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Key */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Key</label>
            <input
              type="text"
              required
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              placeholder="e.g. analytics.streams"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-zinc-600"
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Stream Analytics"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-zinc-600"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What does this feature do?"
              rows={3}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-zinc-600 resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-zinc-600"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Roles */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Applicable Roles</label>
            <div className="flex gap-3">
              {ALL_ROLES.map((role) => (
                <label
                  key={role}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition-colors",
                    form.roles.includes(role)
                      ? "bg-white/10 border-white/20 text-white"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={form.roles.includes(role)}
                    onChange={() => toggleRole(role)}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center",
                      form.roles.includes(role)
                        ? "bg-white border-white"
                        : "border-zinc-600"
                    )}
                  >
                    {form.roles.includes(role) && (
                      <svg className="w-3 h-3 text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {role}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                loading
                  ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
                  : "bg-white text-zinc-900 hover:bg-zinc-200"
              )}
            >
              {loading ? "Saving..." : isEditing ? "Update Feature" : "Create Feature"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
