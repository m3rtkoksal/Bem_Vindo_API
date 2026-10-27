import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { assertPromptsFile } from "../src/prompt.ts";
import { buildImageEditBody } from "../src/xai.ts";

const prompts = assertPromptsFile(
  JSON.parse(readFileSync(new URL("../prompts.json", import.meta.url), "utf8")),
);

test("edit request uses the confirmed image url shape and prompts.json model", () => {
  assert.equal(prompts.model, "grok-imagine-image");
  const dataUri = "data:image/jpeg;base64,aGVsbG8=";
  const body = buildImageEditBody({
    model: prompts.model,
    prompt: "scene prompt",
    imageDataUri: dataUri,
    userHash: "abc123",
  });

  assert.deepEqual(body, {
    model: "grok-imagine-image",
    prompt: "scene prompt",
    image: {
      url: dataUri,
      type: "image_url",
    },
    aspect_ratio: "3:4",
    response_format: "b64_json",
    n: 1,
    user: "abc123",
  });
});
