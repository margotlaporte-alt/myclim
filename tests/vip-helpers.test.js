import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVipRegistrationPayload,
  createEmptyVipFormData,
  getVipPartnerPortalLabel,
  getVipTourChoiceLabel,
} from "../src/app/vip-helpers.js";

test("createEmptyVipFormData applies defaults and overrides", () => {
  const formData = createEmptyVipFormData({ organization: "CMCM" });

  assert.equal(formData.organization, "CMCM");
  assert.equal(formData.vipTourChoice, "coque");
  assert.equal(formData.firstName, "");
});

test("getVipPartnerPortalLabel humanizes the shared portal slug", () => {
  assert.equal(getVipPartnerPortalLabel("ville-de-luxembourg"), "Ville De Luxembourg");
  assert.equal(getVipPartnerPortalLabel(""), "Partenaire VIP");
});

test("buildVipRegistrationPayload trims values and normalizes emails", () => {
  const payload = buildVipRegistrationPayload({
    firstName: " Ada ",
    lastName: " Lovelace ",
    organization: " CMCM ",
    email: " ADA@Example.com ",
    guestEmail: " GUEST@Example.com ",
    vipTourChoice: "",
  });

  assert.equal(payload.firstName, "Ada");
  assert.equal(payload.lastName, "Lovelace");
  assert.equal(payload.organization, "CMCM");
  assert.equal(payload.email, "ada@example.com");
  assert.equal(payload.guestEmail, "guest@example.com");
  assert.equal(payload.vipTourChoice, "coque");
});

test("getVipTourChoiceLabel resolves the configured labels", () => {
  assert.match(getVipTourChoiceLabel("coulisses"), /coulisses/i);
  assert.match(getVipTourChoiceLabel("unknown"), /non renseigné/i);
});
