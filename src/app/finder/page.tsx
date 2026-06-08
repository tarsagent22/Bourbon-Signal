import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import MapPageClient from "@/components/MapPageClient";

export const dynamic = "force-dynamic";

export default function FinderPage() {
  return (
    <>
      <Navigation />
      <MapPageClient />
      <Footer />
    </>
  );
}
