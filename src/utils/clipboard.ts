import { platform } from "node:os";

/**
 * Copies the provided text to the system clipboard.
 * Currently only supports macOS (darwin) using pbcopy.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (platform() !== "darwin") {
    return false;
  }

  try {
    const proc = Bun.spawn(["pbcopy"], {
      stdin: "pipe",
    });

    if (proc.stdin) {
      proc.stdin.write(text);
      proc.stdin.end();
    }

    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch (_error) {
    return false;
  }
}
