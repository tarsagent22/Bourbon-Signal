"use client";

import dynamic from "next/dynamic";
import Navigation from "@/components/Navigation";

const HuntMap = dynamic(() => import("@/components/HuntMap"), { ssr: false });

export default function MapPage() {
  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
      <Navigation />
      <HuntMap />
    </div>
  );
}
