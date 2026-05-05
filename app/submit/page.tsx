import type { Metadata } from "next";
import SubmitDataForm from "../components/SubmitDataForm";

export const metadata: Metadata = {
  title: "Submit Your Rent Data | RentInDex",
  description:
    "Help us build Nigeria's most accurate rent database. Takes 2 minutes. Completely anonymous. Get free early access when RentInDex launches.",
};

export default function SubmitPage() {
  return <SubmitDataForm />;
}
