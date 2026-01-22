/**
 * FileSystem Effect Service
 *
 * Provides filesystem operations using Bun and Node APIs wrapped in Effect.
 */

import { Context, Data, Effect, Layer } from "effect";

export const SYSTEM_HIDDEN_FILES = [
  ".DS_Store",
  ".Spotlight-V100",
  ".Trashes",
  ".fseventsd",
  ".TemporaryItems",
  ".VolumeIcon.icns",
  ".com.apple.timemachine.donotpresent",
  ".DocumentRevisions-V100",
  ".PKInstallSandboxManager",
];

export const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac"]);

export class FileNotFoundError extends Data.TaggedError("FileNotFoundError")<{
  path: string;
}> {}

export class WriteError extends Data.TaggedError("WriteError")<{
  path: string;
  cause: unknown;
}> {}

export class CopyError extends Data.TaggedError("CopyError")<{
  src: string;
  dest: string;
  cause: unknown;
}> {}

export class ReadDirError extends Data.TaggedError("ReadDirError")<{
  path: string;
  cause: unknown;
}> {}

export class GlobError extends Data.TaggedError("GlobError")<{
  pattern: string;
  cwd: string;
  cause: unknown;
}> {}

export class RemoveError extends Data.TaggedError("RemoveError")<{
  path: string;
  cause: unknown;
}> {}

/**
 * FileSystem Service Tag
 */
export class FileSystem extends Context.Tag("FileSystem")<
  FileSystem,
  {
    /** Checks if a path exists on the filesystem */
    readonly exists: (path: string) => Effect.Effect<boolean>;
    /** Reads a file as bytes */
    readonly readFile: (path: string) => Effect.Effect<Uint8Array, FileNotFoundError>;
    /** Writes bytes to a file */
    readonly writeFile: (path: string, data: Uint8Array) => Effect.Effect<void, WriteError>;
    /** Copies a file from src to dest */
    readonly copyFile: (src: string, dest: string) => Effect.Effect<void, CopyError>;
    /** Creates a directory recursively */
    readonly mkdir: (path: string) => Effect.Effect<void, WriteError>;
    /** Removes a file or directory recursively */
    readonly remove: (path: string) => Effect.Effect<void, RemoveError>;
    /** Reads directory entries using Bun.Glob */
    readonly readDir: (path: string) => Effect.Effect<string[], ReadDirError>;
    /** Reads directory entries using node:fs/promises */
    readonly list: (path: string) => Effect.Effect<string[], ReadDirError>;
    /** Checks if a path is a directory */
    readonly isDirectory: (path: string) => Effect.Effect<boolean>;
    /** Performs a glob search in a directory */
    readonly glob: (pattern: string, cwd: string) => Effect.Effect<string[], GlobError>;
    /** Gets stats for a path */
    readonly stat: (
      path: string,
    ) => Effect.Effect<{ size: number; mtime: Date; atime: Date }, FileNotFoundError>;

    // Helpers
    /** Gets the size of a file in bytes */
    readonly getFileSize: (path: string) => Effect.Effect<number>;
    /** Ensures a directory exists, creating it if necessary */
    readonly ensureDir: (dirPath: string) => Effect.Effect<void, WriteError>;
    /** Checks if a file name represents a system hidden file (e.g. .DS_Store) */
    readonly isSystemHiddenFile: (name: string) => boolean;
    /** Checks if a path has an audio file extension */
    readonly isAudioFile: (path: string) => boolean;
    /** Gets the file extension, defaulting to .mp3 if none found */
    readonly getExtension: (path: string) => string;
    /** Removes all system hidden files from a directory */
    readonly cleanupSystemHiddenFiles: (dirPath: string) => Effect.Effect<void, RemoveError>;
    /** Checks if a directory contains no visible files */
    readonly isDirEmpty: (path: string) => Effect.Effect<boolean>;
  }
>() {}

const isSystemHiddenFileImpl = (name: string): boolean => {
  if (SYSTEM_HIDDEN_FILES.includes(name)) return true;
  return name.startsWith("._");
};

export const FileSystemLive = Layer.succeed(FileSystem, {
  exists: (path) =>
    Effect.promise(async () => {
      const { stat } = await import("node:fs/promises");
      try {
        await stat(path);
        return true;
      } catch {
        return false;
      }
    }),

  readFile: (path) =>
    Effect.tryPromise({
      try: () => Bun.file(path).bytes(),
      catch: () => new FileNotFoundError({ path }),
    }),

  writeFile: (path, data) =>
    Effect.tryPromise({
      try: () => Bun.write(path, data),
      catch: (cause) => new WriteError({ path, cause }),
    }).pipe(Effect.asVoid),

  copyFile: (src, dest) =>
    Effect.gen(function* () {
      const data = yield* Effect.tryPromise({
        try: () => Bun.file(src).bytes(),
        catch: () => new CopyError({ src, dest, cause: "Source not found" }),
      });
      yield* Effect.tryPromise({
        try: () => Bun.write(dest, data),
        catch: (cause) => new CopyError({ src, dest, cause }),
      });
    }),

  mkdir: (path) =>
    Effect.tryPromise({
      try: async () => {
        const fs = await import("node:fs/promises");
        await fs.mkdir(path, { recursive: true });
      },
      catch: (cause) => new WriteError({ path, cause }),
    }),

  remove: (path) =>
    Effect.tryPromise({
      try: async () => {
        const fs = await import("node:fs/promises");
        await fs.rm(path, { recursive: true, force: true });
      },
      catch: (cause) => new RemoveError({ path, cause }),
    }),

  readDir: (path) =>
    Effect.tryPromise({
      try: async () => {
        const glob = new Bun.Glob("*");
        const files: string[] = [];
        for await (const file of glob.scan({ cwd: path })) {
          files.push(file);
        }
        return files;
      },
      catch: (cause) => new ReadDirError({ path, cause }),
    }),

  list: (path) =>
    Effect.tryPromise({
      try: async () => {
        const { readdir } = await import("node:fs/promises");
        return await readdir(path);
      },
      catch: (cause) => new ReadDirError({ path, cause }),
    }),

  isDirectory: (path) =>
    Effect.promise(async () => {
      const { stat } = await import("node:fs/promises");
      try {
        const s = await stat(path);
        return s.isDirectory();
      } catch {
        return false;
      }
    }),

  glob: (pattern, cwd) =>
    Effect.tryPromise({
      try: async () => {
        const glob = new Bun.Glob(pattern);
        const files: string[] = [];
        for await (const file of glob.scan({ cwd, onlyFiles: true })) {
          files.push(file);
        }
        return files;
      },
      catch: (cause) => new GlobError({ pattern, cwd, cause }),
    }),

  stat: (path) =>
    Effect.tryPromise({
      try: async () => {
        const { stat } = await import("node:fs/promises");
        const s = await stat(path);
        return { size: s.size, mtime: s.mtime, atime: s.atime };
      },
      catch: () => new FileNotFoundError({ path }),
    }),

  getFileSize: (path) =>
    Effect.promise(async () => {
      const { stat } = await import("node:fs/promises");
      try {
        const s = await stat(path);
        return s.size;
      } catch {
        return 0;
      }
    }),

  ensureDir: (dirPath) =>
    Effect.tryPromise({
      try: async () => {
        const { mkdir } = await import("node:fs/promises");
        await mkdir(dirPath, { recursive: true });
      },
      catch: (cause) => new WriteError({ path: dirPath, cause }),
    }),

  isSystemHiddenFile: isSystemHiddenFileImpl,

  isAudioFile: (path) => {
    const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
    return AUDIO_EXTENSIONS.has(ext);
  },

  getExtension: (path) => {
    const lastDot = path.lastIndexOf(".");
    return lastDot >= 0 ? path.slice(lastDot) : ".mp3";
  },

  cleanupSystemHiddenFiles: (dirPath) =>
    Effect.gen(function* () {
      const { readdir, unlink } = yield* Effect.promise(() => import("node:fs/promises"));
      const entries = yield* Effect.tryPromise({
        try: () => readdir(dirPath),
        catch: (cause) => new RemoveError({ path: dirPath, cause }),
      });
      for (const entry of entries) {
        if (isSystemHiddenFileImpl(entry)) {
          yield* Effect.tryPromise({
            try: () => unlink(`${dirPath}/${entry}`),
            catch: (cause) => new RemoveError({ path: `${dirPath}/${entry}`, cause }),
          }).pipe(Effect.catchAll(() => Effect.void));
        }
      }
    }),

  isDirEmpty: (path) =>
    Effect.gen(function* () {
      const { readdir } = yield* Effect.promise(() => import("node:fs/promises"));
      const entries = yield* Effect.tryPromise({
        try: () => readdir(path),
        catch: () => [] as string[],
      }).pipe(Effect.orDie);
      const visibleFiles = entries.filter((e) => !isSystemHiddenFileImpl(e));
      return visibleFiles.length === 0;
    }),
});

/**
 * Creates a test implementation of the FileSystem service using an in-memory Map.
 */
export const createFileSystemTest = (files: Map<string, Uint8Array> = new Map()) =>
  Layer.succeed(FileSystem, {
    exists: (path) =>
      Effect.succeed(
        files.has(path) || Array.from(files.keys()).some((f) => f.startsWith(`${path}/`)),
      ),

    readFile: (path) => {
      const data = files.get(path);
      if (!data) {
        return Effect.fail(new FileNotFoundError({ path }));
      }
      return Effect.succeed(data);
    },

    writeFile: (path, data) => {
      files.set(path, data);
      return Effect.void;
    },

    copyFile: (src, dest) => {
      const data = files.get(src);
      if (!data) {
        return Effect.fail(new CopyError({ src, dest, cause: "Source not found" }));
      }
      files.set(dest, data);
      return Effect.void;
    },

    mkdir: (_path) => Effect.void,

    remove: (path) => {
      files.delete(path);
      return Effect.void;
    },

    readDir: (path) => {
      const entries = Array.from(files.keys())
        .filter((f) => f.startsWith(path) && f !== path)
        .map((f) => {
          const relativePath = f.slice(path.length + 1);
          const firstSegment = relativePath.split("/")[0];
          return firstSegment ?? "";
        })
        .filter((v): v is string => v !== "" && v !== undefined)
        .filter((v, i, a) => a.indexOf(v) === i);
      return Effect.succeed(entries);
    },

    list: (path) => {
      const entries = Array.from(files.keys())
        .filter((f) => f.startsWith(path) && f !== path)
        .map((f) => {
          const relativePath = f.slice(path.length + 1);
          const firstSegment = relativePath.split("/")[0];
          return firstSegment ?? "";
        })
        .filter((v): v is string => v !== "" && v !== undefined)
        .filter((v, i, a) => a.indexOf(v) === i);
      return Effect.succeed(entries);
    },

    isDirectory: (path) => {
      const isDir =
        Array.from(files.keys()).some((f) => f.startsWith(`${path}/`)) ||
        (files.has(path) && files.get(path)?.length === 0);
      return Effect.succeed(isDir);
    },

    glob: (_pattern, cwd) => {
      const entries = Array.from(files.keys())
        .filter((f) => f.startsWith(cwd))
        .map((f) => f.slice(cwd.length + 1))
        .filter((f) => f.length > 0);
      return Effect.succeed(entries);
    },

    stat: (path) => {
      const data = files.get(path);
      if (!data) {
        return Effect.fail(new FileNotFoundError({ path }));
      }
      return Effect.succeed({ size: data.length, mtime: new Date(), atime: new Date() });
    },

    getFileSize: (path) => {
      const data = files.get(path);
      return Effect.succeed(data?.length ?? 0);
    },

    ensureDir: (_dirPath) => Effect.void,

    isSystemHiddenFile: isSystemHiddenFileImpl,

    isAudioFile: (path) => {
      const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
      return AUDIO_EXTENSIONS.has(ext);
    },

    getExtension: (path) => {
      const lastDot = path.lastIndexOf(".");
      return lastDot >= 0 ? path.slice(lastDot) : ".mp3";
    },

    cleanupSystemHiddenFiles: (_dirPath) => Effect.void,

    isDirEmpty: (path) => {
      const entries = Array.from(files.keys())
        .filter((f) => f.startsWith(path) && f !== path)
        .filter((f) => !isSystemHiddenFileImpl(f.slice(path.length + 1).split("/")[0] ?? ""));
      return Effect.succeed(entries.length === 0);
    },
  });
