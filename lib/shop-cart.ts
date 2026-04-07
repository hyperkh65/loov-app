'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: number;
  name: string;
  price: number;
  thumbnail_url: string | null;
  option_name?: string;
  qty: number;
}

interface CartStore {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'qty'>, qty?: number) => void;
  removeItem: (id: number, option_name?: string) => void;
  updateQty: (id: number, option_name: string | undefined, qty: number) => void;
  clear: () => void;
  totalCount: () => number;
  totalPrice: () => number;
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem(item, qty = 1) {
        set(s => {
          const idx = s.items.findIndex(i => i.id === item.id && i.option_name === item.option_name);
          if (idx >= 0) {
            const items = [...s.items];
            items[idx] = { ...items[idx], qty: items[idx].qty + qty };
            return { items };
          }
          return { items: [...s.items, { ...item, qty }] };
        });
      },
      removeItem(id, option_name) {
        set(s => ({ items: s.items.filter(i => !(i.id === id && i.option_name === option_name)) }));
      },
      updateQty(id, option_name, qty) {
        if (qty <= 0) { get().removeItem(id, option_name); return; }
        set(s => ({
          items: s.items.map(i => i.id === id && i.option_name === option_name ? { ...i, qty } : i),
        }));
      },
      clear() { set({ items: [] }); },
      totalCount() { return get().items.reduce((a, i) => a + i.qty, 0); },
      totalPrice() { return get().items.reduce((a, i) => a + i.price * i.qty, 0); },
    }),
    { name: 'loov-shop-cart' }
  )
);
