import { setRequestLocale } from "next-intl/server";
import { DispatchDesk } from "@/components/DispatchDesk";

export default async function Play({ params }: PageProps<"/[locale]/play">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DispatchDesk />;
}
