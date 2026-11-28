import { ShopOrders } from '../../live/ShopOrders';

/**
 * The webshop on Pure's own site and app, as Huidly has it: the real orders to move along and the stock the shop sells
 * from (live/ShopOrders.tsx). Nothing here is made up: what the site and the app sold is what shows.
 */
export function Webshop() {
  return <ShopOrders />;
}
