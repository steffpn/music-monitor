export interface DetectionEvent {
  id: number;
  stationId: number;
  detectedAt: Date;
  songTitle: string;
  artistName: string;
  albumTitle: string | null;
  isrc: string | null;
  confidence: number;
  durationMs: number;
  rawCallbackId: string | null;
  createdAt: Date;
}

export interface DetectionCreate {
  stationId: number;
  detectedAt: Date;
  songTitle: string;
  artistName: string;
  albumTitle?: string;
  isrc?: string;
  confidence: number;
  durationMs: number;
  rawCallbackId?: string;
}

export interface AirplayEvent {
  id: number;
  stationId: number;
  startedAt: Date;
  endedAt: Date;
  songTitle: string;
  artistName: string;
  isrc: string | null;
  playCount: number;
  snippetUrl: string | null;
  createdAt: Date;
}

export interface AirplayCreate {
  stationId: number;
  startedAt: Date;
  endedAt: Date;
  songTitle: string;
  artistName: string;
  isrc?: string;
  playCount: number;
}
