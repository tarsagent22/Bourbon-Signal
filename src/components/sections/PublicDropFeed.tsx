"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { ArrowDownRight, ArrowUpRight, ChevronDown, MapPin, Radio } from "lucide-react";
import AppDownloadCTA from "@/components/AppDownloadCTA";
import { CoverageSearch } from "@/components/coverage/CoverageSearch";
import type { PublicMarketingDrop } from "@/lib/public-marketing-feed";
import styles from "./PublicDropFeed.module.css";

type StateOption = { code: string; name: string };
type FeedProps = { drops: PublicMarketingDrop[]; unavailable: boolean; states: StateOption[] };

function reportSource(drop: PublicMarketingDrop) {
  if (drop.scope === "board") return { label: "ABC board shipment", detail: "Receiving stores unconfirmed. This report records a shipment to the local ABC board." };
  switch (drop.eventType) {
    case "new_shipment":
    case "store_delivery_snapshot":
      return { label: "Delivery report", detail: "The source recorded a delivery. Check with the retailer for shelf availability." };
    case "nc_statewide_warehouse_stock":
      return { label: "Warehouse report", detail: "This bottle was reported at the state warehouse. Individual store deliveries are unconfirmed." };
    case "store_inventory_result":
    case "in_store":
    case "store_stock_increase":
    case "browser_assisted_store_inventory_limited_supply":
    case "browser_assisted_store_inventory_in_stock":
      return { label: "Inventory report", detail: "The source reported inventory at the time shown. Check with the retailer before making a trip." };
    default:
      if (drop.scope === "store") return { label: "Store report", detail: "The source reported activity at a store in this area. Confirm shelf availability and price with the retailer." };
      return { label: "Area report", detail: "This public report identifies activity in the area shown. Check local coverage for the detail available here." };
  }
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  timeZone: "America/New_York", timeZoneName: "short",
});

function place(drop: PublicMarketingDrop, states: StateOption[]) {
  const stateName = states.find(state => state.code === drop.state)?.name ?? drop.state;
  return drop.location === drop.state ? stateName : `${drop.location}, ${stateName}`;
}

export default function PublicDropFeed({ drops, unavailable, states }: FeedProps) {
  const [area, setArea] = useState("");
  const selectedState = states.find(state => state.code === area);
  const visibleDrops = area ? drops.filter(drop => drop.state.split("-")[0] === area) : drops;
  const featured = visibleDrops[0];

  function openFeatured() {
    if (!featured) return;
    const report = document.getElementById(featured.id);
    if (report instanceof HTMLDetailsElement) {
      report.open = true;
      report.querySelector("summary")?.focus({ preventScroll: true });
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <h1>Know when your bourbon <em>shows up nearby.</em></h1>
            <p>Follow the bottles you’re hunting. See store reports, ABC shipments, and finds from other bourbon hunters.</p>
            <div className={styles.actions}>
              <a className={styles.primary} href="#local-coverage"><MapPin size={17} /> Check my area</a>
              <a className={styles.textLink} href="#download">Get the app <ArrowDownRight size={17} /></a>
            </div>
            <a className={styles.planNote} href="/pricing">Browse free · Bottle alerts $6/month</a>
          </div>
          {featured ? <article className={styles.featured}>
            <div className={styles.featureTop}><Radio size={18} /> Latest bottle report</div>
            <div className={styles.featureBody}>
              <div>
                <p className={styles.label}>{reportSource(featured).label}</p>
                <h2>{featured.bottle}</h2>
                <p className={styles.place}>{place(featured, states)}</p>
                {featured.scope === "board" && <p className={styles.sourceNote}>Receiving stores unconfirmed</p>}
              </div>
              {featured.artwork && <img src={featured.artwork} alt="" className={styles.heroBottle} />}
            </div>
            <div className={styles.featureBottom}>
              <time dateTime={featured.observedAt}>{dateFormat.format(new Date(featured.observedAt))}</time>
              <a className={styles.textLink} href={`#${featured.id}`} onClick={openFeatured}>Read report <ArrowDownRight size={16} /></a>
            </div>
          </article> : <div className={styles.noFeature}><h2>{selectedState ? selectedState.name + " coverage" : "Explore local coverage"}</h2><p>{selectedState ? "Check the local sources available in this state." : "Check which reports are available in your state, city, or store."}</p><a className={styles.textLink} href={selectedState ? "/coverage?state=" + area : "/coverage"}>Open coverage map →</a></div>}
        </div>
      </section>

      <div className={styles.content}>
        <section id="local-coverage" className={styles.area}>
          <div><h2>What’s covered near you?</h2><p>Choose a state to check a city or store.</p></div>
          <div className={styles.selector}>
            <label htmlFor="local-state">State</label>
            <select id="local-state" value={area} onChange={event => setArea(event.target.value)}>
              <option value="">Choose your state</option>
              {states.map(state => <option key={state.code} value={state.code}>{state.name}</option>)}
            </select>
          </div>
          {selectedState && <div className={styles.localResults}>
            <CoverageSearch key={area} stateCode={area} stateName={selectedState.name} />
            <a className={styles.textLink} href={`/coverage?state=${area}`}>Explore {selectedState.name} coverage <ArrowUpRight size={16} /></a>
          </div>}
        </section>
        <section id="drops" className={styles.feed}>
          <header className={styles.sectionHead}>
            <div><p className={styles.label}>{selectedState?.name ?? "Across covered markets"}</p><h2>Latest bottle reports</h2></div>
            <a className={styles.textLink} href="/coverage">Coverage map <ArrowUpRight size={16} /></a>
          </header>
          {visibleDrops.map(drop => {
            const source = reportSource(drop);
            return <details className={styles.report} id={drop.id} key={drop.id}
              onToggle={event => { if (event.currentTarget.open) track("public_report_opened", { state: drop.state, source: source.label }); }}>
              <summary>
                {drop.artwork && <img src={drop.artwork} alt="" loading="lazy" />}
                <div className={styles.reportCopy}>
                  <p className={styles.label}>{source.label}</p><h3>{drop.bottle}</h3><p>{place(drop, states)}</p>
                </div>
                <time dateTime={drop.observedAt}>{dateFormat.format(new Date(drop.observedAt))}</time>
                <ChevronDown size={19} className={styles.chevron} />
              </summary>
              <div className={styles.reportDetail}>
                <p>{source.detail}</p>
                {drop.msrp && <p>Suggested retail price · ${drop.msrp}</p>}
                <div className={styles.actions}><a className={styles.textLink} href={`/coverage?state=${encodeURIComponent(drop.state.split("-")[0])}`}>Check local coverage →</a>
                <a className={styles.textLink} href="/pricing?source=public-report">Explore bottle alerts →</a></div>
              </div>
            </details>;
          })}
          {selectedState && !visibleDrops.length && !unavailable && <p role="status">The current public preview has no reports for {selectedState.name}. The coverage map shows which sources we check there.</p>}
          {selectedState && <button type="button" className={styles.reset} onClick={() => setArea("")}>Show all preview reports</button>}
          {!drops.length && (!selectedState || unavailable) && <p role="status">{unavailable ? "Bottle reports are temporarily unavailable. Please check back shortly." : "There are no public reports to show right now."}</p>}
          <a className={styles.feedEnd} href="#download">See more signals in the app <ArrowDownRight size={17} /></a>
        </section>
        <section className={styles.steps} aria-labelledby="watch-heading">
          <h2 id="watch-heading">How bottle alerts work</h2>
          <ol>
            <li><h3>Choose a bottle</h3><p>Add the bottles you want to your watchlist in the app.</p></li>
            <li><h3>Set your area</h3><p>Choose the places you can reach. Coverage shows the kinds of reports available there.</p></li>
            <li><h3>Open the report</h3><p>With Barrel Proof, a matching alert takes you to the bottle, place, and report time.</p></li>
          </ol>
        </section>
        <section className={styles.download} aria-labelledby="download-heading">
          <div><h2 id="download-heading">Keep your hunt and shelf together.</h2>
          <p>Log the bottles you own and the pours you’ve tried. Save ratings and tasting notes in My Shelf. Free includes ten bottles.</p>
          <a className={styles.textLink} href="/pricing">Compare memberships →</a></div>
          <div className={styles.appLinks}><div className={styles.qr}><img src="/download-app-qr.png" width="76" height="76" alt="" loading="lazy" /><span>Scan to open on your phone</span></div><AppDownloadCTA /></div>
        </section>
      </div>
    </div>
  );
}
