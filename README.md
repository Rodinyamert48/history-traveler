# Tarih Yolcusu

Türkiye haritasından bir şehir seçip o şehrin tarihinden bir anı **birinci şahıs** olarak,
oyunlaştırılmış görevler ve mini oyunlarla yaşadığın, *stylized high‑quality low‑poly* bir web FPS oyunu.
Oynanabilir bölümler:

- **İstanbul — 1453, İstanbul'un Fethi** (3 mini oyun)
- **Muğla — Menteşe, Keşkeğin Keşfi** (4 mini oyun): eski Muğla evleri, kızılçam ormanı ve bir köy düğünü
- **Ankara — 23 Nisan 1920, TBMM'nin Açılışı** (3 mini oyun): tamamen I. TBMM binasının içinde geçer
- **Kayseri — 1390, Ticaretin ve Pazarlığın Keşfi** (3 mini oyun): duvarlarla çevrili çarşı ve han; yağlama, mantı, pazarlık ve Kadı Burhaneddin

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
| `?mission=mission_005` / `?mission=mugla_m06` | Bölüme girerken doğrudan bir göreve atla (QA / demo) |

## Oyun akışı

```
BOOT → Yükleme ("TARİHİN İÇİNE GİR") → Ana Menü → Türkiye Haritası → Şehir seçildi
     → Sinematik geçiş (zoom, il 3B kabartmaya dönüşür, bulutlardan dalış, "İSTANBUL / 1453" · "MUĞLA / 1375" · "ANKARA / 1920")
     → Gökten sahneye iniş → FPS → Görev 1 … Görev 8 → Final → Haritaya dönüş
```

### Türkiye haritası
- 81 il, Natural Earth (kamu malı) verisinden ekstrüde edilmiş 3B il blokları, komşu ülkeler, animasyonlu deniz, gölge düşüren bulutlar.
- **İstanbul** ve **Muğla** kırmızı, parlayan, üzerine gelince yükselen ve tıklanabilir; etiketler: *İSTANBUL · 1453 — İstanbul'un Fethi*, *MUĞLA · 1375 — Keşkeğin Keşfi*.
  Bitirilen bölümün etiketine *FETHEDİLDİ ✓ / KEŞFEDİLDİ ✓* eklenir.
- Diğer iller soluk/desatüre ve tıklanamaz; üzerine gelince *"Bu şehir henüz keşfedilmedi."* (+ `cities.json`'da tanımlıysa "Yakında: yıl · olay").
- Şehre tıklayınca kamera sinematik olarak yaklaşır, il kabartmalı araziye dönüşür (İstanbul'da minyatür surlar, Muğla'da minyatür çam ormanı), bulut katmanından dalınır, ardından sahneye gökyüzünden inilir.

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

### Muğla · Menteşe — Keşkeğin Keşfi (`public/data/scenarios/mugla_keskek.json`)
Menteşe Beyliği döneminde, çam ormanlarıyla çevrili bir Muğla köyü. Yarın büyük bir düğün var; köyün aşçıbaşısı
**Ayşe Nine** bütün köyü, yaylayı ve yolcuları doyuracak bir yemek fikri buluyor. Sen onun çırağısın.
*(Hikâye, keşkeğin köy düğünlerindeki yerini anlatan kurgusal bir rivayettir; keşkek geleneği 2011'de UNESCO
Somut Olmayan Kültürel Miras Temsili Listesi'ne alınmıştır.)*

| # | Görev | Tür | Mekanik |
|---|---|---|---|
| 1 | Düğün Telaşı | story | Meydanda Ayşe Nine ile konuş |
| 2 | Ambardan Buğday | deliver | Köy ambarından dibek taşına 3 çuval buğday taşı |
| 3 | Dibekte Dövme | minigame | **Dibek mini oyunu** — Hasan Emmi ile sırayla tokmak |
| 4 | Çam Ormanında Odun | collect | **Orman mini oyunu** — kuru dal + çıra topla, ocağa getir |
| 5 | Et, Su ve Tuz | collect | Kasap, çeşme ve bakkaldan malzemeleri al, Ayşe Nine'ye teslim et |
| 6 | Ocağı Harla | minigame | **Ateş mini oyunu** — akşam olurken kazanı kaynat |
| 7 | Gece Boyu Karıştır | minigame | **Karıştırma mini oyunu** — gece boyunca keşkeği kıvamına getir |
| 8 | Düğün Sofrası | deliver | Sabah düğününde keşkeği 3 sofraya taşı, Halil Ağa ile konuş → final |

**Dünya:** beyaz badanalı iki katlı eski Muğla evleri (ahşap *hayat* galerisi, geniş saçak, kiremit, uzun beyaz **Muğla bacaları**),
**kabalaklı** avlu kapıları ve avlu duvarları, Arnavut kaldırımlı sokaklar, çınarlı ve sekili meydan, taş çeşme, mescit, ambar,
kasap/bakkal tezgâhları, düğün bayrağı (tepesinde elma), arı kovanları, kuru taş duvarlar, harman yeri ve anız tarlaları,
köyü çevreleyen **kızılçam ormanı**. Ağustos böceği ve kuş sesli orman ambiyansı, zeybek usulünde (9/8) Hüseyni makamı müzik,
düğünde davul‑zurna. Hikâye ilerledikçe **ikindi → akşam → gece → şafak** geçişi; gece pencereler ve ocak ateşi aydınlatır.

**Mini oyunlar:**
1. **Dibekte buğday dövme** — Hasan Emmi çift vuruşlarda, sen tek vuruşlarda vurursun (`SPACE` / sol tık, mobilde **VUR**).
   Aynı anda vurursanız *TOKMAKLAR ÇARPIŞTI!*; ilerledikçe tempo hızlanır. Kombo, MÜKEMMEL/İYİ/ERKEN/GEÇ dereceleri, ilerleme çubuğu.
2. **Çam ormanında odun** — Serbest dolaşma: altın ışık sütunları 10 kuru dal demeti ve 3 çırayı gösterir, `E` ile toplanır;
   her demet seni biraz yavaşlatır. Süre (2:30) dolarsa ceza yok: *+45 sn ile devam*.
3. **Ocağı harla** — Isı yakıta göre değişir: `E` odun at, `SPACE` körük, `Q` köz çek. Isı altın bantta kalırsa kazan kaynar;
   fazla harlarsa taşar (ilerleme düşer), rüzgâr ateşi düşürür. Mobilde **KÖRÜK / ODUN / KOR** butonları.
4. **Gece boyu karıştır** — Fareyle daireler çiz (veya `A`/`D`'ye sırayla bas; mobilde parmakla daire). Doğru hız bandında keşkek
   kıvamlanır ve rengi açılır; yavaş kalırsan dibi tutar, hızlı karıştırırsan taşar. %25/%50/%75'te Ayşe Nine'den ipuçları.

Her mini oyun `F` (mobilde **BIRAK**) ile bırakılıp sonra kaldığı yerden tekrar denenebilir.

### Ankara · 23 Nisan 1920 — TBMM'nin Açılışı (`public/data/scenarios/ankara_1920.json`)
Açık dünya yoktur: bölüm baştan sona **I. TBMM binasının içinde** geçer (giriş holü, koridor, telgrafhane, depo ve Genel Kurul salonu).
Oyuncu, açılış gününde meclis kâtiplerine yardım eden bir gençtir. Bölüm boyunca **"Dağ Başını Duman Almış"** marşının
sözsüz, sentezlenmiş bir düzenlemesi çalar.

| # | Görev | Tür | Mekanik |
|---|---|---|---|
| 1 | 23 Nisan Sabahı | story | Başkâtip Nuri Efendi ile konuş |
| 2 | Başkanlık Divanı | deliver | Depodan divana 3 sandalye taşı |
| 3 | Gaz Lambaları | minigame | **Lamba mini oyunu** — salondaki 8 gaz lambasını yak |
| 4 | Telgrafhane | minigame | **Telgraf mini oyunu** — tamimi Mors alfabesiyle vilayetlere gönder |
| 5 | Mebuslar Geliyor | story | Cuma namazından gelen mebusları karşıla, salon dolar |
| 6 | Zabıt Kâtibi | minigame | **Zabıt mini oyunu** — Şerif Bey'in açılış konuşmasını yaz |
| 7 | Egemenlik Milletindir | story | Mustafa Kemal Paşa kürsüde → final |

**Final:** Mustafa Kemal Paşa kürsüden *"Egemenlik kayıtsız şartsız milletindir."* der; salon alkışlar, müzik susar,
ekran yavaşça kararır ve Atatürk'ün *"Biz her şeyi gençliğe bırakacağız… Geleceğin ümidi, ışıklı çiçekleri onlardır.
Bütün ümidim gençliktedir."* sözü belirir.

**Mini oyunlar:**
1. **Gaz lambaları** — Salonda dolaş, lambanın altında `E`; fitil göstergesindeki ibre altın bölgedeyken `E`/`SPACE`/tık.
   Az açarsan söner, fazla açarsan is yapar. Her yanan lamba salonu biraz daha aydınlatır.
2. **Telgraf** — `SPACE`'e kısa bas = nokta, basılı tut = çizgi (mobilde **TUŞ**). *ANKARA · MECLİS · 23 NİSAN* harf harf gönderilir;
   yanlış işaret o harfi baştan başlatır. Mors maniplesi ve telgraf sesi gerçek zamanlıdır.
3. **Zabıt kâtibi** — Konuşmayı kelime kelime yaz (`ş→s`, `ğ→g`, `ı→i` gibi yazılabilir; mobilde doğru kelimeye dokun).

*Tarihî notlar:* Meclis 23 Nisan 1920 Cuma günü, Hacı Bayram-ı Veli Camii'nde kılınan namazın ardından açıldı; açılışı en yaşlı
üye Sinop Mebusu Şerif Bey yaptı. Oyundaki konuşma sadeleştirilmiş bir özettir. Kâtip, telgrafçı ve karşılanan mebusların
adları kurgusaldır. "Egemenlik kayıtsız şartsız milletindir" sözü Atatürk'e aittir ve finalde dramatik olarak açılış anına yerleştirilmiştir.
*Müzik:* Ezgi 19. yüzyıldan kalma kamu malı bir şarkıya dayanır; oyundaki düzenleme sentezle, kulaktan yapılmıştır ve birebir olmayabilir.
Hak sahibi olduğun bir kaydı `public/assets/audio/dag-basini-duman-almis.mp3` olarak koyup `src/audio/AudioManager.ts` içindeki
`MUSIC_SAMPLE_MANIFEST.ankara` değerini bu yola ayarlarsan bölüm boyunca o kayıt çalar.

### Kayseri · 1390 — Ticaretin ve Pazarlığın Keşfi (`public/data/scenarios/kayseri_pazar.json`)
Kapalı bir dünya: her yer duvarla çevrilidir. Bölüm, tonozlu ve tepe pencereli bir **arasta** (iki yanında bakırcı, kumaşçı,
baharatçı, kasap, pastırmacı, kuyumcu, kapan, çömlekçi, şerbetçi… dükkânları) ile ona açılan iki katlı revaklı bir **han avlusunda**
(şadırvan, develer, kervan denkleri, eyvan ve Kadı'nın divanı) geçer. Kayseri'nin koyu volkanik taşı ve kırmızımsı tüf süslemeleri
kullanılır; avludan, eyvanın üstünde karlı **Erciyes** görünür. Oyuncu, çarşıda **yağlama ve mantı** satan Ahi Bekir Usta'nın çırağıdır.

| # | Görev | Tür | Mekanik |
|---|---|---|---|
| 1 | Çarşı Sabahı | story | Ahi Bekir Usta ile konuş |
| 2 | Un ve Kıyma | deliver | Han ambarından 2 çuval un, kasaptan kıyma taşı |
| 3 | Kırk Mantı Bir Kaşığa | minigame | **Mantı mini oyunu** — hamuru düz kes, mantıların köşelerini kapat |
| 4 | Sac Başında | minigame | **Sac mini oyunu** — üç sacda yağlama yufkası pişir |
| 5 | Muhtesibin Terazisi | story | Muhtesibden narhı öğren, teraziyi kapanda denet |
| 6 | Pazarlığın Keşfi | minigame | **Pazarlık mini oyunu** — beş müşteriyle pazarlık et, keseyi doldur |
| 7 | Kadı Efendi Çarşıda | deliver | Kadı Burhaneddin'in divanına yağlama tepsisi götür |
| 8 | Alan Razı, Satan Razı | story | Divanın önündeki anlaşmazlıkta tanıklık et → final |

**Mini oyunlar:**
1. **Kırk mantı bir kaşığa** — Bıçak hamurun üstünde gidip gelir; parlayan çizgiye gelince `SPACE` (mobilde **KES**). Sonra her mantı
   için gösterilen sırayla dört köşeyi kapat (`ok tuşları` / `WASD`, mobilde ok düğmeleri). Süre her turda kısalır; kırk mantıda biter.
2. **Sac başında** — Üç sac aynı anda, farklı hızda pişirir. `A/D` veya `←/→` ile sacı seç, alt yüz altın rengine gelince `SPACE` ile
   çevir, ikinci yüz de kızarınca al. Erken alınan çiğ kalır, geç kalan yanar; sekiz iyi yufka bir tepsi yağlama eder.
3. **Pazarlığın keşfi** — Her müşterinin isteği, **narhı** (muhtesibin belirlediği doğru fiyat), teklifi ve **sabrı** görünür; ödemeye
   razı olacağı en yüksek fiyat gizlidir, sözlerinden sezilir. `←/→` ±1, `↑/↓` ±5 akçe; `SPACE` fiyatını söyle, `Q` teklifini kabul et,
   `E` bir lokma ikram et (bir kez; gönlünü yumuşatır). Fahiş fiyat itibarı sarsar ve müşteriyi kaçırır; malı yok pahasına vermek de
   kâr değildir. Narha yakın, müşteriyi memnun bırakan satış **"Alan razı, satan razı!"** sayılır. Kese hedefe ulaşmalıdır.

**Final:** Cenevizli tüccar ile kumaşçı arasındaki anlaşmazlığı Kadı Burhaneddin, tanıklığın ve muhtesibin raporuyla çözer:
*"Alan razı, satan razı; kadıya ne düşer?"* Kamera avludan Erciyes'e yükselir, *"Alan razı, satan razı."* (atasözü) belirir ve
ekran kararırken Kayseri'nin ticaret ve Ahilik geleneğini anlatan kapanış yazısı gelir.

*Tarihî notlar:* Kadı Burhaneddin Ahmed (1345–1398) Kayserili bir âlimdi; Kayseri kadılığından hükümdarlığa yükseldi, Sivas–Kayseri
merkezli devletini 1381–1398 arasında yönetti ve şiirleri bir divanda toplandı. Muhtesib (çarşı ve narh denetçisi), narh, kapan
(umumi tartı) ve Ahilik esnaf teşkilatı dönemin çarşı hayatının gerçek kurumlarıdır; Selçuklu döneminde Kayseri yakınlarında uluslararası
**Yabanlu Pazarı** kurulurdu. Hikâye ise kurgudur: Ahi Bekir Usta, muhtesib, müşteriler ve anlaşmazlık hayalîdir; Kadı Burhaneddin'e
söyletilen sözler tarihî alıntı değildir. Fiyatlar (akçe) oyun için uydurulmuştur.

## Kontroller

| Tuş | İşlev |
|---|---|
| `W A S D` | Hareket |
| Fare | Kamera (oyun alanına tıklayınca imleç kilitlenir) |
| `Shift` | Koşma (FOV artışı + farklı head‑bob) |
| `Space` | Zıplama · gemi oyununda kürek çek · dibekte tokmak vur · ocakta körük |
| `E` / Sol tık | Etkileşim · topta açı yükselt · ocağa odun at |
| `Q` | Topta açı düşür · ocakta köz çek |
| `F` | Özel etkileşim (sancak dik, toptan ayrıl, mini oyunu bırak) |
| Fare tekeri | Top açısı |
| `ESC` | Menü (Devam / Ayarlar / Haritaya Dön) |

**Mobil:** sanal joystick (sol), sürükle‑bak alanı (sağ), E/F/KOŞ/ZIPLA butonları, gemi oyununda dev **ÇEK**, top oyununda sürükle‑nişan + ▲▼ + ATEŞ,
Muğla mini oyunlarında **VUR**, **KÖRÜK/ODUN/KOR**, parmakla daire çizerek karıştırma.
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
| Thin instance bölgeleri | Muğla'daki binlerce çam, çalı, kaya ve ekin demeti `PrefabLibrary.scatter()` ile 90 m'lik bölgelerde **thin instance** olarak çizilir: CPU maliyeti yok, bölge başına frustum culling + LOD + uzaklık kesimi |
| Gün döngüsü | `AtmosphereController`: gökyüzü, güneş/ay, ortam ışığı, sis ve IBL yoğunluğu fazlar arasında yumuşak geçer |
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
  minigames/   BaseMinigame, ShipTransportMinigame, CannonMinigame, SiegeMinigame,
               DibekMinigame, ForestGatherMinigame, FireMinigame, StirMinigame,
               LampMinigame, TelegraphMinigame, MinutesMinigame,
               MantiMinigame, SacMinigame, PazarlikMinigame
  audio/       AudioManager, SynthLibrary (prosedürel SFX + enstrümanlar), MusicSequencer (Hicaz / Hüseyni / Uşşak makamında üretken müzik)
  ui/          UIManager, HUD, Dialogue, Settings, Map UI, sinematik katman, mobil kontroller (DOM, değişiklik‑tabanlı güncelleme)
  scenarios/   registry, common/FpsScenario (ortak FPS katmanı: oyuncu, ışık, NPC, diyalog, HUD, görev köprüsü),
               istanbul1453/, mugla/, ankara/ ve kayseri/ (layout, dünya kurulumu, sahne: NPC'ler, mini oyunlar, görev kancaları)
public/data/   turkey-geo.json, cities.json, scenarios/{istanbul_1453, mugla_keskek, ankara_1920, kayseri_pazar}.json
```

### Yeni şehir eklemek
1. `public/data/cities.json` içine kayıt ekle (`id`, `turkey-geo.json`'daki il kimliğiyle aynı olmalı):
   ```json
   { "id": "ankara", "name": "Ankara", "year": 1920, "title": "Büyük Millet Meclisi'nin Açılışı", "active": true, "scenario": "ankara_1920" }
   ```
2. `src/scenarios/ankara1920/` altında `FpsScenario`'dan türeyen bir sahne ve bir `ScenarioModule` yaz (İstanbul / Muğla örnek alınabilir:
   dünyayı kur, NPC'leri yerleştir, mini oyunları ve görev kancalarını bağla) ve `src/scenarios/registry.ts`'e tembel yükleyiciyi ekle.
   Senaryolar ayrı kod parçalarına (chunk) bölünür. Yeni mini oyun kimliklerini `scripts/validate-data.mjs`'e ekle.
3. Görev ve diyalogları `public/data/scenarios/<id>.json` dosyasında tanımla (kod değişikliği gerekmez).

### Kendi modellerini/seslerini eklemek
- **Modeller:** GLB dosyasını `public/assets/models/` altına koy ve `src/assets/AssetLoader.ts` içindeki `MODEL_MANIFEST`'te ilgili anahtarı
  (örn. `galley`, `otag`, `soldierTent`) dosya yoluna ayarla. Yükleme ilerlemesi raporlanır; dosya bulunamazsa/bozuksa oyun çökmez,
  prosedürel model kullanılır.
- **Sesler:** `src/audio/AudioManager.ts` içindeki `AUDIO_SAMPLE_MANIFEST`'te ses adını `.ogg/.mp3` yoluna bağla; yüklenemezse sentez sesi çalar.

## GitHub Pages'te yayınlama
`vite.config.ts` içinde `base: "./"` — tüm yollar göreli, depo adı ne olursa olsun çalışır.

**A) Daldan yayın (Settings → Pages → Source: Deploy from a branch)** — ek ayar gerekmez.
Derlenmiş oyun depoda `docs/` klasöründe durur. Kök `index.html` kaynak dosyadır; Pages onu
olduğu gibi sunduğunda TypeScript girişi yüklenemez ve sayfa kendiliğinden `docs/`'a yönlenir.
Klasör olarak `/docs` seçilirse oyun doğrudan açılır. Oyunda değişiklik yaptıktan sonra:
```bash
npm run build:pages   # dist/ → docs/
git add docs && git commit -m "Update Pages build" && git push
```

**B) GitHub Actions ile yayın (Source: GitHub Actions)** — `.github/workflows/deploy.yml`
`main` dalına her push'ta derleyip yükler (veya workflow'u Actions sekmesinden elle çalıştır).
Bu yolda `docs/` kullanılmaz.

## Neler gerçek, neler yer tutucu?
**Tamamen çalışan:** harita + seçim + sinematik geçiş, FPS kontrol/çarpışma, dört bölümde 31 görevin tamamı, 13 mini oyun,
NPC davranışları ve yol bulma, Fatih / Ayşe Nine ve diyaloglar, gün → gece → şafak geçişi, kayıt/devam, ayarlar, mobil kontroller,
prosedürel ses ve müzik, WebGPU/WebGL.

**Bilinçli olarak basitleştirilmiş / yer tutucu:**
- 3B modeller ve dokular prosedürel low‑poly'dir (stilize bitmiş görünüm hedeflenir); GLB manifesti boş gelir.
- Ses ve müzik WebAudio sentezidir (kayıtlı ses dosyası yok); örnek ses dosyası manifesti boş gelir.
- İstanbul "temsili"dir: mesafeler oynanış için sıkıştırıldı; şehir içi (surların doğusu) görsel olarak vardır ama gezilemez.
- Muğla köyü de temsilidir: evlerin ve avluların içine girilemez; Muğla mimarisi (badanalı evler, bacalar, kabalaklar) stilize edilmiştir.
- Keşkeğin "keşfi" bir halk rivayeti olarak kurgulanmıştır; tarihî bir olay iddiası taşımaz.
- Kayseri çarşısı ve hanı temsilîdir (belirli bir yapının kopyası değildir); üst kat revaklarına çıkılmaz.
- NPC animasyonları prosedüreldir (iskelet/skinning yok); yüz ifadeleri yoktur.
- Gün/zaman: İstanbul'da sabah → son hücumda şafak; Muğla'da ikindi → akşam → gece → şafak, hikâyeye bağlı (serbest gün döngüsü yok).
- Diğer şehirler haritada "Yakında" olarak listelenir; senaryoları henüz yok.

## Lisans / kaynaklar
- Kod: bu depo.
- Harita sınırları: [Natural Earth](https://www.naturalearthdata.com/) 1:10m/1:50m (kamu malı), sadeleştirilmiş.
- Yazı tipleri: Google Fonts (Cinzel, Inter) — çevrimdışı durumda sistem yazı tiplerine düşülür.
