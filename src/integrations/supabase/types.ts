export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      aptitude_attempts: {
        Row: {
          category: string
          country_code: string | null
          created_at: string
          id: string
          level: string
          score: number
          skill_input: string | null
          total: number
          user_id: string
        }
        Insert: {
          category: string
          country_code?: string | null
          created_at?: string
          id?: string
          level: string
          score: number
          skill_input?: string | null
          total: number
          user_id: string
        }
        Update: {
          category?: string
          country_code?: string | null
          created_at?: string
          id?: string
          level?: string
          score?: number
          skill_input?: string | null
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      country_stats: {
        Row: {
          country_code: string
          created_at: string
          fetched_at: string
          gdp_per_capita_usd: number | null
          informal_employment_pct: number | null
          labor_force_participation_pct: number | null
          secondary_enrollment_pct: number | null
          source_year: number | null
          updated_at: string
          youth_unemployment_pct: number | null
        }
        Insert: {
          country_code: string
          created_at?: string
          fetched_at?: string
          gdp_per_capita_usd?: number | null
          informal_employment_pct?: number | null
          labor_force_participation_pct?: number | null
          secondary_enrollment_pct?: number | null
          source_year?: number | null
          updated_at?: string
          youth_unemployment_pct?: number | null
        }
        Update: {
          country_code?: string
          created_at?: string
          fetched_at?: string
          gdp_per_capita_usd?: number | null
          informal_employment_pct?: number | null
          labor_force_participation_pct?: number | null
          secondary_enrollment_pct?: number | null
          source_year?: number | null
          updated_at?: string
          youth_unemployment_pct?: number | null
        }
        Relationships: []
      }
      portfolio_projects: {
        Row: {
          completed_on: string | null
          created_at: string
          description: string | null
          evidence_paths: string[]
          external_link: string | null
          id: string
          is_public: boolean
          reflection: string | null
          sdg_number: number | null
          share_slug: string | null
          skill_focus: string | null
          skill_tags: string[]
          started_on: string | null
          status: Database["public"]["Enums"]["portfolio_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_on?: string | null
          created_at?: string
          description?: string | null
          evidence_paths?: string[]
          external_link?: string | null
          id?: string
          is_public?: boolean
          reflection?: string | null
          sdg_number?: number | null
          share_slug?: string | null
          skill_focus?: string | null
          skill_tags?: string[]
          started_on?: string | null
          status?: Database["public"]["Enums"]["portfolio_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_on?: string | null
          created_at?: string
          description?: string | null
          evidence_paths?: string[]
          external_link?: string | null
          id?: string
          is_public?: boolean
          reflection?: string | null
          sdg_number?: number | null
          share_slug?: string | null
          skill_focus?: string | null
          skill_tags?: string[]
          started_on?: string | null
          status?: Database["public"]["Enums"]["portfolio_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          country_code: string | null
          created_at: string
          discoverable: boolean
          display_name: string | null
          id: string
          organization: string | null
          role: Database["public"]["Enums"]["app_account_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          discoverable?: boolean
          display_name?: string | null
          id?: string
          organization?: string | null
          role?: Database["public"]["Enums"]["app_account_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          discoverable?: boolean
          display_name?: string | null
          id?: string
          organization?: string | null
          role?: Database["public"]["Enums"]["app_account_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recruit_postings: {
        Row: {
          country_code: string | null
          created_at: string
          description: string | null
          external_link: string | null
          id: string
          isco_group: number | null
          kind: Database["public"]["Enums"]["recruit_posting_kind"]
          organization: string | null
          required_skills: string[]
          seniority: string | null
          status: Database["public"]["Enums"]["recruit_posting_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          description?: string | null
          external_link?: string | null
          id?: string
          isco_group?: number | null
          kind?: Database["public"]["Enums"]["recruit_posting_kind"]
          organization?: string | null
          required_skills?: string[]
          seniority?: string | null
          status?: Database["public"]["Enums"]["recruit_posting_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          description?: string | null
          external_link?: string | null
          id?: string
          isco_group?: number | null
          kind?: Database["public"]["Enums"]["recruit_posting_kind"]
          organization?: string | null
          required_skills?: string[]
          seniority?: string | null
          status?: Database["public"]["Enums"]["recruit_posting_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_comparisons: {
        Row: {
          country_a: string
          country_b: string
          created_at: string
          delta_mode: string
          id: string
          install_id: string
          name: string | null
        }
        Insert: {
          country_a: string
          country_b: string
          created_at?: string
          delta_mode?: string
          id?: string
          install_id: string
          name?: string | null
        }
        Update: {
          country_a?: string
          country_b?: string
          created_at?: string
          delta_mode?: string
          id?: string
          install_id?: string
          name?: string | null
        }
        Relationships: []
      }
      saved_grow_items: {
        Row: {
          city: string | null
          country_code: string | null
          created_at: string
          gap_area: string | null
          id: string
          kind: Database["public"]["Enums"]["saved_grow_kind"]
          label: string
          notes: string | null
          payload: Json
          recommendation: string | null
          sdg_number: number | null
          sdg_title: string | null
          skill_focus: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          gap_area?: string | null
          id?: string
          kind: Database["public"]["Enums"]["saved_grow_kind"]
          label: string
          notes?: string | null
          payload?: Json
          recommendation?: string | null
          sdg_number?: number | null
          sdg_title?: string | null
          skill_focus?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          gap_area?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["saved_grow_kind"]
          label?: string
          notes?: string | null
          payload?: Json
          recommendation?: string | null
          sdg_number?: number | null
          sdg_title?: string | null
          skill_focus?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_skill_categories: {
        Row: {
          created_at: string
          id: string
          label: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_skill_ratings: {
        Row: {
          category: string
          country_code: string | null
          created_at: string
          id: string
          notes: string | null
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          country_code?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          country_code?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_saved_comparison: {
        Args: { _id: string; _install_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_account_role: "individual" | "policymaker"
      portfolio_status: "planned" | "in_progress" | "done"
      recruit_posting_kind: "role" | "project"
      recruit_posting_status: "active" | "closed"
      saved_grow_kind: "search" | "recommendation"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_account_role: ["individual", "policymaker"],
      portfolio_status: ["planned", "in_progress", "done"],
      recruit_posting_kind: ["role", "project"],
      recruit_posting_status: ["active", "closed"],
      saved_grow_kind: ["search", "recommendation"],
    },
  },
} as const
