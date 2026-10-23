import { status } from "../../lib/handlers";
import { makeDeps } from "../../lib/runtime";
export const GET = status(makeDeps);
export const POST = status(makeDeps);
