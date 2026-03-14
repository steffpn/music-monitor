import { StreamStatus } from "../enums/status.js";

export interface Station {
  id: number;
  name: string;
  streamUrl: string;
  status: StreamStatus;
  country: string;
  stationType: "radio" | "tv";
  lastHeartbeat: Date | null;
  restartCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StationCreate {
  name: string;
  streamUrl: string;
  stationType: "radio" | "tv";
  country?: string;
}

export interface StationUpdate {
  name?: string;
  streamUrl?: string;
  status?: StreamStatus;
  stationType?: "radio" | "tv";
}
