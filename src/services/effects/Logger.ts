import { Context, Effect, Layer } from "effect";
import { actions } from "@/store";

/**
 * Logger Service Tag
 */
export class Logger extends Context.Tag("Logger")<
  Logger,
  {
    /** Logs a debug message to the application store */
    readonly debug: (message: string) => Effect.Effect<void>;
    /** Logs an info message to the application store */
    readonly info: (message: string) => Effect.Effect<void>;
    /** Logs an error message and optional cause to the application store */
    readonly error: (message: string, cause?: unknown) => Effect.Effect<void>;
  }
>() {}

/**
 * Live implementation of Logger that updates the store actions.
 */
export const LoggerLive = Layer.succeed(Logger, {
  debug: (message) =>
    Effect.sync(() => {
      actions.addDebugMessage(message);
    }),
  info: (message) =>
    Effect.sync(() => {
      actions.addDebugMessage(message);
    }),
  error: (message, cause) =>
    Effect.sync(() => {
      const fullMsg = cause ? `${message}: ${String(cause)}` : message;
      actions.addDebugMessage(fullMsg, "error");
    }),
});
