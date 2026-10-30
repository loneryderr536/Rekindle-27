"use client";

import { useRouter } from "next/navigation";
import { saveHoldToken } from "@/lib/activeHold";

/** Resumes an unpaid hold: the seats page picks the saved hold token up and shows the payment step. */
export function FinishPayingButton({ accessToken }: { accessToken: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-primary"
      onClick={() => {
        saveHoldToken(accessToken);
        router.push("/register/seats");
      }}
    >
      Finish paying
    </button>
  );
}
