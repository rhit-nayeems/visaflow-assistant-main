import type { Database as GeneratedDatabase, Json } from "./types";

// Additive RPC contract until types can be regenerated from the restored project.
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Functions"> & {
    Functions: GeneratedDatabase["public"]["Functions"] & {
      update_case_details: {
        Args: {
          p_case_id: string;
          p_expected_updated_at: string;
          p_details: Json;
          p_next_status: GeneratedDatabase["public"]["Enums"]["case_status"];
          p_requirements: Json;
        };
        Returns: undefined;
      };
    };
  };
};
