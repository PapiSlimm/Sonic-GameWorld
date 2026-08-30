import { CartView } from '../../src/components/cart/CartView.js';

export default function CartPage() {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-8">
      <div>
        <p className="font-hud text-xs uppercase tracking-[0.3em] text-accent">Cart</p>
        <h1 className="mt-1 text-2xl font-semibold text-text">Your cart</h1>
      </div>
      <CartView />
    </div>
  );
}
