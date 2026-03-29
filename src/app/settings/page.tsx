"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";
import { useAreaPreferences } from "@/hooks/useAreaPreferences";
import type { AreaPreferences } from "@/app/api/user/preferences/route";

// ─── Data ──────────────────────────────────────────────────────────────────────

const NC_BOARDS = [
  "Alamance", "Albemarle", "Alexander County", "Andrews", "Angier", "Asheboro",
  "Asheville", "Beaufort County", "Belmont", "Boiling Spring Lakes", "Boone",
  "Brevard", "Brunswick County", "Bryson City", "Burlington", "Burnsville",
  "Cabarrus County", "Camden County", "Carteret County", "Caswell County",
  "Catawba County", "Chapel Hill", "Chatham County", "Charlotte", "Cherryville",
  "Concord", "Craven County", "Cumberland County", "Currituck County", "Dare County",
  "Davidson County", "Durham", "Edgecombe County", "Fayetteville", "Franklin County",
  "Gastonia", "Goldsboro", "Graham County", "Granville County", "Greene County",
  "Greensboro", "Halifax County", "Harnett County", "Haywood County", "Henderson",
  "Hertford County", "High Point", "Hoke County", "Iredell County",
  "Johnston County", "Lee County", "Lenoir County", "Lincoln County", "McDowell County",
  "Mecklenburg", "Montgomery County", "Moore County", "Nash County", "New Hanover County",
  "Onslow County", "Orange County", "Pitt County", "Randolph County", "Robeson County",
  "Rockingham County", "Rowan County", "Rutherford County", "Sampson County",
  "Scotland County", "Stanly County", "Surry County", "Union County", "Wake",
  "Watauga County", "Wayne County", "Wilkes County", "Wilson County", "Yadkin County",
];

const VA_CITIES = [
  "Alexandria", "Arlington", "Ashburn", "Blacksburg", "Bristol", "Charlottesville",
  "Chesapeake", "Christiansburg", "Danville", "Fairfax", "Falls Church", "Fredericksburg",
  "Hampton", "Harrisonburg", "Herndon", "Leesburg", "Lynchburg", "Manassas",
  "McLean", "Newport News", "Norfolk", "Petersburg", "Portsmouth", "Radford",
  "Reston", "Richmond", "Roanoke", "Salem", "Springfield", "Staunton",
  "Sterling", "Suffolk", "Virginia Beach", "Waynesboro", "Williamsburg", "Winchester",
];

const PA_COUNTIES = [
  "Adams", "Allegheny", "Armstrong", "Beaver", "Bedford", "Berks", "Blair",
  "Bradford", "Bucks", "Butler", "Cambria", "Centre", "Chester", "Clarion",
  "Clearfield", "Columbia", "Crawford", "Cumberland", "Dauphin", "Delaware",
  "Erie", "Fayette", "Franklin", "Indiana", "Jefferson", "Lackawanna",
  "Lancaster", "Lawrence", "Lebanon", "Lehigh", "Luzerne", "Lycoming",
  "McKean", "Mercer", "Monroe", "Montgomery", "Northampton", "Philadelphia",
  "Pike", "Potter", "Schuylkill", "Somerset", "Tioga", "Venango",
  "Warren", "Washington", "Wayne", "Westmoreland", "Wyoming", "York",
];

// ─── Searchable multi-picker ────────────────────────────────────────────────────

interface PickerProps {
  options: string[];
  selected: string[];
  placeholder: string;
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
}

function SearchPicker({ options, selected, placeholder, onAdd, onRemove }: PickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = options
    .filter((o) => !selected.includes(o) && o.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 12);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2" style={{ marginBottom: "10px" }}>
          {selected.map((item) => (
            <span
              key={item}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--color-accent-amber)",
                background: "rgba(196,148,58,0.12)",
                border: "1px solid rgba(196,148,58,0.3)",
                borderRadius: "6px",
                padding: "4px 8px",
              }}
            >
              {item}
              <button
                onClick={() => onRemove(item)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "rgba(196,148,58,0.6)",
                  fontSize: "14px",
                  lineHeight: 1,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                }}
                aria-label={`Remove ${item}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        style={{
          width: "100%",
          padding: "10px 14px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(196,148,58,0.2)",
          borderRadius: "8px",
          fontFamily: "var(--font-dm-sans)",
          fontSize: "14px",
          color: "var(--color-text-primary)",
          outline: "none",
          transition: "border-color 200ms",
        }}
        onFocusCapture={(e) => {
          e.currentTarget.style.borderColor = "rgba(196,148,58,0.5)";
        }}
        onBlurCapture={(e) => {
          e.currentTarget.style.borderColor = "rgba(196,148,58,0.2)";
        }}
      />

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            background: "var(--color-bg-tertiary)",
            border: "1px solid rgba(196,148,58,0.2)",
            borderRadius: "8px",
            zIndex: 100,
            maxHeight: "220px",
            overflowY: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {filtered.map((item) => (
            <button
              key={item}
              onMouseDown={(e) => {
                e.preventDefault();
                onAdd(item);
                setQuery("");
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 14px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-secondary)",
                transition: "background 150ms, color 150ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(196,148,58,0.08)";
                e.currentTarget.style.color = "var(--color-text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.color = "var(--color-text-secondary)";
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── State sub-section ─────────────────────────────────────────────────────────

interface StateAreaSectionProps {
  stateCode: string;
  label: string;
  subLabel: string;
  options: string[];
  selected: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
  placeholder: string;
}

function StateAreaSection({
  stateCode,
  label,
  subLabel,
  options,
  selected,
  onAdd,
  onRemove,
  placeholder,
}: StateAreaSectionProps) {
  const [expanded, setExpanded] = useState(selected.length > 0);

  return (
    <div
      style={{
        marginTop: "20px",
        padding: "16px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(196,148,58,0.1)",
        borderRadius: "8px",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: "8px" }}>
        <div>
          <span
            style={{
              fontFamily: "var(--font-jetbrains)",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "rgba(196,148,58,0.7)",
              marginRight: "8px",
            }}
          >
            {stateCode}
          </span>
          <span
            style={{
              fontFamily: "var(--font-dm-sans)",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--color-text-primary)",
            }}
          >
            {label}
          </span>
        </div>
      </div>

      {selected.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "12px",
            color: "var(--color-text-tertiary)",
            marginBottom: "10px",
          }}
        >
          Showing drops from all {subLabel}
        </p>
      ) : null}

      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          style={{
            fontFamily: "var(--font-dm-sans)",
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--color-accent-amber)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textDecoration: "underline",
            textDecorationColor: "rgba(196,148,58,0.3)",
            textUnderlineOffset: "3px",
          }}
        >
          + Add specific {subLabel}
        </button>
      ) : (
        <>
          <SearchPicker
            options={options}
            selected={selected}
            placeholder={placeholder}
            onAdd={onAdd}
            onRemove={onRemove}
          />
          {selected.length === 0 && (
            <button
              onClick={() => setExpanded(false)}
              style={{
                marginTop: "8px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                color: "var(--color-text-tertiary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Cancel
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const { isSignedIn, user, signOut } = useAuth();
  const { prefs, loading, savePreferences } = useAreaPreferences();
  const [localPrefs, setLocalPrefs] = useState<AreaPreferences>({
    states: [],
    ncBoards: [],
    vaCities: [],
    paCounties: [],
  });
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if not signed in
  useEffect(() => {
    if (mounted && !loading && !isSignedIn) {
      router.push("/sign-in");
    }
  }, [mounted, isSignedIn, loading, router]);

  // Sync server prefs → local state
  useEffect(() => {
    setLocalPrefs(prefs);
  }, [prefs]);

  const toggleState = (code: string) => {
    setLocalPrefs((prev) => {
      const hasState = prev.states.includes(code);
      return {
        ...prev,
        states: hasState
          ? prev.states.filter((s) => s !== code)
          : [...prev.states, code],
        // Clear sub-prefs if deselecting a state
        ncBoards: code === "NC" && hasState ? [] : prev.ncBoards,
        vaCities: code === "VA" && hasState ? [] : prev.vaCities,
        paCounties: code === "PA" && hasState ? [] : prev.paCounties,
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePreferences(localPrefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // no-op — could add error toast
    } finally {
      setSaving(false);
    }
  };

  const userEmail =
    user?.emailAddresses?.[0]?.emailAddress || "";

  // Show skeleton while loading/redirecting
  if (!mounted || loading || !isSignedIn) {
    return (
      <>
        <Navigation />
        <div
          style={{
            minHeight: "100vh",
            background: "var(--color-bg-primary)",
            paddingTop: "120px",
          }}
        />
        <Footer />
      </>
    );
  }

  const stateOptions = [
    { code: "NC", label: "North Carolina" },
    { code: "VA", label: "Virginia" },
    { code: "PA", label: "Pennsylvania" },
  ];

  return (
    <>
      <Navigation />
      <div
        style={{
          minHeight: "100vh",
          background: "var(--color-bg-primary)",
          paddingTop: "100px",
          paddingBottom: "80px",
        }}
      >
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 clamp(20px, 5vw, 40px)" }}>

          {/* Page header */}
          <div style={{ marginBottom: "40px" }}>
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.15em",
                color: "var(--color-accent-amber)",
                textTransform: "uppercase",
                marginBottom: "10px",
              }}
            >
              Account
            </p>
            <h1
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(28px, 5vw, 36px)",
                fontWeight: 700,
                color: "var(--color-cream)",
                lineHeight: 1.2,
                marginBottom: "8px",
              }}
            >
              Settings
            </h1>
            {userEmail && (
              <p
                style={{
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                {userEmail}
              </p>
            )}
          </div>

          {/* ── My Hunt Areas ── */}
          <div
            style={{
              background: "var(--color-card-bg)",
              border: "1px solid var(--color-card-border)",
              borderRadius: "12px",
              padding: "28px",
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--color-cream)",
                marginBottom: "6px",
              }}
            >
              My Hunt Areas
            </h2>
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "13px",
                color: "var(--color-text-tertiary)",
                marginBottom: "24px",
              }}
            >
              Filter the drop feed to only show bottles in your area. Select states, then narrow down by specific boards or cities.
            </p>

            {/* State pills */}
            <p
              style={{
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "var(--color-text-tertiary)",
                textTransform: "uppercase",
                marginBottom: "12px",
              }}
            >
              States I hunt in
            </p>
            <div className="flex flex-wrap gap-3">
              {stateOptions.map(({ code, label }) => {
                const active = localPrefs.states.includes(code);
                return (
                  <button
                    key={code}
                    onClick={() => toggleState(code)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "10px 18px",
                      borderRadius: "8px",
                      border: active
                        ? "1px solid rgba(196,148,58,0.6)"
                        : "1px solid rgba(255,255,255,0.1)",
                      background: active
                        ? "rgba(196,148,58,0.15)"
                        : "rgba(255,255,255,0.03)",
                      color: active
                        ? "var(--color-accent-amber)"
                        : "var(--color-text-tertiary)",
                      fontFamily: "var(--font-dm-sans)",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 150ms ease",
                    }}
                  >
                    {active && (
                      <span style={{ fontSize: "12px" }}>✓</span>
                    )}
                    {code} — {label}
                  </button>
                );
              })}
            </div>

            {/* Per-state sub-sections */}
            {localPrefs.states.includes("NC") && (
              <StateAreaSection
                stateCode="NC"
                label="Boards"
                subLabel="NC boards"
                options={NC_BOARDS}
                selected={localPrefs.ncBoards}
                placeholder="Search NC boards…"
                onAdd={(item) =>
                  setLocalPrefs((p) => ({
                    ...p,
                    ncBoards: [...p.ncBoards, item],
                  }))
                }
                onRemove={(item) =>
                  setLocalPrefs((p) => ({
                    ...p,
                    ncBoards: p.ncBoards.filter((b) => b !== item),
                  }))
                }
              />
            )}

            {localPrefs.states.includes("VA") && (
              <StateAreaSection
                stateCode="VA"
                label="Cities"
                subLabel="VA cities"
                options={VA_CITIES}
                selected={localPrefs.vaCities}
                placeholder="Search VA cities…"
                onAdd={(item) =>
                  setLocalPrefs((p) => ({
                    ...p,
                    vaCities: [...p.vaCities, item],
                  }))
                }
                onRemove={(item) =>
                  setLocalPrefs((p) => ({
                    ...p,
                    vaCities: p.vaCities.filter((c) => c !== item),
                  }))
                }
              />
            )}

            {localPrefs.states.includes("PA") && (
              <StateAreaSection
                stateCode="PA"
                label="Counties"
                subLabel="PA counties"
                options={PA_COUNTIES}
                selected={localPrefs.paCounties}
                placeholder="Search PA counties…"
                onAdd={(item) =>
                  setLocalPrefs((p) => ({
                    ...p,
                    paCounties: [...p.paCounties, item],
                  }))
                }
                onRemove={(item) =>
                  setLocalPrefs((p) => ({
                    ...p,
                    paCounties: p.paCounties.filter((c) => c !== item),
                  }))
                }
              />
            )}

            {/* Save button */}
            <div style={{ marginTop: "28px" }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "12px 28px",
                  borderRadius: "8px",
                  background: saved
                    ? "rgba(45,106,79,0.6)"
                    : "linear-gradient(135deg, #C4943A 0%, #D4A44A 100%)",
                  border: saved
                    ? "1px solid rgba(45,106,79,0.8)"
                    : "none",
                  color: saved ? "#A8D5BC" : "#0D0B07",
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1,
                  transition: "all 200ms ease",
                  minWidth: "160px",
                }}
              >
                {saving ? "Saving…" : saved ? "Saved ✓" : "Save Preferences"}
              </button>
            </div>
          </div>

          {/* ── Account ── */}
          <div
            style={{
              background: "var(--color-card-bg)",
              border: "1px solid var(--color-card-border)",
              borderRadius: "12px",
              padding: "28px",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--color-cream)",
                marginBottom: "16px",
              }}
            >
              Account
            </h2>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
              }}
            >
              <div>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "13px",
                    color: "var(--color-text-tertiary)",
                    marginBottom: "4px",
                  }}
                >
                  Signed in as
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-dm-sans)",
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                  }}
                >
                  {userEmail}
                </p>
              </div>
              <button
                onClick={() => signOut()}
                style={{
                  padding: "10px 20px",
                  borderRadius: "6px",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "var(--color-text-secondary)",
                  fontFamily: "var(--font-dm-sans)",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
                  e.currentTarget.style.color = "var(--color-text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                  e.currentTarget.style.color = "var(--color-text-secondary)";
                }}
              >
                Sign Out
              </button>
            </div>
          </div>

        </div>
      </div>
      <Footer />
    </>
  );
}
