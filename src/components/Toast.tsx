"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, Bookmark, BookmarkX, Filter, Info } from "lucide-react";
import { useToastStore } from "@/lib/toast";
import type { Toast as ToastType } from "@/lib/toast";

const iconMap = {
  bookmark: Bookmark,
  "bookmark-x": BookmarkX,
  filter: Filter,
  info: Info,
  bell: Bell,
};

function ToastItem({ toast }: { toast: ToastType }) {
  const Icon = iconMap[toast.icon || "info"];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 60 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 20px",
        background: "var(--color-glass)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid var(--color-card-border)",
        borderLeft: "3px solid var(--color-accent-amber)",
        borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        minWidth: "240px",
        maxWidth: "360px",
      }}
    >
      <Icon
        size={16}
        style={{ color: "var(--color-accent-amber)", flexShrink: 0 }}
      />
      <span
        style={{
          fontFamily: "var(--font-dm-sans)",
          fontSize: "13px",
          color: "var(--color-cream)",
          lineHeight: 1.4,
        }}
      >
        {toast.message}
      </span>
    </motion.div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      style={{
        position: "fixed",
        top: "80px",
        right: "24px",
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        pointerEvents: "none",
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: "auto" }}>
            <ToastItem toast={toast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
