export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_artifacts: {
        Row: {
          approved_by: string | null
          artifact_type: string
          block_id: string | null
          chapter_id: string | null
          course_id: string | null
          created_at: string
          created_by: string
          id: string
          model: string | null
          output: Json
          prompt: string
          provider: string
          source_context: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          artifact_type: string
          block_id?: string | null
          chapter_id?: string | null
          course_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          model?: string | null
          output: Json
          prompt: string
          provider: string
          source_context?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          artifact_type?: string
          block_id?: string | null
          chapter_id?: string | null
          course_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          model?: string | null
          output?: Json
          prompt?: string
          provider?: string
          source_context?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_artifacts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_keys: {
        Row: {
          api_key: string
          model: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          api_key: string
          model?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          model?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          active_provider: string
          id: number
          updated_at: string
        }
        Insert: {
          active_provider?: string
          id?: number
          updated_at?: string
        }
        Update: {
          active_provider?: string
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      annotations: {
        Row: {
          annotation_type: string
          author_id: string | null
          block_id: string
          chapter_id: string
          coord_space: string
          course_id: string
          course_version_id: string | null
          created_against_hash: string | null
          created_at: string
          data: Json
          id: string
          lecture_session_id: string
          scope: string
          style: Json
          updated_at: string
        }
        Insert: {
          annotation_type: string
          author_id?: string | null
          block_id: string
          chapter_id: string
          coord_space?: string
          course_id: string
          course_version_id?: string | null
          created_against_hash?: string | null
          created_at?: string
          data?: Json
          id?: string
          lecture_session_id: string
          scope?: string
          style?: Json
          updated_at?: string
        }
        Update: {
          annotation_type?: string
          author_id?: string | null
          block_id?: string
          chapter_id?: string
          coord_space?: string
          course_id?: string
          course_version_id?: string | null
          created_against_hash?: string | null
          created_at?: string
          data?: Json
          id?: string
          lecture_session_id?: string
          scope?: string
          style?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "annotations_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annotations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annotations_course_version_id_fkey"
            columns: ["course_version_id"]
            isOneToOne: false
            referencedRelation: "course_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annotations_lecture_session_id_fkey"
            columns: ["lecture_session_id"]
            isOneToOne: false
            referencedRelation: "lecture_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      app_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          alt_text: string | null
          caption: string | null
          course_id: string | null
          created_at: string
          id: string
          kind: string | null
          metadata: Json | null
          storage_path: string | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          kind?: string | null
          metadata?: Json | null
          storage_path?: string | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          kind?: string | null
          metadata?: Json | null
          storage_path?: string | null
        }
        Relationships: []
      }
      chapters: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          order_index: number
          slug: string
          source: string
          title: string
          updated_at: string
          version_id: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          order_index?: number
          slug: string
          source?: string
          title: string
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          order_index?: number
          slug?: string
          source?: string
          title?: string
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      content_blocks: {
        Row: {
          block_type: string
          chapter_id: string | null
          content_hash: string | null
          course_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          order_index: number
          source_range: Json | null
          updated_at: string
          version_id: string | null
          visibility: string
        }
        Insert: {
          block_type: string
          chapter_id?: string | null
          content_hash?: string | null
          course_id?: string | null
          created_at?: string
          id: string
          metadata?: Json | null
          order_index?: number
          source_range?: Json | null
          updated_at?: string
          version_id?: string | null
          visibility?: string
        }
        Update: {
          block_type?: string
          chapter_id?: string | null
          content_hash?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          order_index?: number
          source_range?: Json | null
          updated_at?: string
          version_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_blocks_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      course_members: {
        Row: {
          course_id: string
          role: string
          user_id: string
        }
        Insert: {
          course_id: string
          role: string
          user_id: string
        }
        Update: {
          course_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_members_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_versions: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          label: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          label?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_versions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          current_version_id: string | null
          description: string | null
          id: string
          owner_id: string | null
          subtitle: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          description?: string | null
          id?: string
          owner_id?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          description?: string | null
          id?: string
          owner_id?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      lecture_sessions: {
        Row: {
          chapter_id: string
          course_id: string
          created_at: string | null
          created_by: string | null
          ended_at: string | null
          id: string
          published: boolean
          started_at: string | null
          status: string
          title: string
        }
        Insert: {
          chapter_id: string
          course_id: string
          created_at?: string | null
          created_by?: string | null
          ended_at?: string | null
          id?: string
          published?: boolean
          started_at?: string | null
          status?: string
          title: string
        }
        Update: {
          chapter_id?: string
          course_id?: string
          created_at?: string | null
          created_by?: string | null
          ended_at?: string | null
          id?: string
          published?: boolean
          started_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecture_sessions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecture_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_app_admin: { Args: never; Returns: boolean }
      is_course_member: {
        Args: { p_course_id: string; p_roles?: string[] }
        Returns: boolean
      }
      is_course_readable: { Args: { p_course_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

