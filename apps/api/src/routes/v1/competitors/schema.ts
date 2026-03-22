import { Type, type Static } from "@sinclair/typebox";

// --- Request Schemas ---

export const AddWatchedStationBodySchema = Type.Object({
  stationId: Type.Number(),
});

export type AddWatchedStationBody = Static<typeof AddWatchedStationBodySchema>;

export const StationIdParamsSchema = Type.Object({
  stationId: Type.Number(),
});

export type StationIdParams = Static<typeof StationIdParamsSchema>;

export const PeriodQuerySchema = Type.Object({
  period: Type.Optional(
    Type.Union([
      Type.Literal("day"),
      Type.Literal("week"),
      Type.Literal("month"),
    ]),
  ),
});

export type PeriodQuery = Static<typeof PeriodQuerySchema>;

// --- Response Schemas ---

export const WatchedStationResponseSchema = Type.Object({
  id: Type.Number(),
  stationId: Type.Number(),
  stationName: Type.String(),
});

export const CompetitorCardResponseSchema = Type.Object({
  stationId: Type.Number(),
  stationName: Type.String(),
  playCount: Type.Number(),
  topSong: Type.Union([
    Type.Object({ title: Type.String(), artist: Type.String() }),
    Type.Null(),
  ]),
});

export const CompetitorDetailResponseSchema = Type.Object({
  topSongs: Type.Array(
    Type.Object({
      title: Type.String(),
      artist: Type.String(),
      isrc: Type.Union([Type.String(), Type.Null()]),
      playCount: Type.Number(),
    }),
  ),
  recentDetections: Type.Array(
    Type.Object({
      id: Type.Number(),
      songTitle: Type.String(),
      artistName: Type.String(),
      startedAt: Type.String(),
    }),
  ),
  comparison: Type.Array(
    Type.Object({
      songTitle: Type.String(),
      artistName: Type.String(),
      theirPlays: Type.Number(),
      yourPlays: Type.Number(),
    }),
  ),
});

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
});
