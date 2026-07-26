import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = JSON.parse(
  readFileSync(new URL("../custom-providers.schema.json", import.meta.url), "utf8"),
);

function resolveLocalRef(document, reference) {
  assert.match(reference, /^#\//);
  return reference.slice(2).split("/").reduce(
    (value, part) => value[part.replaceAll("~1", "/").replaceAll("~0", "~")],
    document,
  );
}

test("schema exposes the strict current provider contract", () => {
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.properties.$schema, { type: "string" });

  const provider = resolveLocalRef(schema, schema.additionalProperties.$ref);
  assert.deepEqual(new Set(provider.required), new Set(["baseUrl", "api"]));
  assert.equal(provider.additionalProperties, false);
  assert.deepEqual(provider.properties.api.enum, [
    "openai-responses",
    "openai-completions",
    "anthropic-messages",
  ]);
  assert.deepEqual(Object.keys(provider.properties).sort(), [
    "api",
    "baseUrl",
    "costMultiplier",
    "fastModePolicy",
    "modelCostMultipliers",
  ]);

  assert.equal(provider.properties.costMultiplier.type, "number");
  assert.equal(provider.properties.costMultiplier.minimum, 0);
  assert.equal(provider.properties.modelCostMultipliers.type, "object");
  assert.equal(provider.properties.modelCostMultipliers.propertyNames.type, "string");
  assert.equal(provider.properties.modelCostMultipliers.propertyNames.minLength, 1);
  assert.equal(provider.properties.modelCostMultipliers.additionalProperties.type, "number");
  assert.equal(provider.properties.modelCostMultipliers.additionalProperties.minimum, 0);

  assert.deepEqual(provider.properties.fastModePolicy.enum, [
    "response",
    "request",
    "disabled",
  ]);
  assert.equal(provider.properties.fastModePolicy.default, "response");
  assert.deepEqual(provider.if.required, ["api"]);
  assert.equal(provider.if.properties.api.not.const, "openai-responses");
  assert.deepEqual(provider.then.not, { required: ["fastModePolicy"] });
});
