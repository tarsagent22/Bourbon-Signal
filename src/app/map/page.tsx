"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";

const HuntMap = dynamic(() => import("@/components/HuntMap"), { ssr: false });

export default function MapPage() {
  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 1100 }}>
        <Navigation />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        style={{ width: "100%", height: "100%" }}
      >
        <HuntMap />
      </motion.div>
    </div>
  );
}
