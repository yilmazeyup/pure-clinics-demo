# Admin soldaki menü: kullanıcının notları

Kullanıcı menüyü madde madde geziyor. Burada sadece not tutuluyor. Hepsi en sonda birlikte düzeltilecek.

Panel: pureclinics.savastana.com/beheer. Menü kodu: `apps/admin/src/components/Shell.tsx` (NAV).

## Kararlar

1. **Overview (Overzicht):** kalıyor. Genel bir özet ekranı olacak.
2. **Diary (Agenda):** menüden kalkacak, çünkü Praktijk'in kendi Agenda ekranı var. Ana sayfadaki ajanda bölümü ise yerinde kalacak.
3. **Treatment plans (Trajecten):** menüden kalkacak. Overview'daki kartı yerinde kalacak. O karta tıklayınca Treatment plans'in kendi tam sayfası açılacak. (Kullanıcı onayladı.)
4. **Webshop:** aşağıdaki özellikler Praktijk'in **Voorraad** (stok) ekranına eklenecek (kullanıcı, 25 Kasım: "bunları stok ekranına ekle"). Bu ekran hem webshop'u hem dükkânlardaki ürünleri kapsayacak. Menüdeki Webshop maddesine ne olacağı henüz belli değil. İki ihtimal var: stok ekranını açabilir ya da ayrı kalabilir. Kullanıcıya soruldu.
   - 3D: kullanıcı, webshop ile dükkânlardaki ürünlerin 3D gösterilip gösterilmeyeceğini sordu. Önerim: stok ekranının üstünde tek bir 3D raf olsun ve bir anahtarla Webshop / Nijmegen / Uden arasında geçilsin. Rafta her ürünün ne kadar dolu olduğu stoğu göstersin; haftaya bitecek ürünler göze çarpsın. Sipariş listesi, tedarikçiler ve e-postalar ise normal tablolarda kalsın. Ana sayfadaki webshop rafı da zaten 3D, o yeniden kullanılabilir.

   Stok ekranına gelecekler:
   - Kaç ürün sattım (dönem dönem).
   - Kaç ürünüm var: her ürünün stoğu.
   - Her ürünü ne kadar sürede sipariş edip teslim alabiliyorum (tedarikçinin teslim süresi).
   - Gelecek hafta bitmesi muhtemel ürünler.
   - Gelecek ay bitmesi muhtemel ürünler.
   - Ürünler hakkındaki müşteri yorumları.
   - Her ürünün yanında bir "Tedarik et" düğmesi. Basınca ürün bir istek listesine eklenir.
   - Tedarikçiler: ürünleri kimden alıyorsak onların adı, e-postası ve diğer bilgileri kaydedilir.
   - İstek listesinden tedarikçiye talep e-postası kendiliğinden hazırlanır.
   - Seçenek: bu e-posta otomatik gönderilsin ya da önce elle onaylansın.

   Teknik not: Praktijk'in Voorraad ekranında bunların bir kısmı zaten var: tedarikçiler (iletişim kişisi, e-posta, telefon, teslim süresi), minimumun altına düşenler için otomatik sipariş listesi, yoldaki siparişler ve teslim alma. Webshop sayfası aynı stok ve tedarikçi verisini kullanmalı; ikinci bir stok sistemi kurulmamalı. Voorraad'da hiç olmayanlar: "haftaya / gelecek ay biter" tahmini, ürün yorumları, ürün başına satış sayısı, otomatik ya da elle talep e-postası.

5. **Practice (Praktijk):**
   - Adı değişecek. Yeni ad henüz seçilmedi.
   - "subscription / abonnement" etiketi kalkacak; burası ayrı bir ek modül gibi durmayacak, panelin son sürümü olacak.
   - Şimdilik bu alanı sadece adminler görecek.
6. **Giriş paneli (yeni):** sitede bir giriş ekranı olacak. Giren kişiye göre farklı şey görünecek:
   - Admin: her şey.
   - Çalışan: kendi işi. Praktijk'in Team & rechten ekranında bu profiller zaten var: Huidtherapeut, Receptie, Beauty, Boekhouder.
   - Müşteri: kendi randevuları, seansları, faturaları ve online randevu.

   Teknik not: site şu an sunucusu olmayan bir demo. Gerçek bir giriş (şifre, sadece o kişiye ait veri) arkada bir sunucu ister. Demo için hazır demo hesaplarla bir giriş ekranı yapılabilir. Hangisi yapılacak, henüz kararlaştırılmadı.

## Kararlaştırılanlar (25 Kasım, kullanıcı: "Tamam mantıklı, bunlara bir çalış bakalım")

- Menüdeki Webshop maddesi stok ekranını açacak. Ekranın adı "Webshop & voorraad"; Kliniek'in altında artık ayrıca durmayacak.
- Practice'in yeni adı **Kliniek**. Diğer dillerde: Clinic, Klinik, Clinique, Clínica, Clinica, العيادة.
- Giriş, şimdilik demo hesaplarla yapılacak; sunucu yok. Hesaplar:
  - Neslihan: admin.
  - Loubna: huidtherapeut.
  - Husna: receptie.
  - Sanne Willems: uydurma bir müşteri.
- Doğrudan bir hesapla açan link: `…/beheer/?als=client`. Diğer değerler: `admin`, `loubna`, `husna`.

## Yapılanlar (25 Kasım, canlıda: commit a505532)

- Menü: Diary ve Treatment plans menüden çıktı. Webshop maddesi stok ekranını açıyor. Kliniek'in "abonnement" etiketi kalktı. Kliniek'in özet ekranındaki "Abonnement actief" etiketi de kalktı.
- Giriş ekranı:
  - Admin her şeyi görüyor.
  - Çalışan "Mijn dag" sayfasını görüyor: terapist kendi randevularını ve kendi serilerini, resepsiyon da kliniğin bütün gününü.
  - Müşteri "Mijn Pure" sayfasını görüyor: sıradaki randevusu, serisi, faturaları ve bakım önerisi.
  - Menünün altında kimin giriş yaptığı ve bir "Uitloggen" düğmesi var.
- Treatment plans'in tam sayfası (`#trajecten`) yapıldı:
  - Üstte beş durum kutusu var, bunlar aynı zamanda filtre.
  - İsim araması; tedavi, klinik ve terapiste göre filtreler.
  - Tüm müşterilerin listesi, "Herinner alle" düğmesi ve tedavi başına özet kartlar.
  - Hatırlatmalar ortak tutuluyor: çalışanın gönderdiği, admin'de de "Verstuurd" olarak görünüyor.
- Webshop & voorraad ekranı yapıldı:
  - 3D raf, Nijmegen / Uden / Beide seçimiyle.
  - "Verkoop & prognose" sekmesi: satışlar ve haftaya / gelecek ay bitecek ürünler.
  - Aanvraaglijst: elle eklenen ürünler de burada.
  - Tedarikçiye giden Felemenkçe e-posta taslağı, tedarikçi başına otomatik/elle ayarıyla.
  - Yeni tedarikçi eklenebiliyor.
  - Recensies: uydurma demo yorumlar.
- Ana sayfadaki webshop rafı ve stok ekranı aynı stoktan okuyor. Bugünkü webshop siparişleri, müşteriye en yakın kliniğin stoğundan düşüyor.

## İkinci tur (25 Kasım, canlıya aldıktan sonra)

7. **Cliënten:** üst menüden kalktı, çünkü Kliniek'in altında zaten var (kullanıcı, 25 Kasım).
8. **Overview'daki "Agenda van vandaag" kartı:** tıklayınca Kliniek › Agenda açılıyor. Kartın başında bir "Open de agenda" düğmesi de var.
9. **Instellingen:** üst menüden kalktı.
   - Sol alttaki isim kutusuna tıklayınca kişinin kendi ayarları açılıyor: ad, e-posta, dil, bildirimler, iki adımlı giriş, şifre değiştirme ve çıkış.
   - Kliniğin ayarları Kliniek › Instellingen & koppelingen'de, Mailchimp'inkiler Campagnes › Instellingen'de. Ayrı bir menü maddesine gerek yok.
10. **Hulp & video:** menüden kalktı. Her sayfanın sağ üstünde bir soru işareti var. Tıklayınca açılan panelde şunlar var:
    - sayfanın ne işe yaradığı;
    - sayfadaki her bölüm, ne işe yaradığı ve nasıl kullanıldığı; bölüme tıklayınca sayfa oraya gidiyor;
    - videonun yeri ("binnenkort"); videolar proje bitince yapılacak.

    Overview'da eski "Uitleg" turu da bu panelin içinde.
11. **"Testomgeving" kutusu, üstteki "Demo · fictieve gegevens" etiketi ve Kliniek özetindeki "Demo · fictieve cliënten" satırı:** kalktı.
    Kalanlar:
    - Bir şey gönderince çıkan "In de demo gaat er niets echt de deur uit" bildirimleri.
    - Yorumlardaki "Demo · verzonnen recensies" etiketi.
    - Giriş ekranındaki "şifresiz demo" notu.
12. **Webshop = e-ticaret (kullanıcının sorusu):** Webshop sayfasında online satışlar ve sitedeki stok görünmüyor. Kullanıcıya nasıl çalıştığı anlatıldı ve bir öneri sunuldu:
    - sayfa e-ticaretle başlasın: online siparişler, durumları, online satış rakamları, sitede görünen stok;
    - stok ve tedarikçi kısmı altta kalsın.

    Cevap: "platform" = Pure'un kendi sitesi ve uygulaması. Yapıldı: Webshop & voorraad ekranı iki parçalı.
    - **Webshop** (ilk açılan):
      - Bugünkü online satış, paketlenecekler, kuryeye hazırlar, yoldakiler.
      - **Bestellingen:** site ve uygulamadan gelen her sipariş. Durum: yeni → paketlendi → gönderildi → teslim edildi. Hangi klinikten çıktığı ve filtreler görünüyor. Siparişe tıklayınca ayrıntı, kargo kodu ve paketle/gönder düğmeleri açılıyor.
      - **Online verkoop:** son 30 gün. Ciro, sipariş sayısı ve ortalama sepet var. Günlük sütunlar uygulama ve site olarak ayrılıyor. En çok satanlar da burada.
      - **Op de site en in de app:** müşterinin gördüğü stok ("op voorraad / nog n / uitverkocht"), ürünü online gizleme düğmesi ve "bijna op" eşiği.
    - **Voorraad & inkoop:** eskisi gibi; 3D raf, tahmin, talep listesi, tedarikçiler ve yorumlar burada.

## Hâlâ açık

- Menünün geri kalanı: Campagnes.

- Gerçek giriş (şifre, e-posta kodu, sunucu): sonra.
