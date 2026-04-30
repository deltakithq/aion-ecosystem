import { AgentBuilder, createHook, requireApproval } from "@deltakit/aion/agent";
import { createTool } from "@deltakit/aion/tool";
import { OpenRouterClient } from "@deltakit/aion/providers";
import { Studio } from "@deltakit/aion-studio";
import { z } from "zod";

const client = OpenRouterClient.fromEnv();

const getOrder = createTool({
  name: "get_order",
  description: "Read an order summary from local application state.",
  input: z.object({
    id: z.string().describe("The order id to read."),
  }),
  output: z.object({
    id: z.string(),
    status: z.enum(["processing", "blocked", "shipped"]),
    customer: z.string(),
    paidAmount: z.number(),
    notes: z.string(),
  }),
  execute: ({ id }) => ({
    id,
    status: "blocked" as const,
    customer: "Delta Kit Labs",
    paidAmount: 250,
    notes: "Payment review is complete, but warehouse allocation has not been confirmed.",
  }),
});

const issueRefund = createTool({
  name: "issue_refund",
  description: "Issue a customer refund. This changes account balance and requires approval.",
  input: z.object({
    orderId: z.string().describe("The order id to refund."),
    amount: z.number().positive().describe("The refund amount in USD."),
    reason: z.string().describe("The reason to record with the refund."),
  }),
  output: z.object({
    refundId: z.string(),
    orderId: z.string(),
    amount: z.number(),
    status: z.enum(["issued"]),
  }),
  execute: ({ orderId, amount }) => ({
    refundId: `rf_${orderId.toLowerCase()}`,
    orderId,
    amount,
    status: "issued" as const,
  }),
});

const approvalHook = createHook({
  onToolCall({ toolName }) {
    if (toolName === "issue_refund") {
      return requireApproval({
        reason: "Refunds require approval.",
        timeoutMs: 120_000,
        rejectMessage: "Refund request rejected in Aion Studio.",
        timeoutMessage: "Refund approval timed out.",
      });
    }

    return { type: "continue" };
  },
  onToolResult({ toolName, result }) {
    console.log("tool result:", toolName, result);
  },
});

const agentModel = client.completionModel("deepseek/deepseek-v4-pro");
const agent = new AgentBuilder("studio-support-operations", agentModel)
  .name("Studio Support Operations")
  .description("Handles operational order lookups and guarded refund actions.")
  .instructions(
    [
      "Use tools for private order data and refund operations.",
      "Look up an order before issuing a refund.",
      "Keep responses short and mention whether the refund was issued or denied.",
    ].join("\n"),
  )
  .tools([getOrder, issueRefund])
  .hook(approvalHook)
  .defaultMaxTurns(5)
  .build();

new Studio([agent]).start();
