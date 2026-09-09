export { type CommandDiff, diffCommands } from "./diff.js";
export { RegistrationError, type RegistrationProblem } from "./errors.js";
export {
  type AnyCommand,
  commandKey,
  type NormalizedCommand,
  normalizeCommand,
} from "./normalize.js";
export { type CommandRest, fetchCommands, putCommands, type Scope, scopeKey } from "./remote.js";
export { registrationScopes } from "./targets.js";
