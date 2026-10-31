# Quote Bond — sabah inceleme notu

Durum: çalışan yerel ürün ve gerçek API3/testnet ödeme kanıtları hazır. İnceleme hedefi31 Ekim2026 08.00–09.00 Europe/Berlin; çalışma erken tamamlandı. Yarışma submission'ı **tamamlanmadı**: video kaydı ve Devfolio girişi kullanıcıda.

## Aç ve dene

- [Yerel uygulama](http://127.0.0.1:3104), port3104. Production server son doğrulamada açık bırakılacak.
- [Public repo](https://github.com/ABerkeBora/heka-quote-bond), branch `codex/build`; push sonucu aşağıdaki teslim kaydında.
- Yeniden başlat: bu klasörde `npm start`. İlk/temiz kurulum: `npm ci`, `forge build`, `npm run build`, `npm start`.
- Mevcut izole test cüzdanı yerel ignored `.env` ile bağlı. Public repo anahtar içermez. Yeni kullanıcı ayrı0600 test cüzdanları ve kendi deployment'ı kurabilir; README parent proje dosyalarına bağımlı değildir.
- Fresh invoice →110USD stress terms → raporu incele → **Accept report & authorize**. İlk yetki sonrası agent kendi başına signed data alıp gerçek payment transaction'ını yollar.100USD normal,140USD capped seçenekleri de çalıştırıldı.
- Bu cüzdan setinde ilk1000USDC'den500USDC kaldı; beş işlem daha için collateral var. Otomatik gas/collateral top-up yok. Sadece test ağı.

## Gerçekten çalışan akış

Örnek5satırlık defterden4benzersiz invoice ve1duplicate içeren gerçek mutabakat raporu hesaplanır. Raporun SHA256 hash'i kabulde gönderilir ve yeni quoteID'sine bağlanır. Buyer exact100 test-USDC ve tek merchant için30dk mandate'i on-chain kaydeder; ayrı platform funder25 test-USDT rezerv ayırır. Bounded deterministik agent gerçek ücretsiz Nodary USDC/USD+USDT/USD yanıtını alır, kontrolleri yapar ve atomik ödemeyi başlatır. Model/LLM fiyat, beneficiary veya işlem belirlemez.

Contract: Base Sepolia84532, [0x0adccdd8461696284b9b728267a23a4e38163ab2](https://sepolia.basescan.org/address/0x0adccdd8461696284b9b728267a23a4e38163ab2). Final kaynak SHA256 ve runtime bytecode karşılaştırması `evidence/deployment-verification.json` içinde.

| Senaryo | Gerçek sonuç | Kanıt |
|---|---|---|
|110USD rapor invoice |100test-USDC +9.916874test-USDT |[Transaction](https://sepolia.basescan.org/tx/0xcc488ac491a2c9e371a2b370c0433baa0229373bd9dad831e2e28b257b17111d), `evidence/browser-payment.json` |
|140USD capped |25test-USDT cap;14.9331125USD açık kaldı |[Transaction](https://sepolia.basescan.org/tx/0xf2067aea97fe5e83b384668192f9a90e6308851d493399a8ba836c01b14a15df), `evidence/capped-payment.json` |
|100USD normal |100test-USDC;0top-up |[Transaction](https://sepolia.basescan.org/tx/0x96c1664cc70eb635783bc8c908511cfda44b7ec9e8131f6fea2d6ebeb2ad6029), `evidence/standard-payment.json` |
|4tamper |Edited/wrong-request/wrong-key →NotSignedByAirnode; gerçek aged envelope →ResponseTooOld |`evidence/tamper-*.json`; dördü de gerçek reverted tx, korunan token/state aynı |
|Duplicate/budget |Yeni ödeme yok; sınır aşımı reddi |`evidence/duplicate.json`, `blocked-budget.json` |
|Gerçek süreç restart |Ayrı Node process receipt/result/gas'ı kurtardı; yeni tx yok |`evidence/process-restart.json` |

İlk integration ödemesinin gerçek before/after bakiyeleri `evidence/live-payment.json` içinde; bu eski ödeme sonradan eklenen rapor kabulüymüş gibi sunulmaz. Rapor özelliğinin ayrı browser transaction'ı yukarıdadır.

## Doğrulama

- Node policy/decimal/service testleri: **24/24 PASS**.
- Foundry contract testleri: **34/34 PASS**; `evidence/forge-tests.txt`.
- Production build: **PASS**. Dependency audit: **0 vulnerability**.
- CUA gerçek browser E2E:110/140/100USD invoice initial acceptance →auto payment →confirmed receipt; preview/download hash eşleşmesi; recorded rejection replay.
-1440×900,768×1024,390×844: taşma yok;11px altı metin yok; mobile mandate bağlantısı çalıştı. Tasarım achromatic-ledger, seed961220014; copper shortfall waterfall, yerel Geist fontları. `evidence/BROWSER_QA.md`.
- TasteSkill source lint:0FAIL. Standalone inspector yerine session'ın zorunlu CUA browser yolu kullanıldı. Screenshot'lar chat tool kaydında; desteklenen export/clipboard→Preview denemesi dosya üretmedi. Public repo'ya var olmayan screenshot dosyası eklenmedi.
- Resmî API3+general kurallar03:54Europe/Berlin'de reload edilerek tekrar okundu; maddi değişiklik yok. Teknik qualification kanıtlarıPASS; actual videoPENDING.

## Sınırlar ve sabah işleri

1. **Video kaydı, PENDING, yaklaşık10–15dk.** `PRESENTATION.md`150sn akış. Valid ödeme ve4red göster; UI'nin historical replay'ini yeni broadcast diye anlatma. Orijinal4reverted explorer receipt hazır.
2. **Takımın proje seçimi ve Devfolio girişi, PENDING, yaklaşık10dk.** Bir takım tek submission, en fazla3partner track. Son tarih31Ekim15.00Europe/Berlin. Bu chat submit etmedi.
3. **İsteğe bağlı fresh judge response,5–10dk.** Server'ı durdur, `npm run judge:prepare`; çıktıdaki quoteID ile `npm run submit-response -- --file evidence/judge-response.json --quote QUOTE_ID`. `--broadcast` gerçek test gas harcar. Stalecase timestamp'ı değiştirmeden120s+bekle.
4. **İsteğe bağlı bağımsız ekran görüntüsü dışa aktarma,2–5dk.** CUA'da görsel QA tamamlandı; repo içine dosya gerekiyorsa kullanıcı screenshot alabilir.

Bu bir production custody ürünü/audit değildir. Test merchant aynı yerel harness'te ayrı role sahiptir; gerçek ticari müşteri yoktur. Signed Nodary fiyatı kaynağın doğruluğunu, fiat backing'i veya rapor kalitesini kanıtlamaz. Her iki varlık değer kaybedebilir. İlk fresh snapshot timing seçimi vardır.110/140USD açık stress terms'dir; depeg uydurulmadı.

Gas guard0.0002testETH için buyer approval+mandate+payment'ı toplar; execution maxfee+bufferedL1 tahmini broadcast öncesi kontrol edilir, gerçek L1fee receipt'e eklenir. Bu uygulama kontrolüdür; değişken Base L1 ücretini on-chain hardcap eden genel wallet platformu değildir. Revert gas gizlenmez. USDC invaliddata/void durumunda buyer'da kalır; reserve harddeadline sonrası funder'a döner.

## Teslim kaydı

Public repository/push ve production smoke testinin kesin sonucu son commit ile güncellenecek. Goal yalnız bu teslim doğrulandıktan sonra complete yapılacak.
