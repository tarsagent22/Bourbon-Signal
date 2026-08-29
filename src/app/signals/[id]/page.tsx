import SignalDetailClient from "./SignalDetailClient";

export default async function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SignalDetailClient signalId={id} />;
}
