import { cooldown } from "@nectar-js/nectar";

// One new ticket per user every 30 seconds.
export default cooldown(30, {
  message: (s) => `Slow down. You can open another ticket in ${s}s.`,
});
