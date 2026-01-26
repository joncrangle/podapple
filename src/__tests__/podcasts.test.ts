import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { FileSystemLive } from "@/services/effects/FileSystem";
import { LoggerLive } from "@/services/effects/Logger";
import { PodcastService, PodcastServiceLive } from "@/services/effects/PodcastService";

describe("PodcastService", () => {
  describe("getDatabasePath", () => {
    test("returns path containing podcasts group container", async () => {
      const program = Effect.gen(function* () {
        const service = yield* PodcastService;
        const path = service.getDatabasePath();
        expect(path).toContain("243LU875E5.groups.com.apple.podcasts");
        expect(path).toContain("MTLibrary.sqlite");
      });

      await Effect.runPromise(
        Effect.provide(
          program,
          PodcastServiceLive.pipe(Layer.provide(FileSystemLive), Layer.provide(LoggerLive)),
        ),
      );
    });
  });
});
