# Quote Bond — onaylı uygulama kapsamı

31 Ekim 2026 uygulama yetkisiyle hazırlanmıştır. İnceleme hedefi 08.00–09.00 Europe/Berlin; yerel port3104. Seçili partner track yalnız API3. Güncel çalışan durum için `MORNING_HANDOFF.md`, kullanım için `README.md`, kanıt durumu için `TRACK_REQUIREMENTS.md` esas alınır.

Belirli bir agent hizmetinin kabul edilmiş tek faturasını ödeyen bounded payer. Kullanıcı örnek defterden üretilmiş mutabakat raporunu inceleyip tek merchant, exact100 test-USDC ve30dakika için ilk yetkiyi verir. Rapor hash'i invoice ID'sine bağlanır; kaliteyi sözleşme yargılamaz. Ayrı platform fonlayıcısı25 test-USDT rezerv ayırır. Agent gerçek ücretsiz Nodary `latestFeeds` USDC/USD+USDT/USD yanıtını alır, deterministik doğrular ve atomik ödemeyi başlatır. Sözleşme100USDC ve hesaplanan cappedUSDT katkısını sabit beneficiary'ye aktarır; kullanılmayan rezervi funder'a döndürür.

On-chain buyer authorization exact quote'a bağlıdır. Recipient, assets, quoteUSD, escrow, reserve, signer, request ve zamanlar sonradan değiştirilemez. Gas+L1 fee politikası uygulama guard'ıdır; genel wallet AA/session-key platformu değildir. One-payment state ve durable signed transaction journal çift ödemeyi engeller. Belirsiz intent önce receipt ile uzlaştırılır; tekrar fonlama ve automatic top-up yoktur.

Kaynak reçetesi `server/oracle.mjs`; canonical derivation resmî starter'dan. Ham data byte'ları değiştirilmez. Envelope120s, iki ayrı source300s, skew60s; verisiz/eksik/stale durumda ödeme kapalı. Normal pencere15dk, önceden belirlenmiş grace30dk; hard45dk. Mandate30dk sona erdiğinde agent yeni debit yapamaz. Hard deadline sonrası unpaid USDC buyer'da kalır; USDT funder'a döner. İlk geçerli fresh snapshot kazanır; tam tarihsel T anı fiyatı iddiası yoktur.

Pozitif test koşulu110USD/100test-USDC'dir;140USD capped senaryo da vardır. Gerçek fiyat değiştirilmez ve depeg hikâyesi uydurulmaz. Normal100USD quote'ta top-up0 olabilir. USDT fiyatı1USD sabitlenmez. Her iki test token6decimals; fiyat18decimal; USDC floor, USDT ceil/cap. Teminat tokenları fiat-backed varlık değildir. Nodary çağrısı ücretsizdir; sahte x402 ücreti yoktur.

Kapsam dışı: genel mevduat sigortası, sınırsız USD garantisi, underwriting, swap router, köprü, yeni API yayınlama ve service-quality adjudication. Yerel test seller/keys ticari müşteri entegrasyonu değildir. Runtime LLM bu projede zorunlu değildir; payer açıkça deterministik agent olarak etiketlenir.

Teslim: ayrı public repository, kurulum/readme/env/lockfile; gerçek testnet valid+4tamper/duplicate/budget/restart kanıtı; contract/payment/security testleri; desktop/tablet/phone browser QA;2.5dk sunum taslağı ve dürüst Türkçe sabah notu. Video kaydı ve Devfolio başvurusu ayrı insan işidir; başvuru bu çalışma tarafından yapılmaz.
