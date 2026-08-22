import { auth } from "@clerk/nextjs/server";
import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const { userId } = await auth();
  return <HomeClient initialSignedIn={Boolean(userId)} />;
}
