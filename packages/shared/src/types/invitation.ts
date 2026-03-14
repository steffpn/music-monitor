import { UserRole } from "../enums/roles.js";
import { InvitationStatus } from "../enums/roles.js";

export interface Invitation {
  id: number;
  code: string;
  role: UserRole;
  scopeId: number | null;
  status: InvitationStatus;
  createdBy: number;
  redeemedBy: number | null;
  expiresAt: Date;
  createdAt: Date;
  redeemedAt: Date | null;
}

export interface InvitationCreate {
  role: UserRole;
  scopeId?: number;
  expiresAt?: Date;
}
