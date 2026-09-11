import { typeOf } from "../compiler/diagnostics.js";

/**
 * A Standard Schema (https://standardschema.dev) validator, which zod, valibot, and arktype
 * all produce. Only the result's `issues` are looked at: a schema that transforms the value
 * does not change what the handler receives.
 */
export interface StandardSchemaLike<V = unknown> {
  "~standard": {
    validate(
      value: V,
    ):
      | { issues?: ReadonlyArray<unknown> | undefined }
      | Promise<{ issues?: ReadonlyArray<unknown> | undefined }>;
  };
}

/**
 * Checks one custom ID parameter. A function passes by returning anything but `false` and
 * fails by returning `false` or throwing. A schema fails by reporting issues.
 */
export type ParamValidator<V = string | string[]> = ((value: V) => unknown) | StandardSchemaLike<V>;

export type ParamValidators = Record<string, ParamValidator>;

/**
 * Reads the validators `defineComponent` attached to a handler and checks them against the
 * route's parameters. Throws with a developer-facing message when the shape is wrong; the
 * compiler reports it as a diagnostic and the runtime as a load error.
 */
export function paramValidatorsOf(
  handler: unknown,
  route: { params: readonly string[] },
): ParamValidators {
  const declared = (handler as { params?: unknown }).params;
  if (declared === undefined) return {};
  if (typeof declared !== "object" || declared === null || Array.isArray(declared)) {
    throw new Error(`params is ${typeOf(declared)}, not an object of validators.`);
  }
  const validators: ParamValidators = {};
  for (const [name, validator] of Object.entries(declared)) {
    if (!route.params.includes(name)) {
      throw new Error(
        `params validates "${name}", which is not a parameter of this route. ${
          route.params.length === 0 ? "It has none." : `It has: ${route.params.join(", ")}.`
        }`,
      );
    }
    if (!isValidator(validator)) {
      throw new Error(
        `params.${name} is ${typeOf(validator)}. A validator is a function or a Standard Schema.`,
      );
    }
    validators[name] = validator;
  }
  return validators;
}

function isValidator(value: unknown): value is ParamValidator {
  if (typeof value === "function") return true;
  if (typeof value !== "object" || value === null) return false;
  const standard = (value as Record<string, unknown>)["~standard"];
  return (
    typeof standard === "object" &&
    standard !== null &&
    typeof (standard as Record<string, unknown>).validate === "function"
  );
}

/**
 * Runs every validator against the decoded parameters. Resolves to the first parameter that
 * failed, or `null` when all passed. A validator that throws counts as a failure; the
 * caller decides what to log, so the value never leaves this function.
 */
export async function findInvalidParam(
  validators: ParamValidators,
  params: Record<string, string | string[]>,
): Promise<string | null> {
  for (const [name, validator] of Object.entries(validators)) {
    const value = params[name];
    if (value === undefined) return name;
    try {
      if (typeof validator === "function") {
        if ((await validator(value)) === false) return name;
        continue;
      }
      const result = await validator["~standard"].validate(value);
      if (result.issues !== undefined && result.issues.length > 0) return name;
    } catch {
      return name;
    }
  }
  return null;
}
