"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function BuyNoteButton({ noteId, price, itemType = "note" }) {
  const [loading, setLoading] = useState(false);
  const { data: session, update } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const handlePayment = async () => {
    if (!session) {
      toast({
        title: "Login Required",
        description: "Please log in to purchase.",
        variant: "destructive",
      });
      router.push("/login");
      return;
    }

    setLoading(true);

    try {
      // 1. Load SDK
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error("Razorpay SDK failed to load.");

      // 2. Create order via edge API route
      const orderRes = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: noteId, itemType }),
      });
      const orderData = await orderRes.json();
      if (!orderData.success)
        throw new Error(orderData.error || "Order creation failed");

      const key = (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "")
        .replace(/['"]/g, "")
        .trim();

      // 3. Open modal
      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key,
          amount: orderData.order.amount,
          currency: "INR",
          name: "StuHive",
          description: "Premium Study Material",
          order_id: orderData.order.id,

          handler: async (response) => {
            try {
              // 4. Verify
              const verifyRes = await fetch("/api/payments/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const verifyData = await verifyRes.json();

              if (verifyData.success) {
                await update({ purchasedNotes: verifyData.purchasedNotes });
                toast({
                  title: "🎉 Purchase Successful!",
                  description: "Full document is now unlocked.",
                });
                router.refresh();
                resolve();
              } else {
                reject(new Error(verifyData.error || "Verification failed"));
              }
            } catch (e) {
              reject(e);
            }
          },

          prefill: {
            email: session.user.email || "",
            name: session.user.name || "",
          },
          theme: { color: "#06b6d4" },
          modal: {
            ondismiss: () => {
              setLoading(false);
              resolve();
            },
          },
        });

        rzp.on("payment.failed", (r) => {
          reject(new Error(r.error?.description || "Payment failed"));
        });

        rzp.open();
      });
    } catch (error) {
      toast({
        title: "Payment Error",
        description: error.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handlePayment}
      disabled={loading}
      className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl px-6 h-11"
    >
      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <>
          <ShoppingCart className="w-5 h-5 mr-2" />
          Buy for ₹{price}
        </>
      )}
    </Button>
  );
}
