import { replay } from "../../lib/handlers";
import { makeDeps } from "../../lib/runtime";
export const POST = replay(makeDeps);
