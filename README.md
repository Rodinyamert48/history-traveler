# Tarih Yolcusu — İstanbul 1453

Türkiye haritasından bir şehir seçip o şehrin önemli tarihî dönemini **birinci şahıs** olarak,
oyunlaştırılmış görevler ve mini oyunlarla yaşadığın, *stylized high‑quality low‑poly* bir web FPS oyunu.
İlk oynanabilir bölüm: **İstanbul — 1453, İstanbul'un Fethi**.

- **Motor:** Babylon.js 9 (WebGPU öncelikli, otomatik WebGL2/WebGL1 yedeği)
- **Dil / derleme:** TypeScript + Vite (GitHub Pages uyumlu, göreli yollar)
- **Varlıklar:** Tüm 3B modeller, dokular, müzik ve ses efektleri **kodla prosedürel** üretilir — repo'da tek bir görsel/ses dosyası yoktur.
  İsteyen, aşağıda anlatıldığı gibi GLB modeller ve ses dosyaları ekleyip prosedürel olanların yerine koyabilir.

## Hızlı başlangıç

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ (tsc --noEmit + vite build)
npm run preview    # build çıktısını yerelde sun
```

Faydalı URL parametreleri:

| Parametre | Açıklama |
|---|---|
| `?engine=webgl` / `?engine=webgpu` | Render API'yi zorla (varsayılan: otomatik, WebGPU → WebGL) |
| `?mission=mission_005` | İstanbul'a girerken doğrudan bir göreve atla (QA / demo) |

## Oyun akışı

```
BOOT → Yükleme ("TARİHİN İÇİNE GİR") → Ana Menü → Türkiye Haritası → İstanbul seçildi
     → Sinematik geçiş (zoom, harita 3B araziye dönüşür, bulutlardan dalış, "İSTANBUL / 1453")
     → Gökten ordugâha iniş → FPS → Görev 1 … Görev 8 → Final → Haritaya dönüş
```

### Türkiye haritası
- 81 il, Natural Earth (kamu malı) verisinden ekstrüde edilmiş 3B il blokları, komşu ülkeler, animasyonlu deniz, gölge düşüren bulutlar.
- **İstanbul** kırmızı, parlayan, üzerine gelince yükselen ve tıklanabilir; etiket: *İSTANBUL · 1453 — İstanbul'un Fethi*.
- Diğer iller soluk/desatüre ve tıklanamaz; üzerine gelince *"Bu şehir henüz keşfedilmedi."* (+ `cities.json`'da tanımlıysa "Yakında: yıl · olay").
- İstanbul'a tıklayınca kamera sinematik olarak yaklaşır, il kabartmalı araziye dönüşür, bulut katmanından dalınır, ardından İstanbul sahnesine gökyüzünden inilir.

### İstanbul 1453 — görevler (`public/data/scenarios/istanbul_1453.json`)

| # | Görev | Tür | Mekanik |
|---|---|---|---|
| 1 | Sultan'ın Otağı | story | Fatih Sultan Mehmet ile konuş |
| 2 | Kızakları Hazırla | collect | Kayıkçıyla Haliç'i geç, 3 kızak kütüğünü yağla (basılı tut) |
| 3 | Gemileri Karadan Yürüt | minigame | **Ritim mini oyunu** (aşağıda) |
| 4 | Sultan'a Haber Ver | story | Fatih: *"Şimdi topları hazırlayın."* |
| 5 | Topları Hazırla | deliver | Cephanelikten 3 gülleyi Şahi topuna taşı |
| 6 | Surları Döv | minigame | **Topçuluk mini oyunu** — 4 hedef |
| 7 | Surlara İlerle | combat | **Kuşatma mini oyunu** — 3 nokta ele geçir |
| 8 | Sancağı Burca Dik | story | İskeleden sura tırman, sancağı dik (basılı tut) → final |

### Mini oyunlar
1. **Gemileri karadan yürütme** — Davul her ~1 sn'de vurur; halka hedef çembere oturduğunda `SPACE` (mobilde dev **ÇEK** butonu).
   *MÜKEMMEL / İYİ / ERKEN / GEÇ / ÇOK HIZLI* derecelendirmesi, kombo bonusu, geminin gerçek momentumu
   (sürtünme + yokuşta geri kayma: yavaş basınca ilerleme azalır). Süre dolarsa ceza yok: *+30 sn ile devam*.
   UI: `SHIP PROGRESS ████████░░ 80%`, süre, kombo, ritim halkası. Ekip NPC'leri halatla çeker/iter, davulcu güvertede.
2. **Topçuluk** — Şahi topunun başına geç: fare yön, tekerlek veya `Q/E` açı, sol tık ateş, `F` ayrıl (mobilde sürükle + ▲▼ + ATEŞ).
   Balistik mermi (yerçekimi + hafif sürtünme), yörünge önizlemesi, namlu alevi + ışık, stilize duman, kamera sarsıntısı,
   taş parçaları, *"KISA KALDI · 12 m / UZUN GİTTİ / SOLA KAÇTI"* geri bildirimi. Hedefler: Küçük Kule, Sur Bölümü (gedik açılır),
   Savunma Noktası, Büyük Kule.
3. **Sur kuşatması** — Yeniçerilerle birlikte A/B/C noktalarını sırayla ele geçir; bölgedeki her müttefik hızı artırır.
   Surlardaki savunucuların stilize okları yalnızca kısa süre sersemletir (kan/şiddet yok). Ardından iskeleden burca çıkıp sancak dikilir.

## Kontroller

| Tuş | İşlev |
|---|---|
| `W A S D` | Hareket |
| Fare | Kamera (oyun alanına tıklayınca imleç kilitlenir) |
| `Shift` | Koşma (FOV artışı + farklı head‑bob) |
| `Space` | Zıplama · gemi mini oyununda kürek çek/it |
| `E` / Sol tık | Etkileşim · topta açı yükselt |
| `Q` | Topta açı düşür |
| `F` | Özel etkileşim (sancak dik, toptan ayrıl) |
| Fare tekeri | Top açısı |
| `ESC` | Menü (Devam / Ayarlar / Haritaya Dön) |

**Mobil:** sanal joystick (sol), sürükle‑bak alanı (sağ), E/F/KOŞ/ZIPLA butonları, gemi oyununda dev **ÇEK**, top oyununda sürükle‑nişan + ▲▼ + ATEŞ.
Mobil cihazlarda kalite otomatik **LOW/MEDIUM**, masaüstünde **HIGH**.

## Ayarlar (oyun içinden, anında uygulanır, localStorage'a kaydedilir)
- **Grafik:** Kalite (LOW/MEDIUM/HIGH/ULTRA), Çözünürlük ölçeği, Gölgeler, Partiküller, Post Processing, FPS göstergesi, Render API
- **Ses:** Ana ses, Müzik, Efektler
- **Kontroller:** Fare hassasiyeti, FOV (80–100), Y eksenini ters çevir

Kayıt (`localStorage`, anahtar `history-traveler.save.v1`): açılan şehirler, tamamlanan görevler/senaryolar, kaldığın görev, tüm ayarlar.
Bozuk kayıt verisi doğrulanıp onarılır; depolama yoksa oyun bellekte çalışmaya devam eder.

## Render ve performans

| Özellik | Uygulama |
|---|---|
| WebGPU → WebGL | `src/core/EngineFactory.ts`; özel shader'lar hem **GLSL hem WGSL** yazıldı, WebGPU yolunda CDN'den transpiler indirilmez |
| PBR + HDR ortam | Tüm yüzeyler PBR; gökyüzü analitik modelden CPU'da **half‑float HDR küp** + küresel harmonikler + GGX ön‑filtreleme |
| Gölgeler | HIGH/ULTRA: Cascaded Shadow Maps, MEDIUM: kameraya bağlı tek gölge haritası, LOW: kapalı |
| SSAO / AA | SSAO2 (HIGH+), MSAA 4x / FXAA, bloom, ACES tonemapping, vinyet, keskinleştirme, film greni |
| Su | Kamerayı takip eden grid, vertex shader dalgaları, türev tabanlı düz (low‑poly) normaller, fresnel gök yansıması, araziden üretilen derinlik haritasıyla kıyı köpüğü |
| Instancing | Tüm tekrar eden modeller GPU instancing; NPC'ler parça başına **tek draw call** + örnek başına renk (`instanceColor`) |
| LOD + culling | Prefab başına basitleştirilmiş LOD + uzaklık kesimi, arazi parçaları (chunk) için yarım çözünürlük LOD + frustum culling |
| NPC LOD | Yakın: tam animasyon, orta: düşük hız, uzak: donuk, çok uzak: gizli |
| Diğer | Statik geometri malzemeye göre birleştirilir, dünya matrisleri dondurulur, partikül havuzları, debris nesne havuzu, ağır efektler opsiyonel |

## Mimari

```
src/
  core/        GameManager (durum makinesi), EngineFactory, InputManager, SaveManager, EventBus
  config/      GAME_CONFIG (tüm ayarlanabilir değerler), kalite presetleri
  rendering/   SkyModel/SkyEnvironment (IBL), Water, shaders (GLSL+WGSL), ProceduralTextures, MaterialLibrary, RenderPipeline
  assets/      GeoBuilder (low‑poly modelleme), Prefabs (model kütüphanesi), PrefabLibrary (instancing/LOD), AssetLoader (GLB)
  map/         MapScene (Türkiye haritası), GeoProjection, MapGeometry
  world/       CollisionWorld (kinematik karakter çarpışması), HeightfieldTerrain, NavGraph (A*)
  entities/    Player (FPS), HumanoidFactory (instanced NPC parçaları), NPC (davranış + prosedürel animasyon), NPCManager
  systems/     InteractionSystem, ParticleFX, CameraFX, Waypoint
  missions/    MissionManager (veri odaklı), tipler
  minigames/   BaseMinigame, ShipTransportMinigame, CannonMinigame, SiegeMinigame
  audio/       AudioManager, SynthLibrary (prosedürel SFX + enstrümanlar), MusicSequencer (Hicaz makamında üretken müzik)
  ui/          UIManager, HUD, Dialogue, Settings, Map UI, sinematik katman, mobil kontroller (DOM, değişiklik‑tabanlı güncelleme)
  scenarios/   registry + istanbul1453/ (layout, dünya kurulumu, sahne/görev host'u)
public/data/   turkey-geo.json, cities.json, scenarios/istanbul_1453.json
```

### Yeni şehir eklemek
1. `public/data/cities.json` içine kayıt ekle (`id`, `turkey-geo.json`'daki il kimliğiyle aynı olmalı):
   ```json
   { "id": "ankara", "name": "Ankara", "year": 1920, "title": "Büyük Millet Meclisi'nin Açılışı", "active": true, "scenario": "ankara_1920" }
   ```
2. `src/scenarios/ankara1920/` altında bir `ScenarioModule` yaz (İstanbul'daki yapıyı örnek al) ve
   `src/scenarios/registry.ts`'e tembel yükleyiciyi ekle. Senaryolar ayrı kod parçalarına (chunk) bölünür.
3. Görev ve diyalogları `public/data/scenarios/<id>.json` dosyasında tanımla (kod değişikliği gerekmez).

### Kendi modellerini/seslerini eklemek
- **Modeller:** GLB dosyasını `public/assets/models/` altına koy ve `src/assets/AssetLoader.ts` içindeki `MODEL_MANIFEST`'te ilgili anahtarı
  (örn. `galley`, `otag`, `soldierTent`) dosya yoluna ayarla. Yükleme ilerlemesi raporlanır; dosya bulunamazsa/bozuksa oyun çökmez,
  prosedürel model kullanılır.
- **Sesler:** `src/audio/AudioManager.ts` içindeki `AUDIO_SAMPLE_MANIFEST`'te ses adını `.ogg/.mp3` yoluna bağla; yüklenemezse sentez sesi çalar.

## GitHub Pages'te yayınlama
`vite.config.ts` içinde `base: "./"` — tüm yollar göreli, depo adı ne olursa olsun çalışır.
`.github/workflows/deploy.yml` `main` dalına her push'ta derleyip Pages'e yükler:
1. Repo → **Settings → Pages → Source: GitHub Actions**
2. Değişiklikleri `main`'e birleştir (veya workflow'u elle çalıştır).

## Neler gerçek, neler yer tutucu?
**Tamamen çalışan:** harita + seçim + sinematik geçiş, FPS kontrol/çarpışma, 8 görevin tamamı, 3 mini oyun, NPC davranışları ve yol bulma,
Fatih NPC'si ve diyaloglar, kayıt/devam, ayarlar, mobil kontroller, prosedürel ses ve müzik, WebGPU/WebGL.

**Bilinçli olarak basitleştirilmiş / yer tutucu:**
- 3B modeller ve dokular prosedürel low‑poly'dir (stilize bitmiş görünüm hedeflenir); GLB manifesti boş gelir.
- Ses ve müzik WebAudio sentezidir (kayıtlı ses dosyası yok); örnek ses dosyası manifesti boş gelir.
- İstanbul "temsili"dir: mesafeler oynanış için sıkıştırıldı; şehir içi (surların doğusu) görsel olarak vardır ama gezilemez.
- NPC animasyonları prosedüreldir (iskelet/skinning yok); yüz ifadeleri yoktur.
- Gün/zaman: tek atmosfer (sabah); son hücumda (görev 7–8) şafak tonlarına geçiş yapılır.
- Diğer şehirler haritada "Yakında" olarak listelenir; senaryoları henüz yok.

## Lisans / kaynaklar
- Kod: bu depo.
- Harita sınırları: [Natural Earth](https://www.naturalearthdata.com/) 1:10m/1:50m (kamu malı), sadeleştirilmiş.
- Yazı tipleri: Google Fonts (Cinzel, Inter) — çevrimdışı durumda sistem yazı tiplerine düşülür.
