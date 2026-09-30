import { describe, expect, it } from "vitest";
import { runNeutralChecks } from "./neutral";

function headingCheck(contentHtml: string) {
  return runNeutralChecks({ contentHtml }).find((c) => c.id === "neutral:heading-structure");
}

describe("neutral heading structure check", () => {
  it("passes a well-formed hierarchy", () => {
    expect(headingCheck("<h2>A</h2><p>x</p><h3>B</h3><h2>C</h2>")?.status).toBe("good");
  });

  it("flags an H1 in the body", () => {
    expect(headingCheck("<h1>Title</h1><p>x</p>")).toMatchObject({ status: "bad", message: expect.stringContaining("H1") });
  });

  it("flags a skipped level, including a first heading deeper than H2", () => {
    expect(headingCheck("<h2>A</h2><h4>B</h4>")).toMatchObject({ status: "bad", message: expect.stringContaining("H2 to H4") });
    expect(headingCheck("<h3>A</h3>")?.status).toBe("bad");
  });

  it("only warns about missing subheadings on long content", () => {
    expect(headingCheck("<p>short</p>")?.status).toBe("good");
    expect(headingCheck(`<p>${"word ".repeat(700)}</p>`)?.status).toBe("ok");
  });
});
