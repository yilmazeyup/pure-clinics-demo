# Huidscan contribution API: "deel deze scan om de analyse te verbeteren"

**Status: contract only. Nothing is built; the app sends no scan anywhere today.** This describes what a future,
opt-in "share this scan" in the app would send to Huidly (Pure's backend, huidly.com), and how clinics in the same
program can pool what their clients shared. The model pipeline it feeds is `ml/huidscan/` (README there).

## Ground rules

1. **Opt-in, twice.** A standing consent (TOESTEMMING.md, version-stamped) *and* a tap on "Deel deze scan" per scan.
   Both are off by default, neither is needed for the scan, the advice or booking. Only signed-in customers aged 16 or
   over; never in guest mode.
2. **Zone crops only.** The full photo, the face landmarks and anything from the photo file (EXIF, date, place,
   device) never leave the device. Only square crops of the seven zones are sent, cut exactly as
   `ml/huidscan/train/common.py` and `apps/mobile/src/scan/model.ts` cut them.
3. **Masked.** Square crops of the forehead and the under-eye zones show part of the eyes, and the chin crop part of
   the lips. Before a crop is shared, everything outside the zone's outline (plus a 10% margin) is filled with neutral
   grey `#808080`, so no eye, brow, nostril or lip is sent. A model trained on shared crops must be trained and run on
   masked crops too (`huidscan.json` then carries `"crop": {"mask": true, ...}`); the pipeline does not do masking yet.
4. **Pseudonymous.** The payload carries no name, e-mail or phone. Huidly knows the customer from the bearer token and
   stores the crops under a contributor code per business (`c_<random>`); the link from code to customer stays in that
   business's customer table.
5. **EU only.** Received, stored and processed in an EU region (for example Azure West Europe or Sweden Central),
   encrypted at rest, private storage without public URLs. The upload must not pass through a proxy or CDN that
   terminates TLS outside the EU or without a processor agreement (Huidly's current Cloudflare bridge for CORS
   preflights does not qualify for this path unless that is settled). **Never to EVREN** or any service without a
   processor agreement.
6. **No diagnosis.** Nothing in the payload or the answers names a condition. Concern names are the visible ones:
   `redness`, `pigmentation`, `fine_lines`, `under_eye_dark`, and boxes `inflamed_blemish`, `comedone`, `dark_spot`.
   App wording stays "zichtbare onzuiverheden, roodheid, pigmentvlekken, fijne lijntjes, vermoeide oogzone" with
   "geen medische diagnose" and the way to the free intake.
7. **Withdrawal removes the crops**, from the business's set and from the pool, within 30 days; models are retrained
   without them at the next round (at least yearly).

## Roles

- Each clinic is **controller** for its own clients' contributions; **Huidly is processor** under a processor
  agreement with each clinic.
- The **pool** (crops shared across clinics) is run by Huidly for the clinics that signed a pool agreement. Between
  those clinics this is joint controllership (art. 26 AVG): the agreement says who answers requests, how withdrawal
  propagates and who may train on the pool. Have it reviewed before the first clinic joins.

## Base, auth, errors

Same conventions as Huidly's customer API (`docs/customer-api.md` in the huidly repository): base
`https://huidly.com/api/klant/{zaak}` (Pure: `pure`), JSON, `Authorization: Bearer <token>`, errors
`{ "error": "<code>" }`. All calls below need the customer's token (🔒).

## Consent

### `GET /huidscan/consent` 🔒
```json
{ "training": true, "pool": false, "textVersion": "toestemming-v1", "givenAt": "2026-12-01T10:12:00+01:00",
  "withdrawnAt": null, "channel": "app" }
```
`training: false` and `givenAt: null` when never given.

### `PUT /huidscan/consent` 🔒
```json
{ "training": true, "pool": false, "textVersion": "toestemming-v1", "ageConfirmed16": true, "locale": "nl" }
```
Stores a consent record: business, contributor code, both answers, `textVersion` with a hash of that exact text, time,
channel (`app` / `kliniek`). `pool: true` requires `training: true`. Setting `training: false` withdraws: it stamps
`withdrawnAt`, stops new contributions at once and starts the deletion job (below). Answers the new state.
Errors: `400 age-not-confirmed`, `400 text-version-unknown`, `400 pool-needs-training`.

Consent given on the paper form in the clinic is entered by staff in the Huidly program (channel `kliniek`) and shows
here too.

## Contributions

### `POST /huidscan/contributions` 🔒
One shared scan.
```json
{
  "scanId": "6f0c2a8e-1d7b-4c55-9a0e-2b1f3d9c7e41",
  "consentVersion": "toestemming-v1",
  "capturedOn": "2026-12-01",
  "view": "front",
  "light": 61.8,
  "modelVersion": "pure-v1-zones-2027-03-01",
  "selfReport": { "concerns": ["redness", "pigment"], "skin": "combination" },
  "zones": [
    {
      "zone": "cheekL",
      "crop": "<base64 JPEG, 256 x 256, quality 90, masked>",
      "colour": { "redness": 0.42, "tone": 0.10, "blemish": 0.05 },
      "model": { "redness": 0.61, "pigmentation": 0.20 }
    }
  ]
}
```
- `scanId`: random UUID made on the device; a repeat is answered `409 duplicate` so a retry is safe.
- `capturedOn`: the day only. `view`: `front` / `left` / `right`. `light`: the scan's median L* (quality check).
- `zones`: 1 to 7 of `forehead cheekL cheekR nose chin underEyeL underEyeR` (L/R: left/right in the image).
  `crop` is a 256 × 256 JPEG, at most 60 KB; the whole body at most 512 KB.
- `colour`: the on-device colour measures for that zone (0–1). `model`: the model's reading, when a model ran
  (`modelVersion` set), else omitted. These are machine readings, never labels: therapists grade the crops later.
- `selfReport`: the answers from the advice questions, optional.
- No pool flag here: the server takes it from the consent record at the moment of upload.

Server side: decode, check size and type, **re-encode** every crop (drops anything hidden in the file), store under
the contributor code with business, consent version, pool flag and `capturedOn`.
Answer `201 { "contributionId": "k_…", "zones": 7 }`.
Errors: `401 signin-needed`, `403 consent-missing` (no active consent, or another `consentVersion`),
`409 duplicate`, `413 too-large`, `422 crop-invalid`, `429 too-many` (more than 5 per day per customer).

### `GET /huidscan/contributions` 🔒
What this customer shared (for inzage): `{ "contributions": [{ "id", "capturedOn", "view", "zones": 7, "pool": false }] }`.
Optional `?withCrops=1` adds the crops.

### `DELETE /huidscan/contributions/{id}` 🔒 and `DELETE /huidscan/contributions` 🔒
Deletes one or all, at once from the business's set and from the pool. `200 { "deleted": 3 }`.

## In the Huidly program (staff)

- **Labelling queue** (Kliniek module, admins and therapists): shared crops graded 0–3 per concern on the same scale and
  with the same words as `ml/huidscan/label/index.html`, boxes for the three classes, Monk tone, quality. Two
  therapists on an overlap set; agreement as in `label/kappa.py`.
- **Export for training** (admin role, logged): `GET /api/zaak/{zaak}/huidscan/export?since=YYYY-MM-DD` gives a zip in
  the layout `prepare.py` writes, so `train_zones.py` trains on it directly:
  `crops/<code>_<id>_<zone>.png`, `zones.csv` (`crop,image,person,view,monk,monk_group,zone,visible,split,redness,
  pigmentation,fine_lines,under_eye_dark`, split left empty), `prepare.json`, and boxes as COCO. `person` is the
  contributor code. Downloaded only to the clinic's own machine or an EU training machine under the processor
  agreement.
- **Pool export** (Huidly only, for clinics in the pool agreement): the same layout, only contributions with
  `pool: true` whose consent is still active, `person` re-coded per pool (keyed hash with a pool secret) so no clinic
  can link another clinic's clients, plus a `business` column.

## Withdrawal and retention

- `training: false`, a `DELETE`, or staff entering a withdrawal: crops and their labels are deleted from the
  business's set and the pool within 30 days (target: at once); the customer gets a confirmation e-mail.
- Every export carries a manifest of contribution ids. The next training run must use a fresh export; runs keep only
  the manifest, and crops are not copied into model files.
- A deletion log keeps ids and dates only, as proof.
- Crops are deleted automatically 5 years after `capturedOn` (the period in TOESTEMMING.md; the owner confirms it).

## In the app (later)

- A quiet card under the scan result, only for signed-in customers: "Help onze huidanalyse beter worden", with the two
  switches from TOESTEMMING.md (off) and a link to the full text. The age check is a checkbox, no birth date.
- With consent on, a secondary button under each new result: "Deel deze scan" → a short sheet showing the masked
  crops that would be sent → "Delen" / "Niet nu". Nothing is sent without that tap.
- "Mijn gegevens": see what was shared, delete one or all, switch consent off.
