"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatInr } from "@/lib/money";
import type { TierView } from "@/server/seats/listSeats";

const RUPEES = /^\d{1,7}(\.\d{1,2})?$/;
const toPaise = (rupees: string): number | null => (RUPEES.test(rupees.trim()) ? Math.round(parseFloat(rupees) * 100) : null);

async function send(method: "POST" | "PATCH", body: unknown): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/tiers", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return j?.error?.message ?? "Request failed.";
  } catch {
    return "Network problem. Please try again.";
  }
}

function TierRow({ tier }: { tier: TierView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tier.name);
  const [rupees, setRupees] = useState(String(tier.pricePaise / 100));
  const [color, setColor] = useState(tier.color);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const pricePaise = toPaise(rupees);
    if (pricePaise === null || pricePaise < 100) return setErr("Enter a price of at least ₹1 (up to 2 decimals).");
    setBusy(true);
    const msg = await send("PATCH", { id: tier.id, name, pricePaise, color });
    setBusy(false);
    setErr(msg);
    if (!msg) {
      setEditing(false);
      router.refresh();
    }
  }

  if (!editing) {
    return (
      <tr className="border-b border-line last:border-0">
        <td className="p-3 font-semibold">{tier.name}</td>
        <td className="p-3 tabular-nums">{formatInr(tier.pricePaise)}</td>
        <td className="p-3"><span className="inline-block size-5 rounded-full border border-line align-middle" style={{ background: tier.color }} /> <span className="font-mono text-xs">{tier.color}</span></td>
        <td className="p-3 text-right"><button type="button" className="btn-ghost !px-4 !py-1.5" onClick={() => setEditing(true)}>Edit</button></td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-line last:border-0">
      <td colSpan={4} className="p-3">
        <form onSubmit={save} className="flex flex-wrap items-end gap-3">
          <label className="field"><span>Name</span><input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>Price (₹)</span><input required inputMode="decimal" value={rupees} onChange={(e) => setRupees(e.target.value)} /></label>
          <label className="field"><span>Colour</span><input required type="color" value={color} onChange={(e) => setColor(e.target.value)} className="!h-11 !p-1" /></label>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
          <button type="button" className="btn-ghost" onClick={() => { setEditing(false); setErr(null); }}>Cancel</button>
          {err && <p role="alert" className="w-full text-sm text-danger">{err}</p>}
        </form>
      </td>
    </tr>
  );
}

export function TiersAdmin({ tiers }: { tiers: TierView[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [rupees, setRupees] = useState("");
  const [color, setColor] = useState("#d4a017");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    const pricePaise = toPaise(rupees);
    if (pricePaise === null || pricePaise < 100) return setErr("Enter a price of at least ₹1 (up to 2 decimals).");
    setBusy(true);
    const msg = await send("POST", { name, pricePaise, color });
    setBusy(false);
    setErr(msg);
    if (!msg) {
      setName(""); setRupees("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">A price change applies to new holds only. Guests already checking out pay the price they were shown.</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted">
            <tr><th className="p-3">Tier</th><th className="p-3">Price</th><th className="p-3">Colour</th><th className="p-3" /></tr>
          </thead>
          <tbody>{tiers.map((t) => <TierRow key={t.id} tier={t} />)}</tbody>
        </table>
      </div>
      <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4">
        <h2 className="w-full font-display text-xl font-bold text-plum">New tier</h2>
        <label className="field"><span>Name</span><input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field"><span>Price (₹)</span><input required inputMode="decimal" value={rupees} onChange={(e) => setRupees(e.target.value)} /></label>
        <label className="field"><span>Colour</span><input required type="color" value={color} onChange={(e) => setColor(e.target.value)} className="!h-11 !p-1" /></label>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Adding..." : "Add tier"}</button>
        {err && <p role="alert" className="w-full text-sm text-danger">{err}</p>}
      </form>
    </div>
  );
}
