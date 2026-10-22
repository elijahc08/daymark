import { loadPlannerData } from "./planner-data";
import { Planner } from "./planner";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <Planner initial={{ ...(await loadPlannerData()), view: "Dashboard" }} />;
}
