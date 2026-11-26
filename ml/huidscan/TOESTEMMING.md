# Toestemming: je foto's gebruiken om onze huidanalyse te verbeteren

*Tekst voor het toestemmingsformulier in de kliniek en voor de app. Versie 1, 27 november 2026. Laat de tekst nog
nakijken door wie Pure adviseert over privacy voordat hij in gebruik gaat.*

---

Pure Clinics werkt aan een eigen huidanalyse: een computermodel dat op een foto van je gezicht laat zien wat er
zichtbaar is, zoals roodheid, pigmentvlekken, fijne lijntjes, zichtbare onzuiverheden of een vermoeide oogzone. Om
dat model goed te maken, hebben we foto's nodig van echte huid, beoordeeld door onze huidtherapeuten. Daarom vragen
we of we jouw gezichtsfoto's daarvoor mogen gebruiken.

**Dit is een aparte vraag.** Ze staat los van je behandeling. Zeg je nee, of zeg je niets, dan verandert er niets aan
je behandeling, je advies of je afspraken. De foto's die we voor je behandeling maken, blijven gewoon in je dossier.

## Waar vragen we toestemming voor?

1. **Training van onze huidanalyse.** We gebruiken je gezichtsfoto's (vooraanzicht, linker- en rechterkant) om het
   model van Pure Clinics te trainen en te testen.
2. **Optioneel: de gezamenlijke dataset.** Pure werkt met het programma Huidly. Huidklinieken die ook met Huidly
   werken, kunnen hun beoordeelde uitsneden samenvoegen tot één dataset, zodat het model beter wordt voor elke
   huidtint en elk huidtype. Daar doe je alleen aan mee als je dit apart aanvinkt.

## Wat gebruiken we, en wat bewaren we?

- Van je foto's maken we **uitsneden van zones van je gezicht**: voorhoofd, wangen, neus, kin en de huid onder je ogen.
- Bij elke uitsnede bewaren we **wat onze huidtherapeut ziet**: een cijfer van 0 tot 3 voor roodheid, pigment, fijne
  lijntjes en de oogzone, kaders om zichtbare vlekjes, je huidtint op de Monk-schaal en of de foto goed genoeg is.
- De uitsneden zijn **gepseudonimiseerd**: ze dragen een code (zoals PC0042), nooit je naam, geboortedatum of
  e-mailadres. Alleen Pure kan de code aan jou koppelen; die koppeling staat apart, in je cliëntdossier.
- **Metadata halen we eraf**: geen datum, tijd, locatie of toestel uit de foto gaat mee.
- We stellen **geen diagnose** en het model doet dat ook niet. Het beschrijft alleen wat zichtbaar is.

## Waar staat het?

- Op de eigen computer van Pure Clinics in de kliniek, met een versleutelde schijf, of op servers in de Europese Unie
  van Huidly, het programma waarmee Pure werkt, onder een verwerkersovereenkomst.
- Je foto's en uitsneden gaan **niet buiten de Europese Unie** en niet naar diensten waarmee Pure geen
  verwerkersovereenkomst heeft.
- Alleen de huidtherapeuten die labelen en de persoon die het model traint, kunnen bij de uitsneden.

## Hoe lang?

- Tot je je toestemming intrekt, en **uiterlijk 5 jaar** na de datum van de foto. Daarna verwijderen we de uitsneden
  en de beoordelingen.
- Het getrainde model zelf bevat geen foto's van jou: het is een rekenregel die van veel foto's samen is geleerd.

## Toestemming intrekken

- Dat kan altijd, zonder uitleg: mail **info@pureclinics.nl**, zeg het aan de balie, of zet de schakelaar in de app uit.
- Binnen 30 dagen halen we je uitsneden en beoordelingen uit de dataset, ook uit de gezamenlijke dataset als je daaraan
  meedeed. Je krijgt een bevestiging.
- Een model dat al getraind is, kunnen we niet laten vergeten wat het van jouw foto's leerde. De volgende versie
  trainen we zonder jouw foto's; we trainen minstens één keer per jaar opnieuw.
- Intrekken heeft geen gevolg voor je behandeling. Wat we vóór het intrekken deden, blijft rechtmatig.

## Vanaf 16 jaar

Deze toestemming kun je geven vanaf 16 jaar. Ben je jonger, dan vragen we haar niet en gebruiken we je foto's niet
voor de training.

## Je rechten

We gebruiken je foto's op basis van je **uitdrukkelijke toestemming** (artikel 9, lid 2, onder a, van de AVG), omdat
foto's van je huid gezondheidsgegevens kunnen zijn. Je mag je gegevens inzien, laten verbeteren of laten verwijderen,
het gebruik laten beperken en een kopie krijgen. Ben je het niet eens met hoe we met je gegevens omgaan, dan kun je
een klacht indienen bij de Autoriteit Persoonsgegevens.

De huidanalyse is een hulpmiddel en **geen medische diagnose**. Wil je weten wat je huid nodig heeft, plan dan de
gratis intake bij een van onze huidtherapeuten.

## Contact

Pure Clinics, Sint Annastraat 1, 6524 EA Nijmegen, en Kastanjeweg 1, 5401 GW Uden. KvK 64095096.
Vragen over je gegevens: **info@pureclinics.nl**.

---

## Formulier (kliniek)

Code (pseudoniem): ____________ Datum: ____________

- [ ] Ik ben 16 jaar of ouder.
- [ ] Ik heb de uitleg hierboven gelezen en kon mijn vragen stellen.
- [ ] **Ja**, Pure Clinics mag mijn gezichtsfoto's gebruiken om haar huidanalyse te trainen en te testen, zoals
      hierboven beschreven.
- [ ] **Ja, ook** mogen mijn gecodeerde uitsneden en beoordelingen in de gezamenlijke dataset van huidklinieken die met
      Huidly werken, alleen voor het trainen en testen van deze huidanalyse. *(los aan te vinken, niet verplicht)*

Naam: ______________________ Handtekening: ______________________

*Voor de kliniek:* zet de code, de datum en de twee antwoorden in het toestemmingsbestand (`person,training,pool,date,withdrawn`)
op de Mac van de kliniek. Bij intrekken: datum in `withdrawn` invullen; de volgende `prepare.py` laat de foto's weg en
de oude uitsneden worden verwijderd (README, "Intrekken").

## Tekst in de app

> **Help onze huidanalyse beter worden**
> Mogen we je scan gebruiken om onze huidanalyse te trainen? We bewaren alleen gecodeerde uitsneden van zones van je
> gezicht, zonder je naam en zonder gegevens uit de foto, in de EU of op de computer van de kliniek. Je kunt dit altijd
> weer uitzetten. Dit staat los van je advies en je behandeling. Vanaf 16 jaar.
>
> ( ) Gebruik mijn scan voor de training van Pure Clinics *(standaard uit)*
> ( ) Ook voor de gezamenlijke dataset van klinieken die met Huidly werken *(standaard uit, alleen te kiezen als de eerste aan staat)*
>
> [Meer over je gegevens] · Geen medische diagnose. Voor persoonlijk advies: de gratis intake.

---

## Kısa özet (Neslihan için)

- Bu metin, danışanlardan yüz fotoğraflarını **Pure'un kendi cilt analiz modelini eğitmek** için kullanma izni ister.
  Tedavi onayından **ayrı** bir izindir; "hayır" demek tedaviyi hiç etkilemez.
- İkinci, isteğe bağlı bir kutu var: Huidly kullanan diğer kliniklerle **ortak veri setine** katılma.
- Saklanan şey: yüz bölgelerinden kesilmiş, **kodlu (isimsiz)** parçalar ve terapistin 0–3 notları. Fotoğrafın tarih,
  konum gibi bilgileri silinir.
- Yer: kliniğin kendi bilgisayarı (şifreli disk) veya Huidly'nin **AB içindeki** sunucuları. AB dışına çıkmaz; işleyen
  sözleşmesi olmayan hiçbir platforma (EVREN dahil) gitmez.
- Süre: izin geri alınana kadar, en fazla fotoğraftan **5 yıl** sonra (bu süreyi sen onaylamalısın).
- Geri alma: info@pureclinics.nl, resepsiyon veya uygulamadaki düğme; 30 gün içinde veriler silinir.
- **16 yaş ve üstü.** Uygulama asla teşhis koymaz; metinde "geen medische diagnose" ve ücretsiz intake yazıyor.
- Kullanmadan önce bir gizlilik danışmanına göstermeni öneririm.
