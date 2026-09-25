/**
 * The id of a Payload relationship field's value as a string, whether the query returned
 * it unpopulated (a bare id, depth 0) or populated (the related document, depth >= 1).
 */
export function relationshipId(value: number | string | { id: number | string }): string {
  return typeof value === "object" ? String(value.id) : String(value);
}
