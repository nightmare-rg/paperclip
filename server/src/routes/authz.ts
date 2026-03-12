import type { Request } from "express";
import { forbidden, unauthorized } from "../errors.js";

function isAgentCreateRequest(req: Request): boolean {
  if (req.method !== "POST" && req.method !== "post") return false;
  const path = (req.originalUrl ?? req.url ?? "").split("?")[0];
  return /\/companies\/[^/]+\/(agents|agent-hires)$/.test(path);
}

export function assertBoard(req: Request) {
  if (req.actor.type === "board") return;
  if (req.actor.type === "agent" && isAgentCreateRequest(req)) return;
  throw forbidden("Board access required");
}

export function assertCompanyAccess(req: Request, companyId: string) {
  if (req.actor.type === "none") {
    throw unauthorized();
  }
  if (req.actor.type === "agent" && req.actor.companyId !== companyId) {
    throw forbidden("Agent key cannot access another company");
  }
  if (req.actor.type === "board" && req.actor.source !== "local_implicit" && !req.actor.isInstanceAdmin) {
    const allowedCompanies = req.actor.companyIds ?? [];
    if (!allowedCompanies.includes(companyId)) {
      throw forbidden("User does not have access to this company");
    }
  }
}

export function getActorInfo(req: Request) {
  if (req.actor.type === "none") {
    throw unauthorized();
  }
  if (req.actor.type === "agent") {
    return {
      actorType: "agent" as const,
      actorId: req.actor.agentId ?? "unknown-agent",
      agentId: req.actor.agentId ?? null,
      runId: req.actor.runId ?? null,
    };
  }

  return {
    actorType: "user" as const,
    actorId: req.actor.userId ?? "board",
    agentId: null,
    runId: req.actor.runId ?? null,
  };
}
