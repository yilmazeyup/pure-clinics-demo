# What Pure's website reads from Huidly: campaigns, gift cards, products

Pure's team keeps its campaigns in Huidly (the program, Campagnes). The website (`site/website/`) shows them on its own;
nothing is typed into the site. The site starts with its own copy (`site/website/data/acties.json`) so a page never
waits, then takes Huidly's answer and redraws. If Huidly does not answer, the copy stays.

Base: `https://huidly.com/api/klant/pure` (no token, CORS open). Texts are objects with `nl en es fr de it ar`; Dutch
is always filled.

## `GET /campaigns` (to be added on Huidly's side)

```json
{ "campaigns": [
  { "id": "kerst-2026",
    "name": { "nl": "Stralende kerst" },
    "from": "2026-12-02T00:00:00+01:00",
    "until": "2026-12-31T23:59:59+01:00",
    "image": "https://…/kerst.webp",
    "deals": [
      { "treatment": "prx", "text": { "nl": "PRX: van €125 voor €85" } },
      { "product": "zo-cleanser", "text": { "nl": "Gentle Cleanser: van €42 voor €36" } }
    ] }
] }
```

- `from` / `until`: ISO with offset; the site hides a campaign outside them (Europe/Amsterdam). `from` may be left out.
- A deal names a `treatment` id or a `product` id (the ids in Huidly's `/catalog` and `/products`) and one line of text.
  - On a treatment page the line shows under the title.
  - On the shop tile and product page it shows with the campaign's name as a badge.
  - On Prijzen every running campaign shows as a card with its deals; the first running campaign is a chip in the
    home page's photo.
- `image` (https) is optional.
- An empty list means no campaigns: the site then shows none (Huidly is the truth once it answers).

## `GET /gift-cards` (exists)

The gift card page, the cart and the note that opens on the site use it. A card whose `value` is above its `price` is
the offer: "Bij aankoop van een cadeaubon t.w.v. {price} ontvang je {value − price} cadeau van ons."

## `GET /products` (exists)

- The shop marks `available: false` as sold out.
- It takes `price` from here.
- It shows `image` (https) instead of its own still life when one is given.
