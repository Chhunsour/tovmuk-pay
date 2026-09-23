import { TransferForm } from "@/components/transfer-form";

export default function SendPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Send KHR</h1>
      <p className="mt-1 text-sm text-muted">Enter the transfer details, then authorize the payment on ABA PayWay.</p>
      <div className="mt-6">
        <TransferForm />
      </div>
    </div>
  );
}
