"use client";

import { motion } from "framer-motion";
import { Warehouse, Truck, MapPin, PackageMinus } from "lucide-react";
import SectionHeading from "../SectionHeading";
import GlassCard from "../GlassCard";
import Badge from "../Badge";
import { staggerContainer, fadeUpVariant } from "@/lib/animations";

const eventIcons: Record<string, typeof Warehouse> = {
  "Warehouse Received": Warehouse,
  "Shipped to Board": Truck,
  "In Store": MapPin,
  "Warehouse Depleted": PackageMinus,
};

const drops = [
  {
    bottle: "Weller 12Y",
    event: "Shipped to Board",
    location: "State Store #34, Raleigh, NC",
    time: "47 min ago",
    quantity: "6 cases",
    rarity: "allocated" as const,
  },
  {
    bottle: "Woodford Reserve Double Double Oaked",
    event: "Warehouse Received",
    location: "State Distribution Center, Columbus, OH",
    time: "2 hr ago",
    quantity: "537 cases",
    rarity: "allocated" as const,
  },
  {
    bottle: "King of Kentucky SB1",
    event: "Warehouse Depleted",
    location: "State Warehouse, Nashville, TN",
    time: "3 hr ago",
    quantity: "0 cases (was 54)",
    rarity: "allocated" as const,
  },
  {
    bottle: "Blanton's Single Barrel",
    event: "In Store",
    location: "State Liquor Store #12, Portland, OR",
    time: "5 hr ago",
    quantity: "3 bottles",
    rarity: "allocated" as const,
  },
  {
    bottle: "E.H. Taylor Small Batch",
    event: "Shipped to Board",
    location: "Montgomery County Board, MD",
    time: "Yesterday",
    quantity: "4 cases",
    rarity: "limited" as const,
  },
];

export default function LiveDropFeed() {
  return (
    <section
      className="py-24 px-6 sm:px-8 md:px-16 lg:px-24"
      style={{ backgroundColor: "var(--color-bg-secondary)" }}
    >
      <div className="mx-auto max-w-2xl">
        <SectionHeading
          heading="What's Dropping Right Now"
          subheading="A live look at recent allocated bourbon activity across the country."
        />

        <motion.div
          className="space-y-4"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          {drops.map((drop) => {
            const EventIcon = eventIcons[drop.event] || Warehouse;
            return (
              <motion.div key={drop.bottle} variants={fadeUpVariant}>
                <GlassCard className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 !p-4 sm:!p-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <h3
                        style={{
                          fontFamily: "var(--font-playfair)",
                          fontSize: "16px",
                          fontWeight: 700,
                          color: "var(--color-text-primary)",
                        }}
                        className="sm:text-[18px]"
                      >
                        {drop.bottle}
                      </h3>
                      <Badge variant={drop.rarity}>
                        {drop.rarity === "allocated" ? "Allocated" : "Limited"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <EventIcon
                        size={14}
                        className="shrink-0"
                        style={{ color: "var(--color-text-secondary)" }}
                      />
                      <span
                        className="text-[13px] sm:text-[15px]"
                        style={{
                          fontFamily: "var(--font-dm-sans)",
                          lineHeight: 1.5,
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {drop.event}: {drop.location}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span
                      style={{
                        fontFamily: "var(--font-jetbrains)",
                        fontSize: "13px",
                        color: "var(--color-accent-amber)",
                        fontWeight: 600,
                      }}
                    >
                      {drop.quantity}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-jetbrains)",
                        fontSize: "13px",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      {drop.time}
                    </span>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Delay banner */}
        <motion.div
          className="mt-8 rounded-xl px-6 py-4 text-center"
          style={{ backgroundColor: "var(--color-bg-tertiary)" }}
          variants={fadeUpVariant}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <p
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "14px",
              fontStyle: "italic",
              color: "var(--color-text-secondary)",
            }}
          >
            Founding testers help validate these alerts before paid memberships open.{" "}
            <a
              href="/dashboard"
              style={{
                color: "var(--color-accent-amber)",
                textDecoration: "none",
              }}
            >
              Join beta setup →
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
