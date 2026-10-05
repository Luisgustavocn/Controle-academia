import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBrandingLogoUrl } from "../lib/services/branding";

test("branding logo paths remain absolute on nested application routes", () => {
  assert.equal(normalizeBrandingLogoUrl("logo.jpeg"), "/logo.jpeg");
  assert.equal(normalizeBrandingLogoUrl("./uploads/branding/logo.png"), "/uploads/branding/logo.png");
  assert.equal(normalizeBrandingLogoUrl("/logo-forja.svg"), "/logo-forja.svg");
  assert.equal(normalizeBrandingLogoUrl("https://cdn.example.test/logo.png"), "https://cdn.example.test/logo.png");
});
