import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "../../integrations/supabase/types.ts";

export type CaseSupabaseClient = SupabaseClient<Database>;

export interface CaseWorkflowContext {
  supabase: CaseSupabaseClient;
  userId: string;
}

export type CaseRecord = Tables<"cases">;
export type CaseStatus = CaseRecord["status"];
export type CaseInsert = TablesInsert<"cases">;
export type CaseUpdate = TablesUpdate<"cases">;
export type DocumentRecord = Tables<"documents">;
export type DocumentInsert = TablesInsert<"documents">;
export type DocumentUpdate = TablesUpdate<"documents">;
export type DocumentExtractionStatus = "pending" | "processing" | "succeeded" | "failed";
export type ExtractedFieldRecord = Tables<"extracted_fields">;
export type CaseNoteRecord = Tables<"case_notes">;
export type CaseNoteInsert = TablesInsert<"case_notes">;
export type RequirementInsert = TablesInsert<"case_requirements">;
export type TimelineEventInsert = TablesInsert<"case_timeline_events">;
export type AuditLogInsert = TablesInsert<"audit_logs">;
