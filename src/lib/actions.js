// The server's business-logic endpoints (server/logic.js): complaint workflow and story likes/comments.
export async function postAction(path, body) {
  const res = await fetch(`/api/actions/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Action failed");
  return json;
}

/** A friendlier message for a failed action. */
export const actionError = (err) => (err.message === "Failed to fetch" ? "No connection. Try again when you are online." : err.message);
