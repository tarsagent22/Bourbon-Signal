import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import SightingsClient from "./SightingsClient";

export const dynamic = "force-dynamic";

export default function SightingsPage() {
  return (
    <>
      <Navigation />
      <SightingsClient />
      <Footer />
    </>
  );
}
