import { Type, type Static } from "@sinclair/typebox";

// ACRCloud music result within metadata
const AcrMusicResultSchema = Type.Object({
  title: Type.String(),
  artists: Type.Array(Type.Object({ name: Type.String() })),
  album: Type.Optional(Type.Object({ name: Type.Optional(Type.String()) })),
  duration_ms: Type.Number(),
  score: Type.Number(),
  acrid: Type.String(),
  play_offset_ms: Type.Optional(Type.Number()),
  external_ids: Type.Optional(
    Type.Object({
      isrc: Type.Optional(
        Type.Union([Type.String(), Type.Array(Type.String())]),
      ),
      upc: Type.Optional(
        Type.Union([Type.String(), Type.Array(Type.String())]),
      ),
    }),
  ),
  external_metadata: Type.Optional(Type.Unknown()),
  release_date: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
  genres: Type.Optional(Type.Array(Type.Object({ name: Type.String() }))),
  result_from: Type.Optional(Type.Number()),
  sample_begin_time_offset_ms: Type.Optional(Type.Number()),
  sample_end_time_offset_ms: Type.Optional(Type.Number()),
  db_begin_time_offset_ms: Type.Optional(Type.Number()),
  db_end_time_offset_ms: Type.Optional(Type.Number()),
});

const AcrMetadataSchema = Type.Object({
  music: Type.Optional(Type.Array(AcrMusicResultSchema)),
  timestamp_utc: Type.String(),
  played_duration: Type.Optional(Type.Number()),
  type: Type.Optional(Type.String()),
});

const AcrStatusSchema = Type.Object({
  msg: Type.String(),
  code: Type.Number(),
  version: Type.Optional(Type.String()),
});

const AcrDataSchema = Type.Object({
  status: AcrStatusSchema,
  result_type: Type.Optional(Type.Number()),
  metadata: Type.Optional(AcrMetadataSchema),
});

export const AcrCloudCallbackSchema = Type.Object({
  stream_id: Type.String(),
  stream_url: Type.Optional(Type.String()),
  stream_name: Type.Optional(Type.String()),
  status: Type.Number(),
  data: AcrDataSchema,
});

export type AcrCloudCallbackBody = Static<typeof AcrCloudCallbackSchema>;
