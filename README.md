# Bem-Vindo API

Bem-Vindo iPhone uygulamasının backend’i. Uygulama Portekizce (pt-PT) öğreten, seçimli bir gamebook: hikâye metni İngilizce, diyalog Portekizce; sahneler Porto ve Lizbon’daki gerçek yerlerde geçer. Bu repo bölüm verisini ve görsel üretimini yapan Cloudflare Worker’ı tutar.

## Mimari

Uygulama xAI anahtarını görmez. İstekler Worker’a gelir; Worker prompt’u kendisi kurar ve xAI’ye iletir.

- `POST /v1/image` — gövde: `chapter_id`, `image_key`, `photo_base64`, `aparencia`, `genero`. Worker `worker/prompts.json` içinden sahne prompt’unu, `style_block` ve `outfit` değerini birleştirir. Model adı da bu dosyadaki `model` alanından okunur (`grok-imagine-image`). Referans fotoğraf xAI `POST /v1/images/edits` çağrısında `image: { url: <data URI>, type: "image_url" }` olarak gider; dönen base64 uygulamaya iletilir.
- `POST /v1/scene` — sahne/diyalog proxy’si için yer tutucu (`501`).
- Kimlik: `Authorization: Bearer <cihaz token>`. İzinli token’lar `DEVICE_TOKENS` secret’ında (virgülle ayrılmış liste).
- Kota: cihaz başına günde 120 görsel / 300 sahne. Sayaç arayüzü var; kalıcı KV / Durable Object sayacı henüz bağlı değil (bkz. `worker/src/usage.ts`).

xAI çağrısı `https://docs.x.ai/docs/guides/image-generations` ve [Images REST referansı](https://docs.x.ai/developers/rest-api-reference/inference/images) ile hizalandı (27 Eki 2026). Şema ile rehberin çeliştiği alanlar kodda TODO olarak durur; uydurma parametre gönderilmez.

## Klasörler

```
docs/     AI planı ve görsel prompt taslağı
data/     aima-01 bölüm JSON’u ve şema notu (data/README.md)
worker/   Cloudflare Worker (TypeScript), prompts.json, test
```

## Gizlilik

- Kullanıcı fotoğrafı ve base64’ü Worker’da saklanmaz. R2, KV veya başka bir depoya yazılmaz. Log’a istek gövdesi, fotoğraf, base64 veya xAI yanıt gövdesi düşmez.
- Üretilen görsel yalnızca yanıtta uygulamaya döner; Worker kopyasını tutmaz.
- `XAI_API_KEY` ve `DEVICE_TOKENS` yalnızca Worker secret’ıdır (yerelde `.dev.vars`). Repoda gerçek anahtar veya token yoktur.

## Yerel çalışma

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # değerleri doldur; commit etme
npm test
npm run typecheck
npm run dev
```

Secret ekleme ve deploy bu iskeletin parçası değildir. Üretimde değerler `wrangler secret put XAI_API_KEY` ve `wrangler secret put DEVICE_TOKENS` ile verilir.
