import {
  addDays,
  PRODUCTS,
  sameDay,
  SHIPPING_FEE,
  startOfDay,
  type ProductId,
} from "@pure-clinics/shared";
import {
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";

import { useI18n } from "../../../i18n";
import { usePraktijk, useShared } from "../../context";
import {
  laterStatus,
  STATUSES,
  webOrders,
  type Channel,
  type OrderStatus,
  type WebOrder,
} from "../../data/webshop";
import { PkIcon } from "../../icons";
import {
  Card,
  Chip,
  Empty,
  Seg,
  Stat,
  TableWrap,
  useMoney,
  type Tone,
} from "../../kit";
import { cityOf, useProductName, useStock } from "./common";
import { Section, SidePanel } from "./Panel";
import { useTabInView } from "../useTabInView";

// The webshop on Pure's own site and in the app: its orders and how far each one is, what it sold online, and what a
// customer sees of the stock on the site and in the app. The stock itself is the clinics' (an order goes out of the
// clinic nearest to the customer), so the part below, Voorraad & inkoop, stays the one place for stock and suppliers.

type WebTab = "orders" | "sales" | "shop";

const TONE: Record<OrderStatus, Tone> = {
  new: "warn",
  packed: "brand",
  shipped: "now",
  delivered: "good",
};

/** The orders of the last 60 days, with what was done by hand (packed, sent) laid over what the clock says. */
function useWebOrders() {
  const { now } = usePraktijk();
  const minute = Math.floor(now.getTime() / 60000);
  const base = useMemo(() => webOrders(now, 60), [minute]);
  const [manual, setManual] = useShared<
    Record<string, { status: OrderStatus; at: Date }>
  >("webOrderStatus", () => ({}));
  const orders = useMemo(
    () =>
      base.map((o) => {
        const m = manual[o.id];
        const status = laterStatus(o.status, m?.status);
        if (status === o.status) return o;
        return {
          ...o,
          status,
          packed: o.packed ?? m!.at,
          shipped: status === "shipped" ? (o.shipped ?? m!.at) : o.shipped,
        };
      }),
    [base, manual],
  );
  const set = (ids: string[], status: OrderStatus) =>
    setManual((all) => ({
      ...all,
      ...Object.fromEntries(
        ids.map((id) => [id, { status, at: new Date(now) }]),
      ),
    }));
  return { orders, set };
}

/** "ZO Skin Health Smart Tone SPF 50 +2": the first product of an order and how many more items come with it. */
function useOrderLine() {
  const name = useProductName();
  return (o: WebOrder) => {
    const items = o.lines.reduce((n, l) => n + l.qty, 0);
    return `${name(o.lines[0].product.id)}${items > 1 ? ` +${items - 1}` : ""}`;
  };
}

export function Webshop() {
  const { t } = useI18n();
  const { now } = usePraktijk();
  const money = useMoney();
  const { orders, set } = useWebOrders();
  const [tab, setTab] = useState<WebTab>("orders");
  useTabInView(tab);

  const today = orders.filter((o) => sameDay(o.at, now));
  const count = (s: OrderStatus) => orders.filter((o) => o.status === s).length;

  return (
    <>
      <div className="pk-stats">
        <Stat
          label={t("pk.voorraad.web.statToday")}
          value={money(today.reduce((s, o) => s + o.total, 0))}
          sub={t("pk.voorraad.web.statTodaySub", { n: today.length })}
        />
        <Stat
          label={t("pk.voorraad.web.statNew")}
          value={count("new")}
          sub={t("pk.voorraad.web.statNewSub")}
          tone={count("new") ? "bad" : "good"}
        />
        <Stat
          label={t("pk.voorraad.web.statPacked")}
          value={count("packed")}
          sub={t("pk.voorraad.web.statPackedSub")}
        />
        <Stat
          label={t("pk.voorraad.web.statShipped")}
          value={count("shipped")}
          sub={t("pk.voorraad.web.statShippedSub")}
        />
      </div>

      <Seg
        variant="tabs"
        label={t("pk.voorraad.web.tabs")}
        value={tab}
        onChange={setTab}
        options={[
          {
            value: "orders",
            label: count("new")
              ? `${t("pk.voorraad.web.tab.orders")} · ${count("new")}`
              : t("pk.voorraad.web.tab.orders"),
            icon: "inbox",
          },
          {
            value: "sales",
            label: t("pk.voorraad.web.tab.sales"),
            icon: "chart",
          },
          { value: "shop", label: t("pk.voorraad.web.tab.shop"), icon: "eye" },
        ]}
      />

      {tab === "orders" ? (
        <OrderList orders={orders} set={set} />
      ) : tab === "sales" ? (
        <OnlineSales orders={orders} />
      ) : (
        <OnShop />
      )}
    </>
  );
}

/* ---------- Orders ---------- */

function OrderList({
  orders,
  set,
}: {
  orders: WebOrder[];
  set: (ids: string[], status: OrderStatus) => void;
}) {
  const { t, clock, dayMonth } = useI18n();
  const { now, demo } = usePraktijk();
  const money = useMoney();
  const line = useOrderLine();
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(25);
  const [open, setOpen] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const list = orders.filter(
    (o) =>
      (status === "all" || o.status === status) &&
      (channel === "all" || o.channel === channel) &&
      (!q ||
        o.customer.toLowerCase().includes(q) ||
        o.city.toLowerCase().includes(q) ||
        String(o.number).includes(q)),
  );
  const fresh = orders.filter((o) => o.status === "new");
  const current = orders.find((o) => o.id === open) ?? null;

  const pack = (o: WebOrder, event?: MouseEvent) => {
    event?.stopPropagation();
    set([o.id], "packed");
    demo(t("pk.voorraad.web.packed", { number: o.number }));
  };
  const ship = (o: WebOrder, event?: MouseEvent) => {
    event?.stopPropagation();
    set([o.id], "shipped");
    demo(t("pk.voorraad.web.shipped", { number: o.number }));
  };
  const action = (o: WebOrder) =>
    o.status === "new" ? (
      <button className="btn btn-primary btn-small" onClick={(e) => pack(o, e)}>
        <PkIcon name="box" size={14} />
        {t("pk.voorraad.web.pack")}
      </button>
    ) : o.status === "packed" ? (
      <button className="btn btn-ghost btn-small" onClick={(e) => ship(o, e)}>
        <PkIcon name="truck" size={14} />
        {t("pk.voorraad.web.ship")}
      </button>
    ) : null;

  return (
    <Card
      eyebrow={t("pk.voorraad.web.orders.eyebrow")}
      title={t("pk.voorraad.web.orders.title")}
      help={t("pk.voorraad.web.orders.help")}
      feature="web.orders"
      actions={
        fresh.length ? (
          <button
            className="btn btn-primary btn-small"
            onClick={() => {
              set(
                fresh.map((o) => o.id),
                "packed",
              );
              demo(t("pk.voorraad.web.packedAll", { n: fresh.length }));
            }}
          >
            <PkIcon name="box" size={14} />
            {t("pk.voorraad.web.packAll", { n: fresh.length })}
          </button>
        ) : null
      }
    >
      <div className="pk-web-filters">
        <Seg
          label={t("pk.voorraad.web.col.status")}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setShown(25);
          }}
          options={[
            { value: "all", label: t("pk.voorraad.web.all") },
            ...STATUSES.map((s) => ({
              value: s,
              label: `${t(`pk.voorraad.web.status.${s}`)} · ${orders.filter((o) => o.status === s).length}`,
            })),
          ]}
        />
        <div className="pk-web-filters-row">
          <Seg
            label={t("pk.voorraad.web.col.channel")}
            value={channel}
            onChange={setChannel}
            options={[
              { value: "all", label: t("pk.voorraad.web.all") },
              { value: "site", label: t("pk.voorraad.web.channel.site") },
              { value: "app", label: t("pk.voorraad.web.channel.app") },
            ]}
          />
          <label className="pk-web-search">
            <PkIcon name="search" size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("pk.voorraad.web.search")}
              aria-label={t("pk.voorraad.web.search")}
            />
          </label>
        </div>
      </div>

      {list.length ? (
        <TableWrap label={t("pk.voorraad.web.orders.eyebrow")}>
          <table className="pk-table pk-cards pk-web-orders">
            <thead>
              <tr>
                <th>{t("pk.voorraad.web.col.order")}</th>
                <th>{t("pk.voorraad.web.col.customer")}</th>
                <th>{t("pk.voorraad.web.col.products")}</th>
                <th>{t("pk.voorraad.web.col.channel")}</th>
                <th>{t("pk.voorraad.web.col.from")}</th>
                <th className="end">{t("pk.voorraad.web.col.total")}</th>
                <th>{t("pk.voorraad.web.col.status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.slice(0, shown).map((o) => (
                <tr
                  key={o.id}
                  className={`pk-web-row ${o.status === "new" ? "is-new" : ""}`}
                  onClick={() => setOpen(o.id)}
                >
                  <td className="nowrap pk-cell-inline">
                    <span className="pk-mono">#{o.number}</span> ·{" "}
                    {sameDay(o.at, now)
                      ? clock(o.at)
                      : `${dayMonth(o.at, now)} ${clock(o.at)}`}
                  </td>
                  <td className="pk-cell-main">
                    <strong>{o.customer}</strong>
                    <small className="pk-muted"> · {o.city}</small>
                  </td>
                  <td className="pk-web-products pk-cell-inline">{line(o)}</td>
                  <td className="pk-cell-inline">
                    <Chip
                      tone="outline"
                      icon={o.channel === "app" ? "phone" : "link"}
                    >
                      {t(`pk.voorraad.web.channel.${o.channel}`)}
                    </Chip>
                  </td>
                  <td className="pk-cell-inline">{cityOf(o.clinic)}</td>
                  <td className="end pk-num pk-cell-side">{money(o.total)}</td>
                  <td className="pk-cell-inline">
                    <Chip tone={TONE[o.status]}>
                      {t(`pk.voorraad.web.status.${o.status}`)}
                    </Chip>
                  </td>
                  <td className="end pk-cell-full">{action(o)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <Empty>{t("pk.voorraad.web.none")}</Empty>
      )}
      {list.length > shown ? (
        <div className="pk-st-more">
          <button
            className="btn btn-ghost btn-small"
            onClick={() => setShown((n) => n + 50)}
          >
            {t("pk.voorraad.web.more", { n: list.length - shown })}
          </button>
        </div>
      ) : null}

      <SidePanel
        open={current !== null}
        onClose={() => setOpen(null)}
        label={current ? `#${current.number}` : ""}
      >
        {current ? (
          <OrderView order={current} action={action(current)} />
        ) : null}
      </SidePanel>
    </Card>
  );
}

function OrderView({
  order: o,
  action,
}: {
  order: WebOrder;
  action: ReactNode;
}) {
  const { t, clock, dayMonth } = useI18n();
  const { now } = usePraktijk();
  const money = useMoney();
  const name = useProductName();
  const when = (d: Date | null) =>
    d ? `${dayMonth(d, now)} · ${clock(d)}` : "";
  const steps: {
    key: OrderStatus;
    label: string;
    at: Date | null;
    detail?: string;
  }[] = [
    {
      key: "new",
      label: t("pk.voorraad.web.panel.placed", {
        channel: t(`pk.voorraad.web.channel.${o.channel}`),
      }),
      at: o.at,
    },
    {
      key: "packed",
      label: t("pk.voorraad.web.panel.packedAt", { city: cityOf(o.clinic) }),
      at: o.packed,
    },
    {
      key: "shipped",
      label: t("pk.voorraad.web.panel.shippedAt"),
      at: o.shipped,
      detail: o.shipped
        ? `${t("pk.voorraad.web.panel.track")}: ${o.track}`
        : undefined,
    },
    {
      key: "delivered",
      label: t("pk.voorraad.web.panel.deliveredAt", { city: o.city }),
      at: o.delivered,
    },
  ];
  const reached = STATUSES.indexOf(o.status);
  return (
    <>
      <div className="pk-dt-body">
        <header className="pk-dt-head">
          <span className="eyebrow">
            {t("pk.voorraad.web.col.order")} #{o.number}
          </span>
          <h2>{o.customer}</h2>
          <p className="pk-dt-sub">
            {o.city} · {when(o.at)} ·{" "}
            {t(`pk.voorraad.web.channel.${o.channel}`)}
          </p>
          <div className="pk-dt-chips">
            <Chip tone={TONE[o.status]}>
              {t(`pk.voorraad.web.status.${o.status}`)}
            </Chip>
            <Chip tone="outline">
              {t("pk.voorraad.web.panel.from", { city: cityOf(o.clinic) })}
            </Chip>
          </div>
        </header>

        <Section title={t("pk.voorraad.web.panel.lines")}>
          <ul className="pk-web-lines">
            {o.lines.map((l) => (
              <li key={l.product.id}>
                <span>
                  {l.qty} × {name(l.product.id)}
                </span>
                <span className="pk-num">{money(l.product.price * l.qty)}</span>
              </li>
            ))}
            <li className="pk-muted">
              <span>{t("pk.voorraad.web.panel.shipping")}</span>
              <span className="pk-num">{money(SHIPPING_FEE)}</span>
            </li>
            <li className="pk-web-total">
              <span>{t("pk.voorraad.web.panel.total")}</span>
              <span className="pk-num">{money(o.total)}</span>
            </li>
          </ul>
          {o.afterTreatment ? (
            <p className="pk-muted pk-web-after">
              {t("pk.voorraad.web.panel.after", {
                treatment: o.afterTreatment,
              })}
            </p>
          ) : null}
        </Section>

        <Section title={t("pk.voorraad.web.panel.route")}>
          <ol className="pk-web-steps">
            {steps.map((s, i) => (
              <li key={s.key} className={i <= reached ? "is-done" : ""}>
                <i aria-hidden="true" />
                <span>
                  <strong>{s.label}</strong>
                  {i <= reached && s.at ? (
                    <small className="pk-muted">{when(s.at)}</small>
                  ) : null}
                  {i <= reached && s.detail ? (
                    <small className="pk-mono pk-muted">{s.detail}</small>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
      {action ? <div className="pk-dt-foot">{action}</div> : null}
    </>
  );
}

/* ---------- Online sales ---------- */

function OnlineSales({ orders }: { orders: WebOrder[] }) {
  const { t, pct, dayMonth } = useI18n();
  const { now } = usePraktijk();
  const money = useMoney();
  const name = useProductName();
  const start = addDays(startOfDay(now), -29).getTime();
  const before = addDays(startOfDay(now), -59).getTime();
  const last = orders.filter((o) => o.at.getTime() >= start);
  const prev = orders.filter(
    (o) => o.at.getTime() >= before && o.at.getTime() < start,
  );
  const sum = (list: WebOrder[]) => list.reduce((s, o) => s + o.total, 0);
  const revenue = sum(last);
  const change = sum(prev) ? revenue / sum(prev) - 1 : null;
  const app = sum(last.filter((o) => o.channel === "app"));
  const after = last.filter((o) => o.afterTreatment).length;

  const days = Array.from({ length: 30 }, (_, i) => {
    const day = addDays(startOfDay(now), i - 29);
    const own = last.filter((o) => sameDay(o.at, day));
    return {
      day,
      app: sum(own.filter((o) => o.channel === "app")),
      site: sum(own.filter((o) => o.channel === "site")),
    };
  });
  const max = Math.max(1, ...days.map((d) => d.app + d.site));

  const units = new Map<ProductId, { n: number; amount: number }>();
  for (const o of last)
    for (const l of o.lines) {
      const u = units.get(l.product.id) ?? { n: 0, amount: 0 };
      units.set(l.product.id, {
        n: u.n + l.qty,
        amount: u.amount + l.qty * l.product.price,
      });
    }
  const best = [...units.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5);
  const top = best[0]?.[1].n ?? 1;

  return (
    <Card
      eyebrow={t("pk.voorraad.web.sales.eyebrow")}
      title={t("pk.voorraad.web.sales.title")}
      help={t("pk.voorraad.web.sales.help")}
      feature="web.sales"
    >
      <div className="pk-stats pk-web-sales-stats">
        <Stat
          label={t("pk.voorraad.web.sales.revenue")}
          value={money(revenue)}
          sub={
            change === null
              ? undefined
              : t("pk.voorraad.web.sales.revenueSub", {
                  change: `${change >= 0 ? "+" : "−"}${pct(Math.abs(change))}`,
                })
          }
        />
        <Stat
          label={t("pk.voorraad.web.sales.orders")}
          value={last.length}
          sub={t("pk.voorraad.web.sales.after", {
            pct: pct(last.length ? after / last.length : 0),
          })}
        />
        <Stat
          label={t("pk.voorraad.web.sales.basket")}
          value={money(last.length ? revenue / last.length : 0)}
        />
        <Stat
          label={t("pk.voorraad.web.sales.app")}
          value={pct(revenue ? app / revenue : 0)}
          sub={t("pk.voorraad.web.sales.appSub")}
        />
      </div>

      <div
        className="pk-web-chart"
        role="img"
        aria-label={t("pk.voorraad.web.sales.help")}
      >
        {days.map((d, i) => (
          <span
            key={i}
            className="pk-web-bar"
            title={`${dayMonth(d.day, now)} · ${money(d.app + d.site)}`}
          >
            <i
              className="is-site"
              style={{ "--h": `${(d.site / max) * 100}%` } as CSSProperties}
            />
            <i
              className="is-app"
              style={{ "--h": `${(d.app / max) * 100}%` } as CSSProperties}
            />
            {i % 7 === 1 ? (
              <small>{dayMonth(d.day, now)}</small>
            ) : null}
          </span>
        ))}
      </div>
      <p className="pk-web-legend">
        <span>
          <i className="is-app" /> {t("pk.voorraad.web.channel.app")}
        </span>
        <span>
          <i className="is-site" /> {t("pk.voorraad.web.channel.site")}
        </span>
      </p>

      <h3 className="pk-web-sub">{t("pk.voorraad.web.sales.best")}</h3>
      <ol className="pk-web-best">
        {best.map(([id, u]) => (
          <li key={id}>
            <span className="pk-web-best-name">{name(id)}</span>
            <span className="pk-web-best-bar">
              <i style={{ width: `${(u.n / top) * 100}%` }} />
            </span>
            <span className="pk-num">
              {t("pk.voorraad.web.sales.units", { n: u.n })}
            </span>
            <span className="pk-num pk-muted">{money(u.amount)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ---------- On the site and in the app ---------- */

function OnShop() {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const money = useMoney();
  const name = useProductName();
  const { stock, info } = useStock();
  const [hidden, setHidden] = useShared<ProductId[]>("webHidden", () => []);
  const [low, setLow] = useShared<number>("webLowFrom", () => 5);

  return (
    <Card
      eyebrow={t("pk.voorraad.web.shop.eyebrow")}
      title={t("pk.voorraad.web.shop.title")}
      help={t("pk.voorraad.web.shop.help")}
      feature="web.shop"
      actions={
        <label className="pk-web-low">
          {t("pk.voorraad.web.shop.low")}
          <input
            type="number"
            min={1}
            max={20}
            value={low}
            onChange={(e) =>
              setLow(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
            }
          />
          {t("pk.voorraad.web.shop.lowUnit")}
        </label>
      }
    >
      <TableWrap label={t("pk.voorraad.web.shop.title").replace(/\*/g, "")}>
        <table className="pk-table pk-cards">
          <thead>
            <tr>
              <th>{t("pk.voorraad.levels.product")}</th>
              <th className="end">{t("pk.voorraad.web.shop.col.price")}</th>
              <th className="end">{t("pk.voorraad.web.shop.col.stock")}</th>
              <th>{t("pk.voorraad.web.shop.col.shows")}</th>
              <th className="end">{t("pk.voorraad.web.shop.col.online")}</th>
            </tr>
          </thead>
          <tbody>
            {PRODUCTS.filter((p) => !info[p.id].deleted).map((p) => {
              const n = p.soldOut ? 0 : stock.nijmegen[p.id] + stock.uden[p.id];
              const off = hidden.includes(p.id);
              const shows = off
                ? {
                    tone: "outline" as Tone,
                    text: t("pk.voorraad.web.shop.hidden"),
                  }
                : n <= 0
                  ? { tone: "bad" as Tone, text: t("pk.voorraad.web.shop.out") }
                  : n <= low
                    ? {
                        tone: "warn" as Tone,
                        text: t("pk.voorraad.web.shop.few", { n }),
                      }
                    : {
                        tone: "good" as Tone,
                        text: t("pk.voorraad.web.shop.inStock"),
                      };
              return (
                <tr key={p.id} className={off ? "pk-web-off" : ""}>
                  <td className="pk-cell-main">{name(p.id)}</td>
                  <td className="end pk-num pk-cell-inline">
                    {money(info[p.id].price)}
                  </td>
                  <td className="end pk-num pk-cell-side">{n}</td>
                  <td className="pk-cell-inline">
                    <Chip tone={shows.tone}>{shows.text}</Chip>
                  </td>
                  <td className="end pk-cell-inline">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!off}
                      aria-label={`${t("pk.voorraad.web.shop.col.online")} · ${name(p.id)}`}
                      className="pk-switch"
                      onClick={() => {
                        setHidden((list) =>
                          off
                            ? list.filter((x) => x !== p.id)
                            : [...list, p.id],
                        );
                        demo(
                          t(
                            off
                              ? "pk.voorraad.web.shop.on"
                              : "pk.voorraad.web.shop.off",
                            { product: name(p.id) },
                          ),
                        );
                      }}
                    >
                      <i />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}
