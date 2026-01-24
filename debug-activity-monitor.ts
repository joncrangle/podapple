import { spawn } from "bun";

console.log("Monitoring diskutil activity... (Press Ctrl+C to stop)");

const proc = spawn(["diskutil", "activity"], {
  stdout: "pipe",
  stderr: "pipe",
});

const reader = proc.stdout.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // Timestamp to see delay
  console.log(`[${new Date().toISOString()}] ${text.trim()}`);
}
