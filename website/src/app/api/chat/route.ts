import { createChatHandlers } from "../../../lib/server-chat";

export const runtime = "nodejs";
export const maxDuration = 90;

export const { GET, POST } = createChatHandlers();
