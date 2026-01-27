import { Context, Data, Effect, Layer } from "effect";
import * as nodeID3 from "node-id3";

export class MetadataError extends Data.TaggedError("MetadataError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export interface PodcastMetadata {
  readonly title?: string;
  readonly artist?: string;
  readonly album?: string;
  readonly genre?: string;
  readonly comment?: string;
  readonly year?: string;
}

/**
 * MetadataEditor Service Tag
 */
export class MetadataEditor extends Context.Tag("MetadataEditor")<
  MetadataEditor,
  {
    /** Writes ID3 tags to an MP3 file */
    readonly write: (path: string, metadata: PodcastMetadata) => Effect.Effect<void, MetadataError>;
  }
>() {}

/**
 * Live implementation of MetadataEditor using node-id3.
 */
export const MetadataEditorLive = Layer.succeed(MetadataEditor, {
  write: (path, metadata) =>
    Effect.tryPromise({
      try: () => {
        const tags: nodeID3.Tags = {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          genre: metadata.genre,
          comment: {
            language: "eng",
            text: metadata.comment || "",
          },
          year: metadata.year,
        };
        // Use the Promise API to avoid blocking the main thread (and the TUI)
        return nodeID3.Promise.write(tags, path);
      },
      catch: (cause) => new MetadataError({ path, cause }),
    }),
});

/**
 * Creates a test implementation of MetadataEditor that does nothing.
 */
export const createMetadataEditorTest = () =>
  Layer.succeed(MetadataEditor, {
    write: () => Effect.void,
  });
