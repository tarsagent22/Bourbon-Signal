"use client";

import Link from "next/link";
import { bottleIdFromName } from "@/lib/drops";

interface BottleLinkProps {
  name: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export default function BottleLink({ name, children, style, className }: BottleLinkProps) {
  const bottleId = bottleIdFromName(name);
  return (
    <Link
      href={`/dashboard?highlight=${bottleId}`}
      className={className}
      style={{
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
        borderBottom: "1px solid transparent",
        transition: "border-color 200ms ease",
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderBottomColor = "var(--color-amber-rich)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderBottomColor = "transparent";
      }}
    >
      {children || name}
    </Link>
  );
}
