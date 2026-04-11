import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import MapPageClient from "@/components/MapPageClient";

export default function MapPage() {
  return (
    <>
      <Navigation />
      <main
        style={{
          minHeight: "100vh",
          background: "var(--color-bg-primary)",
          paddingTop: 96,
        }}
      >
        <MapPageClient />
      </main>
      <Footer />
    </>
  );
}
