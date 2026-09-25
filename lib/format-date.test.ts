import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./format-date";

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-09-25T12:00:00Z");
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it.each([
    [10, "just now"],
    [120, "2 minutes ago"],
    [3 * 60 * 60, "3 hours ago"],
    [24 * 60 * 60, "yesterday"],
    [14 * 24 * 60 * 60, "2 weeks ago"],
    [400 * 24 * 60 * 60, "last year"],
  ])("%is ago reads %s", (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), now)).toBe(expected);
  });
});
