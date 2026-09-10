import type { Logger } from "./types.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Structured metadata attached to a log line. `error` is the thrown value, when there is one. */
export type LogFields = Record<string, unknown>;

export interface LogRecord {
  level: LogLevel;
  message: string;
  /** Epoch milliseconds. */
  at: number;
  fields: LogFields;
}

/** Where log records go. The default prints to the console; an app can hand records to any library. */
export type LogSink = (record: LogRecord) => void;

export interface LoggerOptions {
  /** Lowest level that reaches the sink. Defaults to `info`. */
  level?: LogLevel;
  sink?: LogSink;
}

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function createLogger(options: LoggerOptions = {}): Logger {
  const threshold = ORDER[options.level ?? "info"];
  const sink = options.sink ?? consoleSink;
  const log = (level: LogLevel, message: string, fields: LogFields = {}) => {
    if (ORDER[level] < threshold) return;
    sink({ level, message, at: Date.now(), fields });
  };
  return {
    debug: (message, fields) => log("debug", message, fields),
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
  };
}

/** `[nectar] message key=value ...` on the matching console method, then the error if any. */
export const consoleSink: LogSink = ({ level, message, fields }) => {
  const { error, ...rest } = fields;
  const pairs = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
  const line = [`[nectar] ${message}`, ...pairs].join(" ");
  if (error === undefined) console[level](line);
  else console[level](line, error);
};
