import { notFound } from "next/navigation";

import { MuralSpike } from "./MuralSpike";

/** A developer spike: it 404s in production. */
export default function MuralSpikePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MuralSpike />;
}
