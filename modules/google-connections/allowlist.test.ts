import { describe, expect, it } from "vitest";
import { isRequestAllowlisted } from "./allowlist";

describe("isRequestAllowlisted", () => {
  it("allows every currently-planned feature's actual outbound call", () => {
    expect(isRequestAllowlisted("google-search-console", "GET", "https://www.googleapis.com/webmasters/v3/sites")).toBe(true);
    expect(
      isRequestAllowlisted(
        "google-search-console",
        "POST",
        "https://www.googleapis.com/webmasters/v3/sites/sc-domain:example.com/searchAnalytics/query"
      )
    ).toBe(true);
    expect(
      isRequestAllowlisted("google-search-console", "POST", "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect")
    ).toBe(true);
    expect(
      isRequestAllowlisted("google-analytics", "POST", "https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport")
    ).toBe(true);
    expect(isRequestAllowlisted("google-analytics", "GET", "https://analyticsadmin.googleapis.com/v1beta/accountSummaries")).toBe(
      true
    );
    expect(isRequestAllowlisted("google-analytics", "GET", "https://analyticsadmin.googleapis.com/v1beta/properties/123456")).toBe(
      true
    );
  });

  it("rejects a disallowed host per capability, not just an unrelated host", () => {
    // analyticsadmin.googleapis.com is the right HOST for google-analytics, but account
    // deletion/property creation are not on the allowlist - only the two read routes are.
    expect(
      isRequestAllowlisted("google-analytics", "DELETE", "https://analyticsadmin.googleapis.com/v1beta/accountSummaries/1")
    ).toBe(false);
    expect(isRequestAllowlisted("google-analytics", "POST", "https://analyticsadmin.googleapis.com/v1beta/properties")).toBe(false);
    // Wrong capability entirely.
    expect(isRequestAllowlisted("google-search-console", "GET", "https://analyticsadmin.googleapis.com/v1beta/accountSummaries")).toBe(
      false
    );
  });

  it("requires the right method on an otherwise-allowlisted route", () => {
    expect(isRequestAllowlisted("google-search-console", "DELETE", "https://www.googleapis.com/webmasters/v3/sites")).toBe(false);
    expect(
      isRequestAllowlisted("google-analytics", "GET", "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport")
    ).toBe(false);
  });

  it("never lets a wildcard segment span across a slash", () => {
    expect(
      isRequestAllowlisted(
        "google-search-console",
        "GET",
        "https://www.googleapis.com/webmasters/v3/sites/sc-domain:example.com/extra-segment"
      )
    ).toBe(false);
  });

  it("ignores the query string when matching", () => {
    expect(
      isRequestAllowlisted("google-analytics", "GET", "https://analyticsadmin.googleapis.com/v1beta/properties/123?fields=timeZone")
    ).toBe(true);
  });
});
