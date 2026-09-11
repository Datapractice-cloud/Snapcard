/** "Vaibhav Parmar" -> "VP", "rep@thinkvibes.com" -> "RE". Never empty. */
export function initialsFor(name?: string | null, email?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const local = (email ?? "").split("@")[0];
  return (local.slice(0, 2) || "??").toUpperCase();
}
