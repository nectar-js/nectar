export type Severity = "error" | "warning";

export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  /** Absolute path of the file or directory that caused the diagnostic. */
  file?: string;
  /** Canonical route identity, when the diagnostic is about a specific route. */
  route?: string;
}

/** Every code the compiler reports. Each has an entry in the diagnostics reference. */
export const DIAGNOSTIC_CODES = [
  "file-outside-category",
  "unknown-category",
  "file-in-wrong-category",
  "invalid-segment",
  "route-without-path",
  "dynamic-segment-not-allowed",
  "duplicate-param",
  "catch-all-not-last",
  "duplicate-route",
  "module-load-failed",
  "route-mismatch",
  "missing-meta",
  "invalid-meta",
  "invalid-name",
  "invalid-description",
  "invalid-option",
  "missing-route-meta",
  "route-meta-without-path",
  "unused-route-meta",
  "mixed-command-and-subcommands",
  "mixed-subcommand-and-group",
  "command-too-deep",
  "too-many-subcommands",
  "context-menu-nested",
  "top-level-field-on-group",
  "top-level-field-on-subcommand",
  "duplicate-command-name",
  "autocomplete-without-command",
  "autocomplete-export-not-function",
  "autocomplete-unknown-option",
  "autocomplete-missing-handler",
  "autocomplete-missing-file",
  "missing-select-kind",
  "invalid-select-kind",
  "invalid-param-validator",
  "catch-all-route",
  "short-id-collision",
  "duplicate-component-pattern",
  "unknown-event",
  "event-nested-path",
  "event-mode-conflict",
  "missing-intent",
  "plugin-failed",
  "plugin-invalid-change",
  "plugin-unknown-route",
  "plugin-missing-file",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

const REFERENCE = "https://nectar-js.github.io/nectar/reference/diagnostics";

/** The reference entry for a compiler code. Codes from plugins have none. */
export function docsUrl(code: string): string | undefined {
  return (DIAGNOSTIC_CODES as readonly string[]).includes(code)
    ? `${REFERENCE}#${code}`
    : undefined;
}

/** A value's type as a message puts it: `missing`, `a number`, `an array`. */
export function typeOf(value: unknown): string {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value === "object" ? "an object" : `a ${typeof value}`;
}

interface DiagnosticLocation {
  file?: string;
  route?: string;
}

export class Diagnostics {
  readonly items: Diagnostic[] = [];

  error(code: DiagnosticCode, message: string, location: DiagnosticLocation = {}): void {
    this.push("error", code, message, location);
  }

  warn(code: DiagnosticCode, message: string, location: DiagnosticLocation = {}): void {
    this.push("warning", code, message, location);
  }

  get hasErrors(): boolean {
    return this.items.some((d) => d.severity === "error");
  }

  private push(
    severity: Severity,
    code: string,
    message: string,
    location: DiagnosticLocation,
  ): void {
    const item: Diagnostic = { code, severity, message };
    if (location.file !== undefined) item.file = location.file;
    if (location.route !== undefined) item.route = location.route;
    this.items.push(item);
  }
}
