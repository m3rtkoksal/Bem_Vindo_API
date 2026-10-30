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
    /no speech bubbles, no captions, no subtitles, no text anywhere in the image/i,
  );
  assert.match(built, /short dark hair, round glasses/);
  assert.match(built, /dark olive-green jacket/);
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
    assert.match(built, /dark olive-green jacket/, key);
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

test("side characters come only from placeholders, never inline or yellow", () => {
  const inline = /\b(clerk|guard|driver|local woman|older lady|another woman|second woman)\b/i;
  for (const [key, scene] of Object.entries(prompts.scenes)) {
    // Sayı vurgusu ("a single security guard", "only one guard") izinli; tarif yine placeholder'dan gelir.
    const stripped = scene.prompt
      .replace(/\{[A-Za-z0-9_]+\}/g, "")
      .replace(/a single security guard|only one guard|driver seat/g, "");
    assert.equal(inline.test(stripped), false, key);
  }
  for (const [name, desc] of Object.entries(prompts.side_characters)) {
    assert.equal(/not wearing/i.test(desc), false, name);
    assert.equal(
      /yellow|mustard/i.test(desc.replace("(no yellow, no mustard)", "").replace("carrying a yellow umbrella", "")),
      false,
      name,
    );
    assert.match(desc, /wearing/, name);
  }
});

const V2_NEW_KEYS = [
  "saobento_banco_despertar",
  "p0_denada_sidescene",
  "saobento_guardachuva",
  "p3_tu_sidescene",
  "domluis_meianoite",
  "p33_bomdia_sidescene",
  "saobento_reset_nota",
];

test("v2-scifi: 34 keys, 7 new keys present, one chapter, version set", () => {
  assert.equal(prompts.version, "aima-01.v2-scifi");
  assert.equal(Object.keys(prompts.scenes).length, 34);
  for (const key of V2_NEW_KEYS) assert.ok(prompts.scenes[key], key);
  for (const [key, scene] of Object.entries(prompts.scenes)) assert.equal(scene.chapter_id, "aima-01", key);
});

test("v2-scifi: yellow only on the umbrella; main outfit has no yellow; screens/clocks blank", () => {
  assert.equal(/yellow|mustard/i.test(prompts.outfit.replace(/\(no yellow[^)]*\)/, "")), false);
  assert.match(prompts.style_block, /No clocks or watches are visible unless the scene explicitly asks for one/);
  assert.equal(PLACEHOLDER.test(prompts.style_block), false);
  for (const [key, scene] of Object.entries(prompts.scenes)) {
    for (const m of scene.prompt.matchAll(/yellow\s+(\w+)/gi)) assert.equal(m[1]?.toLowerCase(), "umbrella", key);
    assert.equal(/mustard/i.test(scene.prompt), false, key);
  }
});
