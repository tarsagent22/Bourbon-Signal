import { permanentRedirect } from "next/navigation";

export default function RetiredBottleGuidesPage() {
  permanentRedirect("/release-radar?type=bottle");
}
