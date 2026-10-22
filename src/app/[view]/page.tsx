import { notFound } from "next/navigation";
import { loadPlannerData } from "../planner-data";
import { Planner, type PlannerView } from "../planner";

export const dynamic = "force-dynamic";

const views: Record<string, PlannerView> = {
  today: "Today",
  calendar: "Calendar",
  "all-tasks": "All tasks",
  goals: "Goals",
  routines: "Routines",
};

export default async function ViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view: slug } = await params;
  const view = views[slug];
  if (!view) notFound();
  return <Planner initial={{ ...(await loadPlannerData()), view }} />;
}
