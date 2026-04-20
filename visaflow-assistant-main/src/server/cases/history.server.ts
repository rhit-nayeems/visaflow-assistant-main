import type {
  AuditLogInsert,
  CaseStatus,
  CaseWorkflowContext,
  TimelineEventInsert,
} from "./types.ts";

interface StatusHistoryInput {
  caseId: string;
  previousStatus: CaseStatus;
  nextStatus: CaseStatus;
  description: string;
  reason: string;
}

const logHistoryWriteFailure = (operation: string, error: unknown) => {
  console.error(`[case-history] ${operation} failed`, error);
};

export const writeCaseTimelineEvent = async (
  context: CaseWorkflowContext,
  event: TimelineEventInsert,
) => {
  const { error } = await context.supabase.from("case_timeline_events").insert(event);

  if (error) {
    throw new Error(error.message);
  }
};

export const writeCaseAuditLog = async (
  context: CaseWorkflowContext,
  entry: AuditLogInsert,
) => {
  const { error } = await context.supabase.from("audit_logs").insert(entry);

  if (error) {
    throw new Error(error.message);
  }
};

export const writeStatusChangeHistory = async (
  context: CaseWorkflowContext,
  input: StatusHistoryInput,
) => {
  const statusLabel = input.nextStatus.replace(/_/g, " ");

  await Promise.all([
    writeCaseTimelineEvent(context, {
      case_id: input.caseId,
      event_type: "status_changed",
      title: `Status changed to ${statusLabel}`,
      description: input.description,
    }),
    writeCaseAuditLog(context, {
      case_id: input.caseId,
      actor_id: context.userId,
      action_type: "status_changed",
      field_name: "status",
      old_value: input.previousStatus,
      new_value: input.nextStatus,
      reason: input.reason,
    }),
  ]);
};

export const writeCaseTimelineEventBestEffort = async (
  context: CaseWorkflowContext,
  event: TimelineEventInsert,
) => {
  try {
    await writeCaseTimelineEvent(context, event);
  } catch (error) {
    logHistoryWriteFailure(`timeline event ${event.event_type} for case ${event.case_id}`, error);
  }
};

export const writeStatusChangeHistoryBestEffort = async (
  context: CaseWorkflowContext,
  input: StatusHistoryInput,
) => {
  try {
    await writeStatusChangeHistory(context, input);
  } catch (error) {
    logHistoryWriteFailure(`status history for case ${input.caseId}`, error);
  }
};
