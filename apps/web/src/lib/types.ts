export type Role = "ARTIST" | "LABEL" | "STATION";
export type Tier = "FREE" | "PREMIUM";

export interface Feature {
  id: number;
  key: string;
  name: string;
  description: string | null;
  category: string;
  roles: Role[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Plan {
  id: number;
  role: Role;
  tier: Tier;
  name: string;
  slug: string;
}

export interface MatrixFeature {
  id: number;
  key: string;
  name: string;
  description: string | null;
  category?: string;
  roles: string[];
  plans: Array<{ planId: number; included: boolean }>;
}

export interface MatrixCategory {
  category: string;
  features: MatrixFeature[];
}

export interface PlanMatrix {
  plans: Plan[];
  categories: MatrixCategory[];
}

export interface FeatureFormData {
  key: string;
  name: string;
  description: string;
  category: string;
  roles: Role[];
}
