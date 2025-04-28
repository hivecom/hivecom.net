export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      containers: {
        Row: {
          created_at: string
          healthy: boolean | null
          name: string
          reported_at: string
          running: boolean
          server: number | null
          started_at: string | null
        }
        Insert: {
          created_at?: string
          healthy?: boolean | null
          name: string
          reported_at: string
          running: boolean
          server?: number | null
          started_at?: string | null
        }
        Update: {
          created_at?: string
          healthy?: boolean | null
          name?: string
          reported_at?: string
          running?: boolean
          server?: number | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'gameserver_containers_server_fkey'
            columns: ['server']
            isOneToOne: false
            referencedRelation: 'servers'
            referencedColumns: ['id']
          },
        ]
      }
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
      expenses: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          description: string | null
          ended_at: string | null
          id: number
          modified_by: string | null
          name: string | null
          started_at: string
          url: string | null
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          ended_at?: string | null
          id?: number
          modified_by?: string | null
          name?: string | null
          started_at?: string
          url?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          ended_at?: string | null
          id?: number
          modified_by?: string | null
          name?: string | null
          started_at?: string
          url?: string | null
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
          addresses: string[] | null
          admininstrator: string | null
          container: string | null
          created_at: string
          created_by: string | null
          description: string | null
          game: number | null
          id: number
          markdown: string | null
          modified_at: string | null
          modified_by: string | null
          name: string
          port: string | null
          region: Database['public']['Enums']['region'] | null
        }
        Insert: {
          addresses?: string[] | null
          admininstrator?: string | null
          container?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          game?: number | null
          id?: number
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          name?: string
          port?: string | null
          region?: Database['public']['Enums']['region'] | null
        }
        Update: {
          addresses?: string[] | null
          admininstrator?: string | null
          container?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          game?: number | null
          id?: number
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          name?: string
          port?: string | null
          region?: Database['public']['Enums']['region'] | null
        }
        Relationships: [
          {
            foreignKeyName: 'gameservers_container_fkey'
            columns: ['container']
            isOneToOne: false
            referencedRelation: 'containers'
            referencedColumns: ['name']
          },
          {
            foreignKeyName: 'gameservers_game_fkey'
            columns: ['game']
            isOneToOne: false
            referencedRelation: 'games'
            referencedColumns: ['id']
          },
        ]
      }
      monthly_funding: {
        Row: {
          donation_count: number
          donation_lifetime_amount_cents: number
          donation_month_amount_cents: number
          month: string
          patreon_count: number
          patreon_lifetime_amount_cents: number
          patreon_month_amount_cents: number
        }
        Insert: {
          donation_count?: number
          donation_lifetime_amount_cents?: number
          donation_month_amount_cents?: number
          month?: string
          patreon_count?: number
          patreon_lifetime_amount_cents?: number
          patreon_month_amount_cents?: number
        }
        Update: {
          donation_count?: number
          donation_lifetime_amount_cents?: number
          donation_month_amount_cents?: number
          month?: string
          patreon_count?: number
          patreon_lifetime_amount_cents?: number
          patreon_month_amount_cents?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          discord_id: string | null
          id: string
          markdown: string | null
          modified_at: string | null
          modified_by: string | null
          patreon_id: string | null
          subtitle: string | null
          supporter_lifetime: boolean
          supporter_patreon: boolean
          title: string | null
          username: string
        }
        Insert: {
          created_at?: string
          discord_id?: string | null
          id: string
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          patreon_id?: string | null
          subtitle?: string | null
          supporter_lifetime?: boolean
          supporter_patreon?: boolean
          title?: string | null
          username: string
        }
        Update: {
          created_at?: string
          discord_id?: string | null
          id?: string
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          patreon_id?: string | null
          subtitle?: string | null
          supporter_lifetime?: boolean
          supporter_patreon?: boolean
          title?: string | null
          username?: string
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
            foreignKeyName: 'referendum_votes_referendum_id_fkey'
            columns: ['referendum_id']
            isOneToOne: false
            referencedRelation: 'referendums'
            referencedColumns: ['id']
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
          permission: Database['public']['Enums']['app_permission']
          role: Database['public']['Enums']['app_role']
        }
        Insert: {
          id?: number
          permission: Database['public']['Enums']['app_permission']
          role: Database['public']['Enums']['app_role']
        }
        Update: {
          id?: number
          permission?: Database['public']['Enums']['app_permission']
          role?: Database['public']['Enums']['app_role']
        }
        Relationships: []
      }
      servers: {
        Row: {
          active: boolean
          address: string
          created_at: string
          docker_control: boolean
          docker_control_port: number | null
          docker_control_secure: boolean
          docker_control_subdomain: string | null
          id: number
        }
        Insert: {
          active: boolean
          address: string
          created_at?: string
          docker_control?: boolean
          docker_control_port?: number | null
          docker_control_secure?: boolean
          docker_control_subdomain?: string | null
          id?: number
        }
        Update: {
          active?: boolean
          address?: string
          created_at?: string
          docker_control?: boolean
          docker_control_port?: number | null
          docker_control_secure?: boolean
          docker_control_subdomain?: string | null
          id?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: number
          role: Database['public']['Enums']['app_role']
          user_id: string
        }
        Insert: {
          id?: number
          role: Database['public']['Enums']['app_role']
          user_id: string
        }
        Update: {
          id?: number
          role?: Database['public']['Enums']['app_role']
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
          requested_permission: Database['public']['Enums']['app_permission']
        }
        Returns: boolean
      }
      custom_access_token_hook: {
        Args: { event: Json }
        Returns: Json
      }
      generate_username: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      app_permission:
        | 'events.crud'
        | 'games.crud'
        | 'gameservers.crud'
        | 'funding.crud'
        | 'profiles.crud'
        | 'users.crud'
        | 'referendums.crud'
        | 'servers.crud'
        | 'expenses.crud'
        | 'containers.crud'
      app_role: 'admin' | 'moderator'
      region: 'eu' | 'na' | 'all'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
  | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
    Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
      ? R
      : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
    DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
      DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
        ? R
        : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema['Tables']
  | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
    Insert: infer I
  }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema['Tables']
  | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
    Update: infer U
  }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema['Enums']
  | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema['CompositeTypes']
  | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_permission: [
        'events.crud',
        'games.crud',
        'gameservers.crud',
        'funding.crud',
        'profiles.crud',
        'users.crud',
        'referendums.crud',
        'servers.crud',
        'expenses.crud',
        'containers.crud',
      ],
      app_role: ['admin', 'moderator'],
      region: ['eu', 'na', 'all'],
    },
  },
} as const
