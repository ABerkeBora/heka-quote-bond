# Quote Bond V1 / V2 incelemesi

- **V1:** http://localhost:3104/ — `v1-baseline`, commit `974ae378b3e953d1dc8804c51ffb721133be70a7`.
- **V2:** http://localhost:3104/next — aynı public repoda `codex/next`.
- [Repo / V2 dalı](https://github.com/ABerkeBora/heka-quote-bond/tree/codex/next). Tek server: port3104; `npm start`. Kurulum README'de; V1 geçmişi ve route'u korundu.

**Öneri: V2.** Merchant'ın kabul ettiği minimum ekonomik karşılığı sözleşmeye bağladığı için müşteri değeri ve jüriye gösterilecek kabul/ret ayrımı daha açık. V1'in capped ödemesi bilinçli davranıştır; V2 ek merchant tercihidir. Sunum riski **medium**: ek kabul adımı, RPC ve kaynak freshness bağımlılığı var. Kayıtlı gerçek örnekler incelenebilir; taze ödemede güncel veri yeniden alınır.

Değişenler: immutable `maxUncoveredUSD18`; ayrı merchant kabul transaction'ı; geçerli fiyat coverage limitine yetmezse ödeme öncesi duruş. Genel platform/LLM authority/yeni oracle eklenmedi.

## Kanıtlı durum

Base Sepolia V2: [0x1f92600480b282026e2bf4c252763566b4212cb6](https://sepolia.basescan.org/address/0x1f92600480b282026e2bf4c252763566b4212cb6). V1'den farklı tokenlar, üç wallet rolü, `/api/next`, `.local/v2` ve `evidence/v2` kullanır. V1 protected token/rezerv/state'i aynı kaldı. Yalnız mevcut test deployer'dan0.0014testETH ayrı gas bütçesi ayrıldı; ortak funding key kullanılmadı.

| Senaryo | Gerçek sonuç / kanıt |
|---|---|
| Merchant kabulü | [Ayrı merchant transaction'ı](https://sepolia.basescan.org/tx/0x5b476fcbb9900b9bcb3446fbf0fab1178c29fd8d51cc94b730d2323603e15514); hash chain/contract/ID/parties/assets/amount/reserve/coverage/expiry'yi bağlar |
| Full-only110USD, limit0 | [100test-USDC +9.929256test-USDT; açık0](https://sepolia.basescan.org/tx/0xf8bd1654e25094757f64fb4c2bbef0295e0d5af799786078aae3c2467a03669f) |
| Strict140USD, limit0 | Agent yeni imza/broadcast üretmeden durdu (`agent-coverage-block.json`); [doğrudan çağrı CoverageInsufficient ile revert](https://sepolia.basescan.org/tx/0x402739633ab7716188eef1e25c5f3649167b70d0ab223ce8cee99d5cc1ac3eb6). USDC buyer'da,25USDT rezervde; quote tüketilmedi |
| Explicit partial140USD, limit20 | [25test-USDT katkı;14.94330398188768USD açık](https://sepolia.basescan.org/tx/0x36568d01ff15c8294a3f4ede918eabc9622017b45c99860ca7172e61b0fc0357) kabul edilen limitin içinde |
| Gerçek browser akışı | [Merchant kabulü](https://sepolia.basescan.org/tx/0xf4ab2658710cb8063229b73400be889f8e50781c0789906ccdbb629920c01efd) → tek buyer yetkisi → [agent ödemesi](https://sepolia.basescan.org/tx/0xe6dfd570c685f67ee728a32c4a97e71e1bbcd4802303c0291cf9857058621e30); ek manuel payment tıklaması0 |
| Red/tekrar/restart |4 gerçek oracle tamper revert'i, kabul edilmemiş quote revert'i, yanlış rol/hash/diğerquote testi; duplicate ve ayrı Node sürecinde hem kabul hem ödeme makbuzu/gas uzlaştırması. `live-summary.json`, `negative-*.json`, `acceptance-binding.json`, `process-restart.json` |

Tüm yeni kanıtlar `evidence/v2/` altında. Bağımsız incelemede policy hash'leri, imzalar, integer hesap/bakiye farkları yeniden kontrol edildi; audit iddiası yok.

## Çalıştırılan kontroller

41 Node testi (24 V1+17 V2),88 contract testi (34 V1+54 V2), production build ve dependency audit PASS. V1 kaynak/kanıt hash'leri değişmedi; eski geçerli ödeme historical `eth_call` ile yeniden geçti.1440/768/390px gerçek CUA QA: taşma yok; mobile ana işlem erişilebilir; history, blocked/partial ayrımı ve V1 linki çalıştı. Screenshot'lar tool kaydında; desteklenen API yerel export üretmedi. `BROWSER_QA.md`, `v1-regression.json`, `deployment-verification.json`.

##150 saniyelik sunum

| Zaman | Göster |
|---|---|
|0:00–0:20 | İki link: V1 gap'i gösterir; V2 merchant toleransını uygular |
|0:20–0:45 | Exact policy ve ayrı merchant kabul receipt'i |
|0:45–1:10 | Buyer ilk yetkisi, otomatik full ödeme/receipt |
|1:10–1:35 | Geçerli imza ama yetersiz coverage; agent no-broadcast ve contract revert |
|1:35–1:55 | Merchant'ın açıkça izin verdiği partial örnek |
|1:55–2:20 |4 oracle tamper reddi; gerçek reverted transaction linkleri |
|2:20–2:30 | Duplicate/restart ve test/source sınırı |

## Kalanlar ve sınırlar

- **Video + Devfolio PENDING:** kullanıcı kaydı/girişi, yaklaşık15–25dk. Tek takım/tek submission; son tarih31 Ekim15:00 Europe/Berlin. Bu chat başvuru/hosting yapmadı.
- **Dış merchant pilotu yapılmadı.** Ayrı test rolünün gerçek on-chain kabulü ve örnek defterden hesaplanmış rapor var; ticari müşteri/gerçekfiat backing iddiası yok.
- Blocked rezerv harddeadline'a kadar kilitlidir; sonrasında V2 release/void yolu kullanılabilir. Yeni invoice eski limiti değiştirmez. Merchant acceptance ve buyer mandate expiry exclusive; node/gas cap uygulama guard'ıdır.
- Pozitif/partial şartlar açık stress quote'tur, depeg uydurulmadı. İmza fiyatın doğruluğunu/USDT backing'ini/rapor kalitesini kanıtlamaz. Source stale ise bekle ve taze veriyle tekrar dene; policy'yi gevşetme.

31 Ekim04:46Europe/Berlin: API3 ve genel kurallar doğru sekmeler açılıp yeniden okundu, değişiklik yok. Temiz source-only kopya, env/key/localstate olmadan iki route ve iki kaydedilmiş geçmişi production açtı; signerlar disabled idi (`clean-start.json`). Son13receipt RPC ile yeniden doğrulandı (`final-receipt-check.json`). Teknik blocker yok; final public push/commit kaydı aşağıdaki kısa özette tamamlanır.
