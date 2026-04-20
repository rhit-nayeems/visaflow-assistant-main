export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action_type: string;
          actor_id: string;
          case_id: string;
          created_at: string;
          field_name: string | null;
          id: string;
          new_value: string | null;
          old_value: string | null;
          reason: string | null;
        };
        Insert: {
          action_type: string;
          actor_id: string;
          case_id: string;
          created_at?: string;
          field_name?: string | null;
          id?: string;
          new_value?: string | null;
          old_value?: string | null;
          reason?: string | null;
        };
        Update: {
          action_type?: string;
          actor_id?: string;
          case_id?: string;
          created_at?: string;
          field_name?: string | null;
          id?: string;
          new_value?: string | null;
          old_value?: string | null;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      case_notes: {
        Row: {
          case_id: string;
          content: string;
          created_at: string;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          case_id: string;
          content: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          case_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "case_notes_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      case_requirements: {
        Row: {
          case_id: string;
          created_at: string;
          explanation: string | null;
          id: string;
          label: string;
          requirement_key: string;
          severity: Database["public"]["Enums"]["requirement_severity"];
          source: string | null;
          status: Database["public"]["Enums"]["requirement_status"];
          updated_at: string;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          label: string;
          requirement_key: string;
          severity?: Database["public"]["Enums"]["requirement_severity"];
          source?: string | null;
          status?: Database["public"]["Enums"]["requirement_status"];
          updated_at?: string;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          label?: string;
          requirement_key?: string;
          severity?: Database["public"]["Enums"]["requirement_severity"];
          source?: string | null;
          status?: Database["public"]["Enums"]["requirement_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "case_requirements_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      case_timeline_events: {
        Row: {
          case_id: string;
          created_at: string;
          description: string | null;
          event_type: string;
          id: string;
          metadata_json: Json | null;
          title: string;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          description?: string | null;
          event_type: string;
          id?: string;
          metadata_json?: Json | null;
          title: string;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          description?: string | null;
          event_type?: string;
          id?: string;
          metadata_json?: Json | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "case_timeline_events_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      cases: {
        Row: {
          case_summary: string | null;
          created_at: string;
          employer_name: string | null;
          end_date: string | null;
          id: string;
          needs_document_reevaluation: boolean;
          process_type: string;
          risk_level: string | null;
          role_title: string | null;
          school_template_id: string | null;
          start_date: string | null;
          status: Database["public"]["Enums"]["case_status"];
          updated_at: string;
          user_id: string;
          work_location: string | null;
        };
        Insert: {
          case_summary?: string | null;
          created_at?: string;
          employer_name?: string | null;
          end_date?: string | null;
          id?: string;
          needs_document_reevaluation?: boolean;
          process_type?: string;
          risk_level?: string | null;
          role_title?: string | null;
          school_template_id?: string | null;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["case_status"];
          updated_at?: string;
          user_id: string;
          work_location?: string | null;
        };
        Update: {
          case_summary?: string | null;
          created_at?: string;
          employer_name?: string | null;
          end_date?: string | null;
          id?: string;
          needs_document_reevaluation?: boolean;
          process_type?: string;
          risk_level?: string | null;
          role_title?: string | null;
          school_template_id?: string | null;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["case_status"];
          updated_at?: string;
          user_id?: string;
          work_location?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cases_school_template_id_fkey";
            columns: ["school_template_id"];
            isOneToOne: false;
            referencedRelation: "school_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          case_id: string;
          created_at: string;
          document_type: string;
          file_name: string;
          file_path: string;
          id: string;
          upload_registration_id: string;
          upload_status: string;
          version_number: number;
        };
        Insert: {
          case_id: string;
          created_at?: string;
          document_type?: string;
          file_name: string;
          file_path: string;
          id?: string;
          upload_registration_id: string;
          upload_status?: string;
          version_number?: number;
        };
        Update: {
          case_id?: string;
          created_at?: string;
          document_type?: string;
          file_name?: string;
          file_path?: string;
          id?: string;
          upload_registration_id?: string;
          upload_status?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "documents_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      extracted_fields: {
        Row: {
          confidence_score: number | null;
          created_at: string;
          document_id: string;
          field_name: string;
          field_value: string | null;
          id: string;
          manually_corrected: boolean;
        };
        Insert: {
          confidence_score?: number | null;
          created_at?: string;
          document_id: string;
          field_name: string;
          field_value?: string | null;
          id?: string;
          manually_corrected?: boolean;
        };
        Update: {
          confidence_score?: number | null;
          created_at?: string;
          document_id?: string;
          field_name?: string;
          field_value?: string | null;
          id?: string;
          manually_corrected?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "extracted_fields_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          case_id: string | null;
          created_at: string;
          id: string;
          read: boolean;
          scheduled_for: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          case_id?: string | null;
          created_at?: string;
          id?: string;
          read?: boolean;
          scheduled_for?: string | null;
          title: string;
          type?: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          case_id?: string | null;
          created_at?: string;
          id?: string;
          read?: boolean;
          scheduled_for?: string | null;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "cases";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          degree_level: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          major: string | null;
          university_name: string | null;
          updated_at: string;
          user_id: string;
          visa_type: string | null;
        };
        Insert: {
          created_at?: string;
          degree_level?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          major?: string | null;
          university_name?: string | null;
          updated_at?: string;
          user_id: string;
          visa_type?: string | null;
        };
        Update: {
          created_at?: string;
          degree_level?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          major?: string | null;
          university_name?: string | null;
          updated_at?: string;
          user_id?: string;
          visa_type?: string | null;
        };
        Relationships: [];
      };
      school_templates: {
        Row: {
          config_json: Json;
          created_at: string;
          id: string;
          is_active: boolean;
          process_type: string;
          school_id: string;
          version: number;
        };
        Insert: {
          config_json?: Json;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          process_type?: string;
          school_id: string;
          version?: number;
        };
        Update: {
          config_json?: Json;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          process_type?: string;
          school_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "school_templates_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          active: boolean;
          country: string;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          active?: boolean;
          country?: string;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          active?: boolean;
          country?: string;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_reviewer_case_decision: {
        Args: {
          p_case_id: string;
          p_next_status: Database["public"]["Enums"]["case_status"];
          p_reviewer_comment: string | null;
        };
        Returns: {
          case_id: string;
          next_status: Database["public"]["Enums"]["case_status"];
          previous_status: Database["public"]["Enums"]["case_status"];
        }[];
      };
      finalize_case_requirement_evaluation: {
        Args: {
          p_case_id: string;
          p_next_status: Database["public"]["Enums"]["case_status"];
          p_requirements?: Json;
        };
        Returns: undefined;
      };
      register_case_document: {
        Args: {
          p_case_id: string;
          p_document_type: string;
          p_file_name: string;
          p_file_path: string;
          p_upload_registration_id: string;
        };
        Returns: {
          case_id: string;
          created_at: string;
          created_new: boolean;
          document_type: string;
          file_name: string;
          file_path: string;
          id: string;
          upload_registration_id: string;
          upload_status: string;
          version_number: number;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "student" | "school_admin" | "advisor" | "employer";
      case_status:
        | "draft"
        | "missing_documents"
        | "in_progress"
        | "blocked"
        | "ready_for_submission"
        | "submitted"
        | "approved"
        | "denied"
        | "change_pending"
        | "completed";
      requirement_severity: "blocker" | "warning" | "info";
      requirement_status: "pending" | "met" | "not_met" | "waived";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["student", "school_admin", "advisor", "employer"],
      case_status: [
        "draft",
        "missing_documents",
        "in_progress",
        "blocked",
        "ready_for_submission",
        "submitted",
        "approved",
        "denied",
        "change_pending",
        "completed",
      ],
      requirement_severity: ["blocker", "warning", "info"],
      requirement_status: ["pending", "met", "not_met", "waived"],
    },
  },
} as const;
