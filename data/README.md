# Bem-Vindo – chapter schema (aima-chapter.json)

The app is completely free (no paywall, no subscription). UI, narration, glosses: English. Target phrases: pt-PT.

- `chapter_id`, `title_en`, `level` (A1), `locale_target` (pt-PT), `ui_locale` (en), `pricing` ("free"), `est_minutes`, `start_page`.
- `placeholders` (runtime tokens):
  - `{nome}`: character name (required).
  - `{aparencia}`: comes from the **optional "Appearance" field** on the character creation screen. Built on the client as short text from selectable fields only (no free text) and sent to the Worker, which inserts it into the image prompt (empty if not set).
  - `{genero}`: `m` | `f` (from character creation).
  - `gender_tokens`: gendered words that refer to the player, resolved by `{genero}`: `{obrigado}` → Obrigado/Obrigada, `{cansado}` → cansado/cansada. Add new words here (same pattern) instead of hard-coding; avoid gendered words when not needed.
- `pages[]`:
  - `id` (int, book page number), `narration_en` (always 2nd person, "you").
  - `lines[]`: `{speaker, pt, en}`.
  - `choices[]`: `{text_pt, text_en, target, correct, kind?, ending?}`. `target` = page id or `"END"` (chapter end → SRS).
    - `kind: "helpful"`: not the answer, but a useful phrase (e.g. "Pode falar mais devagar?"). Shown as a friendly side path, never as a mistake; it has a dead_end entry with encouraging text and returns to the same page.
    - `ending`: on END choices. Page 30 intentionally has **two happy endings** (`cafe`, `francesinha`); both correct.
  - `dead_ends[]`: `{choice_index, text_en, reteach_pt, reteach_en, return}`. **Rule: every choice with `correct:false` must have a dead_end** (funny outcome, reteach, return). No penalties.
    - `side_scene` (added, backward-compatible; old fields kept): `{narration_en, lines:[{speaker,pt,en}], image:{key, personalized:true}}`. A wrong choice opens this short funny scene where the story changes (e.g. p1 'Oi, cara!': the woman walks off, another friendly woman nearby greets you, so returning to page 1 still makes sense), then shows the reteach and goes to `return`. Characters are confused/amused, never rude. Side-scene keys (`p<page>_<word>_sidescene`) are unique, must exist in `image-prompts-draft.md`. Old apps can ignore `side_scene` and keep using `text_en`.
  - `image` (**required on every page**): `{key, personalized: true}` only (no `prompt`). 12 personalized images, one per page; `key` must match a `## Sayfa N – <key>` heading in `image-prompts-draft.md` (the full prompt source, looked up by key). Each dead_end also has its own side-scene image (see `side_scene`).
    Mapping: 1 saobento_azulejos, 5 saobento_asking, 6 saobento_bus, 9 aima_entrance, 10 aima_phone, 12 aima_waiting, 15 aima_counter_passport, 18 aima_counter_documents, 21 aima_camera, 24 aima_fingerprint, 27 aima_done, 30 ribeira_domluis.
- `srs_cards[]`: `{id, pt, en, hint_en}` – 12 review cards. Each card's phrase appears in a choice or in a dialogue line (c10 "Olhe para a câmara" is a dialogue card, heard on page 21).

Places: all real, real names (São Bento Station, AIMA store on Avenida de França, Ribeira, Dom Luís I bridge). No street numbers. Bus line: kept generic. Third-party stop data (parou.pt, livebustimes) shows STCP stop "Av. França" served by line 203 (Antas–Lapa–Boavista), but stcp.pt did not render for verification and 203 does not start at São Bento, so no line number is used.

`python3 gen.py` builds the JSON and validates: targets/returns exist or END, every wrong choice has a dead_end, each page has a correct choice, every card appears in a choice/line, no unknown tokens, no paywall wording, every page has a unique `image.key` that exists in `image-prompts-draft.md`, and no page has `image.prompt`; every dead_end has a `side_scene` with narration, lines and a unique image key (unique across pages, side scenes and endings) present in the draft.

## Image generation (client ↔ Worker)
- The client holds **no prompts**. Per image it sends only `{chapter_id, image.key, photo (base64 JPEG ~1024px), aparencia (short text built from selectable fields, no free text), genero}` and writes the returned base64 image to the device.
- The backend Worker builds the prompt from its own `prompts.json` (deployed with the Worker, generated from `image-prompts-draft.md`): scene prompt by key + shared style block + fixed `{kiyafet}` outfit + side-character descriptions.
- `{kiyafet}` is **not** a JSON placeholder; it lives only in the Worker config.
