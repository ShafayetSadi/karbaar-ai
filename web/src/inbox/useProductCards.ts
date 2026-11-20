import { useCallback, useState } from 'react';

/** Messenger shows at most 10 cards in one carousel; the API refuses more. */
export const MAX_CARDS = 10;

/** A product picked for the next reply, with what the tray shows of it. */
export interface PickedProduct {
  id: string;
  name: string;
  image: string | null;
  /** Its price as shown in the picker ("৳1,450", "from ৳950"); null without an active variant. */
  price: string | null;
}

export interface ProductCards {
  items: PickedProduct[];
  /** Product ids to send, in the order the customer gets the cards. */
  productIds: string[];
  full: boolean;
  add: (products: PickedProduct[]) => void;
  remove: (id: string) => void;
  /** Moves a card one place earlier (-1) or later (1). */
  move: (id: string, by: -1 | 1) => void;
  clear: () => void;
}

/**
 * The product cards chosen for the next reply (ADR 0038). Only ids are sent: the API builds each
 * card from the catalog when it goes, so the price and stock the customer sees are current.
 */
export function useProductCards(): ProductCards {
  const [items, setItems] = useState<PickedProduct[]>([]);

  const add = useCallback((products: PickedProduct[]) => {
    setItems((current) => {
      const have = new Set(current.map((p) => p.id));
      const added = products.filter((p) => !have.has(p.id));
      return [...current, ...added].slice(0, MAX_CARDS);
    });
  }, []);

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((p) => p.id !== id));
  }, []);

  const move = useCallback((id: string, by: -1 | 1) => {
    setItems((current) => {
      const from = current.findIndex((p) => p.id === id);
      const to = from + by;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to]!, next[from]!];
      return next;
    });
  }, []);

  const clear = useCallback(() => setItems([]), []);

  return {
    items,
    productIds: items.map((p) => p.id),
    full: items.length >= MAX_CARDS,
    add,
    remove,
    move,
    clear,
  };
}
