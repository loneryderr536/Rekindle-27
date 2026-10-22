// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { CheckoutForm } from "@/components/CheckoutForm";
import { SeatMap } from "@/components/SeatMap";
import type { SeatView, TierView } from "@/server/seats/listSeats";

const tiers: TierView[] = [
  { id: "t-gold", name: "Gold", pricePaise: 150000, color: "#d4a017" },
  { id: "t-silver", name: "Silver", pricePaise: 80000, color: "#9ca3af" },
];

function seat(n: number, tierId = "t-gold", status: SeatView["status"] = "available"): SeatView {
  const section = tierId === "t-gold" ? "G" : "S";
  return { id: `${section}${n}`, label: `${section}-A-${n}`, section, row: "A", number: n, x: n * 30, y: 20, tierId, status };
}

/** SeatMap is controlled; this harness owns the selection like the page does. */
function Harness({ seats, onToggle }: { seats: SeatView[]; onToggle?: (id: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <SeatMap
      seats={seats}
      tiers={tiers}
      selected={selected}
      maxSelectable={6}
      onToggle={(id) => {
        onToggle?.(id);
        setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
      }}
    />
  );
}

test("clicking available seat selects it", async () => {
  render(<Harness seats={[seat(1)]} />);
  const btn = screen.getByRole("button", { name: "G-A-1, Gold, available" });
  expect(btn.getAttribute("aria-pressed")).toBe("false");
  await userEvent.click(btn);
  expect(btn.getAttribute("aria-pressed")).toBe("true");
});

test("sold seat is not clickable", async () => {
  const onToggle = vi.fn();
  render(<Harness seats={[seat(1, "t-gold", "sold")]} onToggle={onToggle} />);
  const btn = screen.getByRole("button", { name: "G-A-1, Gold, sold" });
  await userEvent.click(btn);
  btn.focus();
  await userEvent.keyboard("{Enter}");
  expect(onToggle).not.toHaveBeenCalled();
  expect(btn.getAttribute("aria-pressed")).toBe("false");
});

test("7th selection is blocked with message 'Maximum 6 seats per booking'", async () => {
  const onToggle = vi.fn();
  render(<Harness seats={[1, 2, 3, 4, 5, 6, 7].map((n) => seat(n))} onToggle={onToggle} />);
  for (let n = 1; n <= 6; n++) {
    await userEvent.click(screen.getByRole("button", { name: `G-A-${n}, Gold, available` }));
  }
  expect(screen.queryByText("Maximum 6 seats per booking")).toBeNull();
  const seventh = screen.getByRole("button", { name: "G-A-7, Gold, available" });
  await userEvent.click(seventh);
  expect(onToggle).toHaveBeenCalledTimes(6);
  expect(seventh.getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByText("Maximum 6 seats per booking")).toBeTruthy();
});

test("total shows ₹2,300.00 for one Gold + one Silver", () => {
  render(<CheckoutForm selected={[seat(1), seat(1, "t-silver")]} tiers={tiers} onSubmit={async () => {}} />);
  expect(screen.getByTestId("checkout-total").textContent).toBe("₹2,300.00");
});

test("adminMode: blocked seats are selectable, held and sold are not; public mode never selects blocked", async () => {
  const onToggle = vi.fn();
  const seats = [seat(1, "t-gold", "blocked"), seat(2, "t-gold", "held"), seat(3, "t-gold", "sold")];
  const { unmount } = render(
    <SeatMap seats={seats} tiers={tiers} selected={[]} maxSelectable={50} adminMode onToggle={onToggle} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "G-A-1, Gold, blocked" }));
  await userEvent.click(screen.getByRole("button", { name: "G-A-2, Gold, held" }));
  await userEvent.click(screen.getByRole("button", { name: "G-A-3, Gold, sold" }));
  expect(onToggle.mock.calls).toEqual([["G1"]]);
  unmount();
  const pub = vi.fn();
  render(<SeatMap seats={seats} tiers={tiers} selected={[]} maxSelectable={50} onToggle={pub} />);
  await userEvent.click(screen.getByRole("button", { name: "G-A-1, Gold, blocked" }));
  expect(pub).not.toHaveBeenCalled();
});
