import { requeue } from "../../lib/handlers";
import { makeDeps } from "../../lib/runtime";
export const POST = requeue(makeDeps);
