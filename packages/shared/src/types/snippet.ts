export interface AudioSnippet {
  id: number;
  detectionId: number;
  stationId: number;
  storageKey: string;
  durationMs: number;
  encoding: string;
  bitrate: number;
  sizeBytes: number;
  presignedUrl: string | null;
  createdAt: Date;
}

export interface SnippetCreate {
  detectionId: number;
  stationId: number;
  storageKey: string;
  sizeBytes: number;
}
