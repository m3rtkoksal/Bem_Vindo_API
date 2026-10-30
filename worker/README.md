# Bem-Vindo Worker

Cloudflare Worker: iOS → Worker → xAI. Anahtarlar yalnızca Worker secret'ı (`XAI_API_KEY`, `DEVICE_TOKENS`).

## POST /v1/image

İstek (JSON, `Authorization: Bearer <cihaz token>`):
`chapter_id`, `image_key`, `aparencia`, `genero` (`m`|`f`), `photo_base64`.

200 yanıtı:

```json
{ "image_base64": "...", "mime_type": "image/jpeg", "prompts_version": "aima-01.v2-scifi" }
```

`prompts_version`, `prompts.json` içindeki `version` alanıdır. iOS önbellek anahtarına
eklemelidir (ör. `chapter_id:image_key:prompts_version`); prompt'lar değişince eski görseller
otomatik geçersiz olur. Alan ek (non-breaking); istek tarafında yeni alan yoktur.

Hatalar: 401 `unauthorized`, 400 `invalid_body`/`invalid_photo`, 404 `unknown_image_key`,
429 `daily_limit` (cihaz başına günde 120 görsel / 300 sahne, UTC), 502 `upstream_failed`.

## Geliştirme

`npm test`, `npm run typecheck`. Yerel test için `.dev.vars` (gitignore'da) kullanılır; repoya girmez.
