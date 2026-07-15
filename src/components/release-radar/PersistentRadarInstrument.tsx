"use client";

import { usePathname } from "next/navigation";

const tabRoutes = new Set([
  "/release-radar",
  "/release-radar/briefings",
  "/release-radar/states",
]);

export function PersistentRadarInstrument() {
  const pathname = usePathname();
  if (!tabRoutes.has(pathname)) return null;

  return (
    <div className={`rr-persistent-radar rr-hero-instrument${pathname === "/release-radar" ? "" : " rr-persistent-radar--subpage"}`} aria-hidden="true">
      <span className="rr-orbit rr-orbit--one" />
      <span className="rr-orbit rr-orbit--two" />
      <span className="rr-sweep" />
      <span className="rr-blip rr-blip--one" />
      <span className="rr-blip rr-blip--two" />
      <i />
    </div>
  );
}
