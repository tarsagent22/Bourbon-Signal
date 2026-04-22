"use client";

import React from "react";

interface LiquidToggleProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
}

export function LiquidToggle({ checked = false, onCheckedChange, disabled = false }: LiquidToggleProps) {
  const [isChecked, setIsChecked] = React.useState(checked);

  React.useEffect(() => {
    setIsChecked(checked);
  }, [checked]);

  return (
    <label
      style={{
        position: "relative",
        display: "block",
        cursor: disabled ? "not-allowed" : "pointer",
        height: "32px",
        width: "52px",
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        perspective: 1000,
        WebkitPerspective: 1000,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={isChecked}
        disabled={disabled}
        onChange={(e) => {
          setIsChecked(e.target.checked);
          onCheckedChange?.(e.target.checked);
        }}
        style={{
          height: "100%",
          width: "100%",
          cursor: disabled ? "not-allowed" : "pointer",
          appearance: "none",
          borderRadius: "999px",
          border: isChecked ? "1px solid rgba(239,192,80,0.34)" : "1px solid rgba(245,237,214,0.10)",
          background: isChecked
            ? "linear-gradient(135deg, rgba(212,146,11,0.92) 0%, rgba(239,192,80,0.88) 100%)"
            : "rgba(255,255,255,0.10)",
          outline: "none",
          transition: "all 500ms ease",
          boxShadow: isChecked ? "0 0 24px rgba(212,146,11,0.28)" : "none",
        }}
      />
      <svg
        viewBox="0 0 52 32"
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          fill: "rgba(255,255,255,0.95)",
          transform: "translate3d(0,0,0)",
          WebkitTransform: "translate3d(0,0,0)",
          filter: "url(#bourbon-goo)",
        }}
      >
        <circle
          cx="16"
          cy="16"
          r="10"
          style={{
            transformOrigin: "16px 16px",
            transform: `translateX(${isChecked ? "12px" : "0px"}) scale(${isChecked ? "0" : "1"})`,
            transition: "transform 500ms ease",
          }}
        />
        <circle
          cx="36"
          cy="16"
          r="10"
          style={{
            transformOrigin: "36px 16px",
            transform: `translateX(${isChecked ? "0px" : "-12px"}) scale(${isChecked ? "1" : "0"})`,
            transition: "transform 500ms ease",
          }}
        />
        {isChecked ? (
          <circle
            cx="35"
            cy="-1"
            r="2.5"
            style={{
              transition: "transform 700ms ease",
            }}
          />
        ) : null}
      </svg>
    </label>
  );
}

export function LiquidToggleFilter() {
  return (
    <svg style={{ position: "fixed", width: 0, height: 0 }} aria-hidden="true">
      <defs>
        <filter id="bourbon-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}
