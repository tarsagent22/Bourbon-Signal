import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function readParam(searchParams: URLSearchParams, key: string, fallback: string) {
  const value = searchParams.get(key)?.trim();
  return value || fallback;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const bottleName = readParam(searchParams, "bottleName", "Blanton's Original Single Barrel");
  const storeLabel = readParam(searchParams, "storeLabel", "ABC Store 112, Charlotte");
  const matchedArea = readParam(searchParams, "matchedArea", "Charlotte");
  const state = readParam(searchParams, "state", "NC");
  const timestampLabel = readParam(searchParams, "timestampLabel", "just now");
  const quantityLabel = searchParams.get("quantityLabel")?.trim() || "";
  const firstName = searchParams.get("firstName")?.trim() || "";
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          minHeight: "1500px",
          display: "flex",
          background: "#050403",
          padding: "48px",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            border: "3px solid #d8c0a2",
            borderRadius: "34px",
            overflow: "hidden",
            background: "#110c08",
            boxShadow: "0 0 0 1px #3e2912, 0 30px 90px rgba(0,0,0,0.65)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "86px 76px 70px",
              background: "linear-gradient(135deg, #2b1d10 0%, #1a110b 70%, #100b08 100%)",
              borderBottom: "3px solid #d8c0a2",
            }}
          >
            <div
              style={{
                color: "#d4a44a",
                fontSize: "26px",
                fontWeight: 800,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                marginBottom: "44px",
              }}
            >
              Bourbon Signal Member Alert
            </div>
            <div
              style={{
                color: "#fff3df",
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: "82px",
                lineHeight: 1.05,
                fontWeight: 800,
                marginBottom: "42px",
              }}
            >
              {bottleName}
            </div>
            <div
              style={{
                color: "#ead7b9",
                fontSize: "38px",
                lineHeight: 1.45,
              }}
            >
              {bottleName} just showed up in one of your tracked areas.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "78px 76px 70px",
              background: "#100b08",
            }}
          >
            <div style={{ color: "#fff0dc", fontSize: "35px", marginBottom: "36px" }}>{greeting}</div>
            <div
              style={{
                display: "flex",
                color: "#fff0dc",
                fontSize: "35px",
                lineHeight: 1.55,
                marginBottom: "34px",
              }}
            >
              {bottleName} just hit {storeLabel}.
            </div>
            <div
              style={{
                display: "flex",
                color: "#fff0dc",
                fontSize: "35px",
                lineHeight: 1.5,
                marginBottom: "54px",
              }}
            >
              This matched your {matchedArea} alert area.
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                border: "3px solid #d8c0a2",
                borderRadius: "30px",
                background: "#1a110b",
                padding: "54px 64px",
                marginBottom: "70px",
              }}
            >
              <div
                style={{
                  color: "#d4a44a",
                  fontSize: "24px",
                  fontWeight: 800,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  marginBottom: "36px",
                }}
              >
                Signal Location
              </div>
              <div
                style={{
                  color: "#fff3df",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: "58px",
                  lineHeight: 1.12,
                  fontWeight: 800,
                  marginBottom: "38px",
                }}
              >
                {storeLabel}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  color: "#ead7b9",
                  fontSize: "32px",
                  lineHeight: 1.85,
                }}
              >
                <div style={{ display: "flex" }}>Tracked area: {matchedArea}</div>
                <div style={{ display: "flex" }}>State: {state}</div>
                <div style={{ display: "flex" }}>Reported: {timestampLabel}</div>
                {quantityLabel ? <div style={{ display: "flex" }}>Reported qty: {quantityLabel}</div> : null}
              </div>
            </div>

            <div
              style={{
                alignSelf: "center",
                color: "#0d0b0e",
                background: "linear-gradient(135deg, #c4943a 0%, #e0b15a 100%)",
                borderRadius: "999px",
                padding: "28px 58px",
                fontSize: "32px",
                fontWeight: 800,
                marginBottom: "54px",
              }}
            >
              Open member dashboard
            </div>

            <div style={{ color: "#d6bb93", fontSize: "24px", lineHeight: 1.6 }}>
              If this looks wrong, reply and we will check it out.
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 1500,
    },
  );
}
