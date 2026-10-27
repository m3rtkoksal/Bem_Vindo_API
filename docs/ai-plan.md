# Bem-Vindo – AI/Backend Planı (v3, 27 Eki 2026)

**Kararlar (Mert, v3):** her sayfaya kişisel görsel (bölüm başı 12) · şimdilik 2 kullanıcı (Mert + 1) · ileride gerekirse ücretli üyelik · uygulama şimdilik ücretsiz · hikâye metni İngilizce, diyalog Portekizce, açıklamalar EN · görseller en ucuz uygun sağlayıcıyla · sahneler gerçek yerlerde, gerçek adlarla.

## 1) Sahne/diyalog üretimi – mimari
- **App → ince proxy → xAI.** Proxy: Cloudflare Worker (tercih), alternatif Render. xAI API anahtarı sadece Worker secret'ında; app'te asla yok.
- **Model:** `grok-4.20-0309-non-reasoning` ($1.25 girdi / $2.50 çıktı / 1M token). Kalite yetmezse `grok-4.7` ($2 / $6).
- **Yapılandırılmış çıktı (JSON şema):** `narration`, `dialogue[]` (PT + EN gloss), `choices[2-3]` (id, PT metin, EN ipucu), `vocab[]` (kelime, anlam), `level`. Şema PO ile kesinleşir (`aima-chapter.json` henüz yok; gelince şemayı ona uyduracağım).
- **Dil:** sistem promptu İngilizce; anlatım EN, diyalog PT (seviyeye uygun), açıklamalar EN. Gerçek yerler (São Bento, Ribeira, AIMA vb.) gerçek adlarıyla; kurum/kişiler hakkında uydurma bilgi ve olumsuz ifade yok (prompt kuralı).
- **İstek başı küçük durum:** seviye (A1/A2…), son 5 seçim, 2-3 cümlelik hikâye özeti, öğrenilen kelimeler. Sabit sistem promptu → cached input ($0.20/1M) ucuzlar.
- **Önceden üretim:** kullanıcı sahneyi okurken her seçenek için sonraki sahne arka planda üretilir (2-3 istek).
- **Önbellek:** aynı (bölüm, seviye, seçim yolu) → Workers KV/cihazda saklanır, tekrar üretilmez.
- **Yedek:** ağ/hata/limit durumunda offline, elle yazılmış sahneler (her bölüm için temel yol).
- **Rate limit:** cihaz/kullanıcı başı (ör. dakikada 10, günde 200 sahne; 5-10 görsel/gün) – Cloudflare rate limiting / Durable Object sayaç. App Attest ile sahte istemci engeli.
- **Maliyet takibi:** her yanıttaki `usage` token sayısı → kullanıcı/gün toplamı (Analytics Engine/D1); günlük bütçe aşımında offline moda düş.

## 2) Kişiselleştirilmiş görseller (v3: her sayfa, bölüm başı 12 – ayrıntı §8)
- **API (öneri):** `POST /v1/images/edits`, model `grok-imagine-image` ($0.02). Kalite yetmezse `grok-imagine-image-2.0` ($0.04). Referans görsel destekleniyor (doğrulandı: tek görsel veya en fazla 5 referans; base64 data URI veya URL kabul ediliyor; jpg/png, maks 20MiB).
- **3 sahne:** (1) São Bento istasyonu azulejoları önünde, (2) AIMA ofisinde kamera/fotoğraf çekimi sahnesi, (3) Ribeira'dan Dom Luís I köprüsü manzarası. Aynı stil promptu (ör. sıcak illüstrasyon), yüz kimliği korunsun diye kısa net prompt.
- **Ne zaman:** onboarding'de foto onayından hemen sonra 3'ü paralel üretilir; seçim başına görsel YOK. Sonraki bölümlerde bölüm başına 1-2 görsel arka planda.
- **Akış (kalıcı saklama yok):** iOS PHPicker → cihazda küçült (ör. 1024px JPEG) → HTTPS ile Worker'a base64 → Worker bellekte xAI'ya iletir → yanıt base64 → app'e döner → Worker hiçbir şey yazmaz (R2/KV/log yok, body loglanmaz) → app orijinal fotoyu bellekten siler; üretilen görseller sadece cihazda (Application Support, iCloud yedeği dışı).
- **Yanıt biçimi:** API URL (varsayılan) veya base64 döndürebiliyor. **Öneri: base64** (ZDR ile uyumlu; iOS doğrudan dosyaya yazar). URL'nin geçerlilik süresi dokümanda doğrulanamadı → iOS URL'ye güvenmesin, hemen indirip yerelde saklasın.
- **Maliyet:** $0.02/görsel çıktı. Edit giriş ücreti xAI fiyat sayfasında ayrıca listelenmiyor (doğrulanamadı; varsayım ≤$0.02). **3 görsel ≈ $0.06 (en kötü ~$0.12) / kullanıcı, tek sefer.**
- **Hız:** gecikme resmi olarak doğrulanamadı; prototipte ölçülecek. Paralel üretim + "hazırlanıyor" ekranı + generic avatar yedeği.

## 3) Prototipte backend şart mı?
- **Sadece Mert'in kendi cihazında dahili test:** anahtar cihazda olabilir (ayrı, düşük limitli test anahtarı, sonra iptal).
- **TestFlight ve sonrası: ince Cloudflare Worker proxy şart.** App içindeki anahtar kolayca çıkarılır. Worker ~1 günlük iş; ücretsiz planda başlar.

## 4) Gizlilik ve izinler
- **xAI saklama:** varsayılan olarak istek/yanıtlar 30 gün şifreli saklanıyor (eğitimde kullanılmıyor). **Öneri: xAI Console'da ZDR (Zero Data Retention) aç** → prompt/çıktı diske yazılmaz; görseller base64 dönmeli (Files/hosted URL/Batch kapanır).
- Uygulamada açık **onay ekranı**: fotoğraf xAI'a (üçüncü taraf AI) gönderilir, sadece görsel üretimi için, saklanmaz. Onay olmadan gönderim yok (Guideline 5.1.1, 5.1.2 – üçüncü taraf AI'a veri paylaşımı açıkça bildirilmeli ve izin alınmalı).
- **Fotoğrafsız geç** seçeneği (generic avatar) her zaman var.
- **PHPicker** → tam galeri izni gerekmez. Kamera kullanılırsa `NSCameraUsageDescription`.
- **App Store gizlilik etiketi:** "Photos or Videos" + "Other User Content"; takip için kullanılmıyor; kullanıcıya bağlı değil (hesap yoksa). Uygulama işlevi amacı.
- **Gizlilik politikası:** hangi veri, xAI'a gönderim, saklama (yok/ZDR), üretilen görsel sadece cihazda, silme yolu (uygulamadan "görselleri sil").
- **Yaş:** 13 altı için foto özelliğini kapat veya yaş sorusu; çocuk fotoğrafı riskli.
- Log'larda foto/base64 asla yazılmaz; sadece token/görsel sayısı.

## 5) Faz planı
1. **Prototip (1-2 hafta):** Worker proxy, 1 bölüm (AIMA) üretimi + offline yedek, 3 görsel akışı, ZDR.
2. **Beta/TestFlight:** rate limit, App Attest, maliyet paneli, önceden üretim ve önbellek, onay ekranı.
3. **Launch:** gizlilik politikası + etiketler, bütçe alarmları, A1/A2 içerik testi.

## 6) Görsel sağlayıcı karşılaştırması (foto referanslı)
| Seçenek | Fiyat/görsel (~1MP) | Referans foto | Gizlilik | Not |
|---|---|---|---|---|
| xAI `grok-imagine-image` | $0.02 + giriş ücreti (doğrulanamadı) | Evet, edit, 5 referansa kadar | Eğitim yok; 30 gün saklama, ZDR seçeneği | Metinle aynı sağlayıcı |
| xAI `grok-imagine-image-2.0` | $0.04 + giriş | Evet | Aynı | Daha yüksek kalite |
| Google `gemini-3.1-flash-lite-image` | $0.0336 + giriş $0.25/1M (batch $0.0168) | Evet, düzenleme | Ücretli katmanda eğitim yok | Batch ~async, onboarding için yavaş |
| Google `gemini-2.5-flash-image` | $0.039 | Evet | Aynı | Kullanımdan kalkıyor |
| OpenAI `gpt-image-1-mini` | $0.005 low / $0.011 med + giriş | Evet, edits | — | **1 Ara 2026'da kapanıyor → uygun değil** |
| fal FLUX.1 Kontext [pro] | $0.04 | Evet | fal saklama doğrulanmadı | Karakter tutarlılığı iddiası |
| fal PuLID Flux (yüz kimliği) | $0.0333/MP | Evet, yüz kimliği için | `sync_mode` ile geçmişe kaydetmiyor | Lisans kontrol edilmeli |
| fal FLUX.2 Klein 4B | $0.009/MP giriş+çıkış (~$0.018) | Edit (yüz koruma doğrulanmadı) | Doğrulanmadı | Kâğıt üstünde en ucuz |

**Öneri:** Varsayılan **xAI `grok-imagine-image` ($0.02)**: neredeyse en ucuz, metinle aynı anahtar/sözleşme, ZDR ve base64 destekliyor. Yüz benzerliğinin yeterli olup olmadığı dokümandan **doğrulanamıyor** (benzerlik metriği yok). Prototipte 10 gönüllü fotoğrafıyla kör test: grok-imagine-image vs 2.0 vs fal PuLID/Klein. Benzerlik yetmezse önce 2.0'a ($0.04), sonra PuLID'e geç. Ek sağlayıcı = ek gizlilik bildirimi.

## 7) Basit koruma (2 kullanıcı için)
- Ömür boyu 3 görsel kotası, App Attest/DeviceCheck ve global günlük tavan **kaldırıldı** (2 kullanıcı için gereksiz).
- **Kalan sigorta:** her cihaza Worker'da üretilen rastgele **cihaz token'ı** (kurulumda elle eklenen davet kodu ile alınır, Keychain'de durur). Worker sadece listedeki token'ları kabul eder; token tek tek iptal edilebilir.
- Uygulamaya gömülü tek **paylaşılan gizli anahtar** tek başına yetmez (IPA'dan çıkarılır); ama 2 kişilik TestFlight için davet kodu + cihaz token'ı yeterli.
- Cihaz başı günlük limit: 60 görsel, 300 sahne isteği (Worker'da basit KV sayacı). xAI Console'da aylık harcama limiti (ör. $10) koy.
- Ücretli üyeliğe geçilirse: App Attest + kota + global tavan geri gelir (v2'deki tasarım).

## 8) 12 görsel: zamanlama, dallanma, tutarlılık
- **Dallanma:** JSON'da `dead_ends` aynı sayfaya `return` ediyor ve sadece metin → **ayrı görsel gerekmez**, sayfa görseli kullanılır. Bölüm doğrusal: 12 sayfa = 12 görsel.
- **Zamanlama (öneri):** bölüm açılınca **ilk 3 sayfa paralel**, sonra kullanıcı her sayfaya geçtiğinde **2 sayfa ileri** önceden üret. Kullanıcı neredeyse hiç beklemez (okuma süresi > üretim), yarıda bırakırsa en fazla 2 görsel boşa gider. 12 paralel tümden üretim de mümkün (2 kullanıcıda maliyet farkı önemsiz; rate limit 6 istek/sn), ama tutarlılık için önceki görseli referans almayı zorlaştırır.
- Üretilen görsel cihazda saklanır; tekrar oynamada yeniden üretilmez. Kullanıcı beğenmezse sayfa başına 1 "yeniden üret".
- **Karakter tutarlılığı:**
  1. Her çağrıda **aynı referans foto** + **aynı stil bloğu** + aynı `{aparencia}` + sabit **`{kiyafet}`** ve sabit yan karakter tarifleri (bkz. `image-prompts-draft.md`).
  2. Edit çağrısı 5'e kadar referans görsel kabul ediyor (dokümanda doğrulandı) → 2. referans olarak **bölümün ilk onaylı görseli** (sayfa 1) eklenir; stil ve yüz sabitlenir. Bunun benzerliği gerçekten artırdığı **doğrulanamadı**, testle bakılacak.
  3. **Seed:** okuduğum xAI dokümanında seed parametresi geçmiyor → doğrulanamadı, varsayma.
  4. Aynı en-boy oranı (4:5 dikey) ve tek karakter odaklı kadraj.
- Fotoğraf: bölüm boyunca referans gerektiği için orijinal foto **sadece cihazda** (Keychain/korumalı dosya) tutulur, her çağrıda Worker'a gider; Worker'da yine saklanmaz. Onay metni buna göre ("her sayfa için") güncellendi.

## 9) Maliyet (2 kullanıcı, 1 bölüm)
Varsayımlar: 12 görsel × 2 kullanıcı = 24, +%30 yeniden üretim → ~31 görsel. Giriş görseli ücreti bilinmiyor → aralık $0–0.02 / giriş görseli, çağrı başı 1–2 giriş.

| Model | Çıktı | Giriş görseli (tahmin) | Toplam |
|---|---|---|---|
| grok-imagine-image ($0.02) | $0.62 | $0–1.25 | **~$0.62–1.87** |
| grok-imagine-image-2.0 ($0.04) | $1.25 | $0–1.25 | **~$1.25–2.50** |

- **Metin:** bölüm JSON'u hazır (statik) → metin maliyeti ~$0. AI ile dallanma üretilirse sahne başı ≈ $0.0034 → 12 sahne × 2 × 1.3 ≈ **$0.11**.
- **Ayda 4 bölüm oynansa:** 2.0 ile en kötü ~$10.5/ay. Cloudflare ücretsiz plan yeter (doğrulanmadı).

## 10) Koordinasyon
- **PO:** sahne JSON şeması (`aima-chapter.json`), A1/A2 tanımları (kelime sayısı, zamanlar), kullanıcı başı görsel sayısı, 12 görsel prompt onayı (`image-prompts-draft.md`), sabit kıyafet/yan karakter tarifleri, JSON'a her sayfaya `image.key` eklenmesi, EN metin + PT diyalog şeması, gerçek yer adları listesi, gömülü ana yol içeriği.
- **iOS:** PHPicker + küçültme, onay ekranı, base64 → yerel dosya önbelleği, offline sahneler, App Attest, "fotoğrafsız geç".

## Kaynaklar
- xAI fiyatlar/modeller: https://docs.x.ai/docs/models (27 Eki 2026'da okundu)
- xAI Imagine (edit, referans, URL/base64): https://docs.x.ai/docs/guides/image-generations
- xAI saklama/ZDR: https://docs.x.ai/developers/faq/security
- xAI fiyat sayfası: https://docs.x.ai/docs/pricing , model: https://docs.x.ai/docs/models/grok-imagine-image
- Google Gemini fiyatları: https://ai.google.dev/gemini-api/docs/pricing
- OpenAI gpt-image-1-mini: https://developers.openai.com/api/docs/models/gpt-image-1-mini (kapanış tarihi: https://costgoat.com/pricing/openai-images)
- fal: https://fal.ai/models/fal-ai/flux-pro/kontext , https://fal.ai/models/fal-ai/flux-pulid , https://fal.ai/learn/tools/how-to-use-flux
- Doğrulanamayan: yüz benzerliği kalitesi (hiçbir sağlayıcı için), görsel edit giriş ücreti, görsel gecikmesi, görsel URL geçerlilik süresi, Cloudflare maliyeti.

## 11) En ucuz yüz koruyan görsel seçenekleri (v3.1, 27 Eki 2026)
Fiyatlar ~1MP (1024×1024) çıktı içindir. 2 kullanıcı için bir bölümde yaklaşık 31 görsel (24 + %30 tekrar) varsayıldı.

| Seçenek (sağlayıcı) | $/görsel | 31 görsel | Giriş görseli | Lisans | Verinin gittiği yer / gizlilik |
|---|---|---|---|---|---|
| Pruna P-Image Edit (RunPod) | $0.01 | $0.31 | dahil | Doğrulanmadı | RunPod (ABD şirketi); saklama doğrulanmadı |
| xAI grok-imagine-image | $0.02 | $0.62 (+giriş?) | Ücreti bilinmiyor | Ticari API | xAI (ABD); eğitimde kullanılmıyor; **ZDR var (belgeli)** |
| Qwen-Image-Edit-2511 / Edit (RunPod) | $0.02 | $0.62 | dahil | Apache 2.0 (açık model) | RunPod (ABD); saklama doğrulanmadı |
| FLUX.1 Kontext [dev] (RunPod/Together) | $0.025 | $0.78 | dahil | **Ticari olmayan** (ticari lisans ayrıca) | ABD; uygun değil |
| Seedream 4.0 Edit (RunPod) | $0.027 | $0.84 | dahil | API kullanımı | RunPod (ABD), model ByteDance |
| Seedream 4.0 (BytePlus) | $0.03 | $0.93 | ücretsiz | Ticari API | BytePlus (ByteDance), Singapur bölgesi |
| Qwen-Image-Edit-2509 (fal) | $0.03/MP | $0.93 | dahil | Apache 2.0 | fal (ABD); saklama doğrulanmadı |
| PuLID Flux (fal) | $0.0333/MP | $1.03 | dahil | FLUX dev tabanlı + InsightFace → **ticari lisans riski** | fal (ABD) |
| gemini-3.1-flash-lite-image | $0.0336 + giriş $0.25/1M | ~$1.05 | çok küçük | Ticari API | Google (ABD); ücretli katmanda eğitimde kullanılmıyor |
| FLUX.1 Kontext [pro] (fal/Together) | $0.04 | $1.24 | dahil | Ticari API | ABD |
| Qwen-Image-Edit / 2509 (SiliconFlow) | $0.04–0.045 | ~$1.3 | dahil | Apache 2.0 | **SiliconFlow (Çin)** |
| InstantID (fal) | GPU-saniye | Doğrulanmadı | – | InsightFace modelleri ticari değil (bu turda doğrulanmadı) | fal (ABD) |
| InfiniteYou (Segmind) | $0.00122/GPU-sn (~157 sn → ~$0.19) | ~$6 | – | Doğrulanmadı | Segmind |
| Kendi barındırma (RunPod Serverless L40S) | $1.75/saat (~$0.0005/sn) | ~$0.3–1 + soğuk başlangıç (varsayım) | – | Modele bağlı | Kendi kontrolümüz |

**Yüz benzerliği:** Hiçbir seçenek için bağımsız ve karşılaştırmalı bir benzerlik ölçümü **doğrulanamadı**. PuLID, InstantID ve InfiniteYou özellikle yüz kimliği için yapılmış modeller; diğerleri genel düzenleme modelleri. Replicate'in karşılaştırma yazısı hız ve fiyat veriyor, benzerlik puanı vermiyor.

**Çin sunucuları riski (ayrı başlık):** SiliconFlow, Alibaba DashScope (Pekin bölgesi), Volcengine ve Tencent'e kullanıcının yüz fotoğrafını göndermek:
- Biyometrik sayılabilecek veri Çin'e aktarılmış olur. Çin'de devletin veriye erişimi, AB GDPR ve KVKK'ya göre yurt dışı aktarım ve kullanıcı güveni açısından risklidir.
- Apple 5.1.2(i) gereği, onay metninde şirket ve ülke açıkça yazmalı. "Fotoğrafın Çin'e gidiyor" demek kullanıcıyı caydırır ve App Review'da soru çıkarabilir.
- Öneri: **kullanma.** Aynı açık modeller (Qwen-Image-Edit) ABD'de RunPod veya fal üzerinden çalıştırılabiliyor. BytePlus'ın Singapur bölgesi Çin değil ama şirket ByteDance; bunu ayrıca değerlendirmek gerekir.

**Kendi barındırma:** 2 kullanıcı ve ~31 görsel/bölüm için **mantıklı değil.**
- Soğuk başlangıç onlarca saniye sürer (doğrulanmadı).
- İmaj, model ağırlıkları ve güncellemelerin bakımı bizim üzerimize kalır.
- Kazanç ancak birkaç sent.

**Öneri (ucuz ve gizlilik açısından kabul edilebilir):**
1. **xAI grok-imagine-image, $0.02:** ZDR ve eğitimde kullanılmama belgeli; metinle aynı sağlayıcı. Tek belirsizlik giriş görseli ücreti.
2. **Qwen-Image-Edit-2511 (RunPod Public Endpoint), $0.02:** Apache 2.0, ABD. RunPod'un veri saklaması doğrulanmadı, kullanmadan önce sorulmalı.

**Salt en ucuz (riskli):** Pruna P-Image Edit $0.01 (lisans, yüz koruma ve saklama doğrulanmadı). SiliconFlow Kolors "ücretsiz" görünüyor (üçüncü taraf siteye göre, doğrulanmadı) ama Çin'de ve yüz düzenlemeye uygunluğu bilinmiyor.

**Kör test (güncel):**
- **Modeller (5):**
  - xAI grok-imagine-image
  - xAI grok-imagine-image-2.0
  - Qwen-Image-Edit-2511 (RunPod)
  - Pruna P-Image Edit (RunPod)
  - Seedream 4.0 Edit (RunPod)
  
  Kalite referansı olarak PuLID (fal) yalnızca testte kullanılır.
- **Gönüllüler:** 10 kişi. Her kişi için 3 sahne (sayfa 1, 21, 30), aynı prompt ve stil bloğu. Toplam yaklaşık 180 görsel, maliyeti yaklaşık $4'ün altında.
- **Ölçütler:**
  - Kişinin kendisi ve 2 tanıdığı 1–5 puan verir: "bu ben miyim?"
  - Sahne/stil uyumu 1–5.
  - Sayfalar arası tutarlılık 1–5.
  - Yazı veya logo hatası (evet/hayır).
  - Süre (saniye).
- **Karar:** Benzerlik ortalaması ≥4 olan en ucuz model seçilir. Fiyat eşitse gizlilik belgesi daha iyi olan (xAI) seçilir.
- **Test şartı:** Test fotoğrafları gönüllünün yazılı onayıyla kullanılır ve test bitince silinir.

**Kaynaklar (bu bölüm):**
- https://docs.runpod.io/public-endpoints/reference ve https://www.runpod.io/pricing
- https://www.together.ai/pricing
- https://fal.ai/models/fal-ai/qwen-image-edit-2509/llms.txt, https://fal.ai/models/fal-ai/flux-pulid, https://fal.ai/models/fal-ai/instantid/llms.txt, https://fal.ai/learn/tools/how-to-use-flux
- https://ai.byteplus.com/ark/region:ap-southeast-1/docs/model-pricing
- https://www.siliconflow.com/models/qwen-image-edit (Kolors "ücretsiz" bilgisi üçüncü taraf: https://www.llmrates.ai/providers/siliconflow)
- https://help.aliyun.com/en/model-studio/qwen-image-edit-api (Pekin/Singapur bölgeleri, fiyat bulunamadı)
- https://replicate.com/blog/compare-image-editing-models
- https://www.segmind.com/models/infinite-you/pricing
- https://ai.google.dev/gemini-api/docs/pricing
- https://docs.x.ai/docs/pricing

**Doğrulanamayanlar:**
- Tüm modellerin yüz benzerliği.
- xAI giriş görseli ücreti.
- RunPod, fal ve Segmind'in veri saklama ve eğitimde kullanım politikaları.
- Pruna P-Image lisansı.
- InstantID/InsightFace lisansı (bu turda kontrol edilmedi).
- DashScope, Tencent Hunyuan ve Volcengine fiyatları.
- Kendi barındırmada soğuk başlangıç süresi ve görsel başı süre.

## 12) Mert'in sesiyle pt-PT konuşma örneği (ses klonlama araştırması, 27 Eki 2026)
**Metin hacmi (aima-chapter.json'dan hesaplandı):** bölümdeki tüm Portekizce replikler, seçenekler ve tekrar cümleleri toplam **1.252 karakter**. Konuşma hızı ~15 karakter/sn varsayılırsa ~1,5 dakika ses. 2 kullanıcı ve bir küçük örnek için toplam < 5.000 karakter.

| Servis | pt-PT belgeli mi? | Klon için kayıt | Fiyat (bu iş için) | Veri / ülke | Not |
|---|---|---|---|---|---|
| **ElevenLabs** (IVC; Multilingual v2 / Flash v2.5) | **Evet**: PVC dil listesinde "Portuguese (Portugal)" var. IVC'de açıkça pt-PT yazmıyor | IVC: 1–5 dk (10 sn ile de olur); PVC: 30+ dk | Free plan 10k kredi/ay ama klon için **Starter $6/ay** (30k kredi). 1 karakter ≈ 1 kredi → bölüm ≈ 1.252 kredi | ElevenLabs (ABD/AB şirketi); saklama ve bölge **doğrulanmadı** | Klon sesin "kendi aksanını koruduğunu" söylüyor → Türk aksanı riski |
| **xAI** (Custom Voices + TTS) | **Evet**: TTS dil listesinde `pt-PT` var | 2 dk'ya kadar (90–120 sn önerilir), wav 24 kHz mono 16-bit | TTS $15/1M karakter → bölüm ≈ **$0.02**. Konsolda 30 ücretsiz klon | xAI (ABD); ZDR sesi kapsıyor mu **doğrulanmadı** | **Custom Voices sadece ABD'de (Illinois hariç) açık** → Türkiye'den kullanılamayabilir. Klon API'si Enterprise'a özel |
| **Azure Personal Voice** | Evet: 91 dil ve 100+ yerel, otomatik dil algılama; pt-PT dil listesinde | 5–90 sn örnek + **sözlü onay kaydı** | Karakter başı ücretli; tutar sayfada görünmedi (**doğrulanmadı**) | Microsoft, bölge seçilebilir (AB) | **Erişim başvuru ve onay gerektiriyor**; küçük örnek için yavaş |
| Cartesia (Sonic 3.6) | **Hayır**: sadece `pt`; örnekler Brezilya. Kendi sayfası "Portekiz için ayrıca test edin" diyor | IVC 10–60 sn (Pro $5/ay) | ~1 kredi/karakter | Cartesia (ABD) | Belgesi açık: klon başka dilde **orijinal aksanıyla** konuşur |
| Google / OpenAI / PlayHT / Resemble / Fish Audio | Bu turda kontrol edilmedi | – | – | – | OpenAI'da açık ses klonlama yok (doğrulanmadı) |
| MiniMax, Fish-Speech/OpenAudio, CosyVoice | – | – | – | **Çin şirketi/sunucusu** | Karar gereği **kullanılmaz** |
| Açık kaynak (XTTS-v2, F5-TTS, Chatterbox, Kokoro) | pt var ama pt-PT/pt-BR ayrımı **doğrulanmadı** | 6–30 sn (doğrulanmadı) | GPU maliyeti, kurulum ve bakım | Kendi kontrolümüz | XTTS-v2 lisansı ticari kullanıma kapalı (CPML; bu turda doğrulanmadı). Küçük örnek için zahmetli |

**Diller arası aktarım (Türkçe konuşan kişinin klonu Portekizce konuşursa):**
- Cartesia açıkça yazıyor: klon başka dilde **orijinal aksanıyla** konuşur.
- ElevenLabs da klonun "kendi aksanını koruduğunu" söylüyor.
- Yani Mert'in Türkçe kaydından yapılan klon, Portekizce'yi **hafif Türk aksanıyla** okuyabilir.
- Model pt-PT yerine Brezilya telaffuzuna da kayabilir; Brezilya verisi çok daha fazla (**doğrulanmadı**, dinleyerek test edilecek).
- **Azaltma:** Kaydın bir kısmını Mert'in elinden geldiğince pt-PT okuyarak yapması. ElevenLabs'te dil kodu ve aksanı açıkça vermek. xAI'da `language: "pt-PT"`.

**Biyometrik veri / gizlilik:**
- Ses kaydı ve ses izi KVKK/GDPR'da biyometrik veri sayılabilir. Şimdilik sadece Mert'in kendi sesi, uygulama içinde değil, rıza sorunu yok.
- Uygulamaya girerse onay metni, Apple 5.1.2(i) bildirimi ve gizlilik politikası gerekir.
- Klon test bitince servis panelinden silinmeli. ElevenLabs ve xAI'da ses silme var; saklama süreleri **doğrulanmadı**.

**Öneri:**
1. **ElevenLabs Starter ($6, 1 ay):** pt-PT belgeli (PVC listesinde), arayüzden hemen klon, ABD dışında çalışıyor. Bölüm başı ~1.252 kredi, 30k kredi bolca yeter.
2. **xAI TTS (`pt-PT`):** en ucuz, metinle aynı sağlayıcı. Ancak **Custom Voices ABD dışında kapalı.** Mert Türkiye'deyse klon çalışmayabilir; konsolda denenip doğrulanmalı. Klonsuz hazır seslerle pt-PT örneği için ikinci seçenek.

Azure Personal Voice kalite ve bölge açısından iyi, ama onay süreci yüzünden küçük örnek için yavaş.

**Küçük örnek – adımlar:**
1. Mert'ten kayıt al: **90–120 sn**, sessiz oda, iPhone ağızdan ~20 cm.
   - Doğal konuşma: yarısı Türkçe/İngilizce, yarısı pt-PT okuma (bölümdeki replikler).
   - **Voice Memos yeterli.** Ayarlar > Uygulamalar > Ses Notları > Ses Kalitesi: **Kayıpsız**. Dosya `.m4a` gelir; kutuda `ffmpeg` ile wav 24–44.1 kHz, mono, 16-bit'e çevrilir.
2. ElevenLabs Starter hesabı (Mert açar ve öder) → Voices → Instant Voice Clone → dosyayı yükle → ses doğrulama adımını tamamla.
3. Metin: `aima-chapter.json` içinden pt-PT replikleri çıkar (1.252 karakter). İlk deneme için 5–6 replik yeterli.
4. TTS: Multilingual v2 (kalite) ve Flash v2.5 (ucuz) ile ikişer deneme, çıktı mp3/wav.
5. Mert ve bir pt-PT konuşanı dinler, 1–5 puan verir: "ses benim mi", "Portekiz aksanı mı Brezilya mı", "Türk aksanı var mı".
6. Sonuç iyiyse sayfa başı replik dosyaları (`page_<id>_<n>.mp3`) app içine gömülür; çalışma anında TTS çağrısı olmaz.

**Kaynaklar:**
- https://help.elevenlabs.io/hc/en-us/articles/19569659818129-What-languages-are-supported-with-Professional-Voice-Cloning
- https://elevenlabs.io/pricing ve https://elevenlabs.io/voice-cloning
- https://docs.x.ai/developers/model-capabilities/audio/custom-voices
- https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
- https://docs.x.ai/developers/rest-api-reference/inference/voice
- https://x.ai/voice/cloning ve https://docs.x.ai/docs/pricing (TTS $15/1M karakter)
- https://learn.microsoft.com/en-us/azure/ai-services/speech-service/personal-voice-overview ve https://learn.microsoft.com/en-us/azure/ai-services/speech-service/personal-voice-how-to-use
- https://docs.cartesia.ai/build-with-cartesia/tts-models/latest, https://docs.cartesia.ai/build-with-cartesia/capability-guides/clone-voices-pro, https://www.cartesia.ai/languages/portuguese

**Doğrulanamayanlar:**
- ElevenLabs IVC'nin gerçekten pt-PT aksanı üretip üretmediği; sadece PVC listesinde belgeli.
- Türk aksanına ya da Brezilya'ya kayma derecesi (hiçbir servis için ölçüm yok).
- xAI Custom Voices'un Türkiye'den çalışıp çalışmadığı (belge "sadece ABD" diyor).
- Azure Personal Voice fiyatı ve onay süresi.
- ElevenLabs ve xAI ses verisinin saklama süresi ve bölgesi.
- Google, OpenAI, PlayHT, Resemble ve Fish Audio (bu turda kontrol edilmedi).
- XTTS-v2, F5-TTS, Chatterbox ve Kokoro lisansları ve pt-PT desteği.
