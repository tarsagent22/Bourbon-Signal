"use client";

import { useEffect, useState } from "react";

type RetailerSignalTimeProps = {
  label: string;
  value: string;
  timeZone: string;
};

export default function RetailerSignalTime({ label, value, timeZone }: RetailerSignalTimeProps) {
  const [formatted, setFormatted] = useState("");

  useEffect(() => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      setFormatted("");
      return;
    }
    setFormatted(new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(parsed));
  }, [timeZone, value]);

  if (!formatted) return null;
  return <span>{label} <time dateTime={value}>{formatted}</time></span>;
}
