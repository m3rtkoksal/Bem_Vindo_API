import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  UnknownPlaceholderError,
  assertPromptsFile,
  buildImagePrompt,
  type PromptsFile,
} from "../src/prompt.ts";

const prompts = assertPromptsFile(
  JSON.parse(readFileSync(new URL("../prompts.json", import.meta.url), "utf8")),
);

const PLACEHOLDER = /\{[A-Za-z0-9_]+\}/;

test("side characters, then aparencia and kiyafet, then style block", () => {
  const scene = prompts.scenes.saobento_azulejos;
  assert.ok(scene);
  const built = buildImagePrompt(prompts, scene.prompt, "short dark hair, round glasses", "m");

  assert.match(
    prompts.style_block,
    /No speech bubbles, no captions, no subtitles, no text anywhere in the image/,
  );
  assert.match(built, /short dark hair, round glasses/);
  assert.match(built, /mustard-yellow jacket/);
  assert.match(built, /friendly middle-aged woman with short grey hair/);
  assert.ok(built.endsWith(prompts.style_block));
  assert.equal(built.includes("{local_woman}"), false);
  assert.equal(built.includes("{aparencia}"), false);
  assert.equal(built.includes("{kiyafet}"), false);
  assert.equal(PLACEHOLDER.test(built), false);
});

test("every shipped scene resolves without a leftover placeholder", () => {
  for (const [key, scene] of Object.entries(prompts.scenes)) {
    const built = buildImagePrompt(prompts, scene.prompt, "short dark hair", "m");
    assert.equal(PLACEHOLDER.test(built), false, key);
    assert.match(built, /mustard-yellow jacket/, key);
    assert.ok(built.endsWith(prompts.style_block), key);
  }
});

test("placeholders inside a side-character description are filled on the second pass", () => {
  const config: PromptsFile = {
    ...prompts,
    outfit: "OUTFIT",
    style_block: "STYLE",
    side_characters: {
      local_woman: "WOMAN wearing {kiyafet} ({aparencia})",
    },
  };
  const built = buildImagePrompt(
    config,
    "See {local_woman}. Hair ({aparencia}).",
    "curly hair", "m");
  assert.equal(
    built,
    "See WOMAN wearing OUTFIT (curly hair). Hair (curly hair). STYLE",
  );
});

test("an unknown placeholder is an error and is not dropped", () => {
  assert.throws(
    () => buildImagePrompt(prompts, "Hello {not_a_character} and {also_nope}.", "hair", "m"),
    (error: unknown) => {
      assert.ok(error instanceof UnknownPlaceholderError);
      assert.deepEqual(error.placeholders, ["{also_nope}", "{not_a_character}"]);
      return true;
    },
  );
});

test("a placeholder injected through aparencia is not expanded or ignored", () => {
  assert.throws(
    () => buildImagePrompt(prompts, "Hair ({aparencia}).", "{clerk}", "m"),
    (error: unknown) => {
      assert.ok(error instanceof UnknownPlaceholderError);
      assert.deepEqual(error.placeholders, ["{clerk}"]);
      return true;
    },
  );
});

test("genero m/f becomes a man/a woman before aparencia", () => {
  for (const scene of Object.values(prompts.scenes)) {
    const man = buildImagePrompt(prompts, scene.prompt, "short dark hair", "m");
    const woman = buildImagePrompt(prompts, scene.prompt, "short dark hair", "f");
    assert.ok(man.includes("(a man, short dark hair)"), scene.prompt);
    assert.ok(woman.includes("(a woman, short dark hair)"));
    assert.equal(man.includes("{genero_desc}"), false);
  }
});
