/** Stands in for wherever a real bot keeps its moderation history. */
const history = new Map<string, number>();

export function banCount(userId: string): number {
  return history.get(userId) ?? 0;
}

export function recordBan(userId: string): void {
  history.set(userId, banCount(userId) + 1);
}
