import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Company Control Room | Bourbon Signal",
  description: "Private Bourbon Signal company operations dashboard.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function CompanyControlRoomLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
