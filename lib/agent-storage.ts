import { env } from "cloudflare:workers";

export function agentDatabase() {
  if (!env.DB) throw new Error("问题资料库暂不可用。");
  return env.DB;
}
