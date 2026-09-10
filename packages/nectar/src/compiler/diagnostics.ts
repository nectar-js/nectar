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

interface DiagnosticLocation {
  file?: string;
  route?: string;
}

export class Diagnostics {
  readonly items: Diagnostic[] = [];

  error(code: string, message: string, location: DiagnosticLocation = {}): void {
    this.push("error", code, message, location);
  }

  warn(code: string, message: string, location: DiagnosticLocation = {}): void {
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
