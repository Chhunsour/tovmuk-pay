import { redirect } from "next/navigation";
import { TRAN_ID_PATTERN } from "@/lib/payway";

export const metadata = { title: "Track a transfer" };

export default async function TrackPage({ searchParams }: PageProps<"/track">) {
  const { id } = await searchParams;
  const tranId = typeof id === "string" ? id.trim().toUpperCase() : "";
  if (TRAN_ID_PATTERN.test(tranId)) redirect(`/transfer/${tranId}`);
  const invalid = tranId !== "";

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Track a transfer</h1>
      <p className="mt-1 text-sm text-muted">Enter the transaction ID shown when you confirmed the transfer.</p>
      <form action="/track" className="card mt-6 p-5 sm:p-6">
        <label htmlFor="id" className="block text-sm font-medium">
          Transaction ID
        </label>
        <input
          id="id"
          name="id"
          className="input mt-2 uppercase tabular-nums"
          placeholder="TP260925…"
          defaultValue={tranId}
          maxLength={40}
          autoComplete="off"
          required
          aria-invalid={invalid}
        />
        {invalid && <p className="mt-2 text-xs text-down">A transaction ID has up to 20 letters and digits.</p>}
        <button type="submit" className="btn btn-primary mt-5 w-full">
          Track
        </button>
      </form>
    </div>
  );
}
