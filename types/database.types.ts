export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          description: string
          id: number
          link: string | null
          location: string | null
          markdown: string | null
          modified_at: string | null
          modified_by: string | null
          note: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          description?: string
          id?: number
          link?: string | null
          location?: string | null
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          note?: string | null
          title?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string
          id?: number
          link?: string | null
          location?: string | null
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          note?: string | null
          title?: string
        }
        Relationships: []
      }
      games: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          name: string | null
          shorthand: string | null
          steam_id: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          name?: string | null
          shorthand?: string | null
          steam_id?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          name?: string | null
          shorthand?: string | null
          steam_id?: number | null
        }
        Relationships: []
      }
      gameservers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          description: string | null
          game: number | null
          id: number
          modified_at: string | null
          modified_by: string | null
          port: string | null
          region: Database["public"]["Enums"]["region"] | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          game?: number | null
          id?: number
          modified_at?: string | null
          modified_by?: string | null
          port?: string | null
          region?: Database["public"]["Enums"]["region"] | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          game?: number | null
          id?: number
          modified_at?: string | null
          modified_by?: string | null
          port?: string | null
          region?: Database["public"]["Enums"]["region"] | null
        }
        Relationships: [
          {
            foreignKeyName: "gameservers_game_fkey"
            columns: ["game"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          region: Database["public"]["Enums"]["region"] | null
          title: string | null
          type: Database["public"]["Enums"]["link_type"] | null
          url: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          region?: Database["public"]["Enums"]["region"] | null
          title?: string | null
          type?: Database["public"]["Enums"]["link_type"] | null
          url?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          region?: Database["public"]["Enums"]["region"] | null
          title?: string | null
          type?: Database["public"]["Enums"]["link_type"] | null
          url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          markdown: string | null
          modified_at: string | null
          modified_by: string | null
          nickname: string | null
          subtitle: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          id: string
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          nickname?: string | null
          subtitle?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          nickname?: string | null
          subtitle?: string | null
          title?: string | null
        }
        Relationships: []
      }
      referendum_votes: {
        Row: {
          choices: number[]
          comment: string | null
          created_at: string
          id: number
          modified_at: string | null
          referendum_id: number | null
          user_id: string
        }
        Insert: {
          choices?: number[]
          comment?: string | null
          created_at?: string
          id?: number
          modified_at?: string | null
          referendum_id?: number | null
          user_id?: string
        }
        Update: {
          choices?: number[]
          comment?: string | null
          created_at?: string
          id?: number
          modified_at?: string | null
          referendum_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referendum_votes_referendum_id_fkey"
            columns: ["referendum_id"]
            isOneToOne: false
            referencedRelation: "referendums"
            referencedColumns: ["id"]
          },
        ]
      }
      referendums: {
        Row: {
          choices: string[]
          created_at: string
          created_by: string
          date_end: string
          date_start: string
          description: string | null
          id: number
          modified_at: string
          modified_by: string | null
          multiple_choice: boolean
          title: string
        }
        Insert: {
          choices: string[]
          created_at?: string
          created_by?: string
          date_end: string
          date_start?: string
          description?: string | null
          id?: number
          modified_at?: string
          modified_by?: string | null
          multiple_choice?: boolean
          title: string
        }
        Update: {
          choices?: string[]
          created_at?: string
          created_by?: string
          date_end?: string
          date_start?: string
          description?: string | null
          id?: number
          modified_at?: string
          modified_by?: string | null
          multiple_choice?: boolean
          title?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: number
          permission: Database["public"]["Enums"]["app_permission"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          id?: number
          permission: Database["public"]["Enums"]["app_permission"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          id?: number
          permission?: Database["public"]["Enums"]["app_permission"]
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: number
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: number
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: number
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      authorize: {
        Args: {
          requested_permission: Database["public"]["Enums"]["app_permission"]
        }
        Returns: boolean
      }
      custom_access_token_hook: {
        Args: {
          event: Json
        }
        Returns: Json
      }
    }
    Enums: {
      app_permission:
        | "events.crud"
        | "games.crud"
        | "gameservers.crud"
        | "links.crud"
        | "profiles.crud"
        | "users.crud"
        | "referendums.crud"
      app_role: "admin" | "moderator"
      link_type: "irc" | "teamspeak" | "discord" | "website" | "steam"
      region: "eu" | "na" | "all"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
