"use client";

import { FormEvent, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import ScrollReveal from "@/components/ScrollReveal";
import { useAuth } from "@/lib/auth";

interface FeedbackState {
  sending: boolean;
  success: boolean;
  error: string | null;
}

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const COMPRESSIBLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const fieldStyle = {
  width: "100%",
  borderRadius: "14px",
  border: "1px solid rgba(255,255,255,0.09)",
  background: "rgba(255,255,255,0.035)",
  color: "var(--color-text-primary)",
  padding: "14px 15px",
  fontFamily: "var(--font-dm-sans)",
  fontSize: "14px",
  lineHeight: 1.55,
  outline: "none",
};

function FieldLabel({ children, helper }: { children: React.ReactNode; helper?: string }) {
  return (
    <label style={{ display: "grid", gap: "8px" }}>
      <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "14px", fontWeight: 700, color: "var(--color-cream)" }}>
        {children}
      </span>
      {helper ? (
        <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-tertiary)", lineHeight: 1.6 }}>
          {helper}
        </span>
      ) : null}
    </label>
  );
}

async function compressImageFile(file: File) {
  if (!COMPRESSIBLE_IMAGE_TYPES.has(file.type) || file.size <= MAX_SCREENSHOT_BYTES) return file;

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read screenshot image."));
      img.src = imageUrl;
    });

    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.82, 0.72, 0.62]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_SCREENSHOT_BYTES) {
        const baseName = file.name.replace(/\.[^.]+$/, "") || "feedback-screenshot";
        return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
      }
    }

    return file;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export default function FeedbackPage() {
  const { isSignedIn, user, signIn } = useAuth();
  const [feedbackState, setFeedbackState] = useState<FeedbackState>({ sending: false, success: false, error: null });
  const [screenshotName, setScreenshotName] = useState("");

  const userEmail = user?.emailAddresses?.[0]?.emailAddress || "";
  const detectedDevice = useMemo(() => {
    if (typeof navigator === "undefined") return "";
    return navigator.userAgent;
  }, []);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackState({ sending: true, success: false, error: null });

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const screenshot = formData.get("screenshot");
      if (screenshot instanceof File && screenshot.size > 0) {
        const preparedScreenshot = await compressImageFile(screenshot);
        if (preparedScreenshot.size > MAX_SCREENSHOT_BYTES) {
          throw new Error("That screenshot is too large to attach. Please choose an image under 4 MB or send the feedback without a screenshot.");
        }
        formData.set("screenshot", preparedScreenshot);
      }
      if (!formData.get("deviceBrowser")) formData.set("deviceBrowser", detectedDevice);
      formData.set("email", userEmail);
      formData.set("pageUrl", typeof window !== "undefined" ? window.location.href : "");
      formData.set("referrer", typeof document !== "undefined" ? document.referrer : "");
      formData.set("userAgent", typeof navigator !== "undefined" ? navigator.userAgent : "");
      formData.set("viewport", typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "");

      const response = await fetch("/api/feedback", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Failed to send feedback.");
      form.reset();
      setScreenshotName("");
      setFeedbackState({ sending: false, success: true, error: null });
    } catch (error) {
      setFeedbackState({ sending: false, success: false, error: error instanceof Error ? error.message : "Failed to send feedback." });
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-primary)" }}>
      <Navigation />
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <section style={{ paddingTop: "118px", paddingBottom: "34px", position: "relative", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle at 50% 0%, rgba(196,148,58,0.14), transparent 42%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", maxWidth: 820, margin: "0 auto", padding: "0 clamp(20px, 5vw, 40px)", textAlign: "center" }}>
            <ScrollReveal delay={80}>
              <p style={{ fontFamily: "var(--font-jetbrains)", fontSize: "11px", color: "var(--color-accent-amber)", letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "14px" }}>
                Tester feedback
              </p>
              <h1 style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(42px, 6vw, 68px)", lineHeight: 0.96, color: "var(--color-text-primary)", letterSpacing: "-0.02em", margin: 0 }}>
                Tell us what happened.
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={140}>
              <p style={{ margin: "20px auto 0", maxWidth: 660, fontFamily: "var(--font-dm-sans)", fontSize: "16px", lineHeight: 1.8, color: "var(--color-text-secondary)" }}>
                Use this while you test Bourbon Signal. The more specific you are, the faster we can fix rough spots.
              </p>
            </ScrollReveal>
          </div>
        </section>

        <section style={{ maxWidth: 820, margin: "0 auto", padding: "0 clamp(20px, 5vw, 40px) 90px" }}>
          <form
            onSubmit={submitFeedback}
            style={{
              display: "grid",
              gap: "20px",
              borderRadius: "24px",
              border: "1px solid rgba(196,148,58,0.14)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))",
              boxShadow: "0 24px 80px rgba(0,0,0,0.24)",
              padding: "clamp(20px, 4vw, 34px)",
            }}
          >
            {!isSignedIn ? (
              <div style={{ borderRadius: "16px", border: "1px solid rgba(196,148,58,0.18)", background: "rgba(196,148,58,0.08)", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <p style={{ fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6, margin: 0 }}>
                  You can send feedback without signing in, but signing in helps us connect it to your tester account.
                </p>
                <button type="button" onClick={() => signIn()} style={{ borderRadius: "999px", border: "1px solid rgba(196,148,58,0.35)", background: "rgba(196,148,58,0.12)", color: "var(--color-cream)", padding: "9px 14px", fontFamily: "var(--font-dm-sans)", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                  Sign in
                </button>
              </div>
            ) : userEmail ? (
              <div style={{ borderRadius: "16px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "13px 15px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", color: "var(--color-text-tertiary)" }}>
                Sending as <span style={{ color: "var(--color-cream)", fontWeight: 700 }}>{userEmail}</span>
              </div>
            ) : null}

            <div style={{ display: "grid", gap: "10px" }}>
              <FieldLabel helper="Example: setting alerts, checking a bottle, using the map, signing in, etc.">What were you trying to do?</FieldLabel>
              <textarea name="tryingToDo" rows={4} style={fieldStyle} />
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <FieldLabel>What worked well?</FieldLabel>
              <textarea name="workedWell" rows={4} style={fieldStyle} />
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <FieldLabel helper="Tell us what felt unclear, broken, slow, inaccurate, or annoying.">What was confusing or broken?</FieldLabel>
              <textarea name="confusingOrBroken" rows={5} style={fieldStyle} />
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <FieldLabel helper="We try to auto-capture this too, but anything you know helps — iPhone/Safari, desktop Chrome, etc.">What device/browser were you using?</FieldLabel>
              <input name="deviceBrowser" type="text" placeholder="e.g. iPhone 15 / Safari, Windows / Chrome" style={fieldStyle} />
            </div>

            <div style={{ display: "grid", gap: "10px" }}>
              <FieldLabel helper="Optional. PNG, JPG, WebP, or GIF under 8 MB.">Optional screenshot/upload</FieldLabel>
              <label style={{ borderRadius: "16px", border: "1px dashed rgba(196,148,58,0.28)", background: "rgba(196,148,58,0.06)", padding: "18px", cursor: "pointer", display: "grid", gap: "6px" }}>
                <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "14px", color: "var(--color-cream)", fontWeight: 700 }}>
                  {screenshotName || "Choose screenshot"}
                </span>
                <span style={{ fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-tertiary)" }}>
                  This will be attached to the feedback email.
                </span>
                <input
                  name="screenshot"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif"
                  style={{ display: "none" }}
                  onChange={(event) => setScreenshotName(event.currentTarget.files?.[0]?.name || "")}
                />
              </label>
            </div>

            {feedbackState.error ? (
              <div style={{ borderRadius: "14px", border: "1px solid rgba(255,120,90,0.28)", background: "rgba(255,120,90,0.08)", color: "#ffcabd", padding: "13px 15px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", lineHeight: 1.6 }}>
                {feedbackState.error}
              </div>
            ) : null}

            {feedbackState.success ? (
              <div style={{ borderRadius: "14px", border: "1px solid rgba(136,211,148,0.28)", background: "rgba(136,211,148,0.08)", color: "#c9f5d0", padding: "13px 15px", fontFamily: "var(--font-dm-sans)", fontSize: "13px", lineHeight: 1.6 }}>
                Got it — thank you. Your feedback was sent to support.
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
              <p style={{ margin: 0, fontFamily: "var(--font-dm-sans)", fontSize: "12px", color: "var(--color-text-tertiary)", lineHeight: 1.6 }}>
                Feedback goes to support@bourbonsignal.com.
              </p>
              <button
                type="submit"
                disabled={feedbackState.sending}
                style={{
                  border: "none",
                  borderRadius: "999px",
                  background: feedbackState.sending ? "rgba(196,148,58,0.35)" : "linear-gradient(135deg, #C4943A, #D4A44A)",
                  color: "#0D0B0E",
                  padding: "13px 22px",
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  fontWeight: 800,
                  cursor: feedbackState.sending ? "wait" : "pointer",
                  boxShadow: feedbackState.sending ? "none" : "0 12px 30px rgba(196,148,58,0.18)",
                }}
              >
                {feedbackState.sending ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </form>
        </section>
      </motion.main>
      <Footer />
    </div>
  );
}
