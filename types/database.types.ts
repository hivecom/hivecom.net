export type Json
  = | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '12.2.3 (519615d)'
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: number
          link: string | null
          markdown: string
          modified_at: string | null
          modified_by: string | null
          pinned: boolean
          published_at: string
          tags: string[] | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: number
          link?: string | null
          markdown: string
          modified_at?: string | null
          modified_by?: string | null
          pinned?: boolean
          published_at?: string
          tags?: string[] | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: number
          link?: string | null
          markdown?: string
          modified_at?: string | null
          modified_by?: string | null
          pinned?: boolean
          published_at?: string
          tags?: string[] | null
          title?: string
        }
        Relationships: []
      }
      complaints: {
        Row: {
          acknowledged: boolean
          context_gameserver: number | null
          context_user: string | null
          created_at: string
          created_by: string
          id: number
          message: string
          responded_at: string | null
          responded_by: string | null
          response: string | null
        }
        Insert: {
          acknowledged?: boolean
          context_gameserver?: number | null
          context_user?: string | null
          created_at?: string
          created_by: string
          id?: number
          message: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
        }
        Update: {
          acknowledged?: boolean
          context_gameserver?: number | null
          context_user?: string | null
          created_at?: string
          created_by?: string
          id?: number
          message?: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'complaints_context_gameserver_fkey'
            columns: ['context_gameserver']
            isOneToOne: false
            referencedRelation: 'gameservers'
            referencedColumns: ['id']
          },
        ]
      }
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
          duration_minutes: number | null
          games: number[] | null
          google_event_id: string | null
          google_last_synced_at: string | null
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
          duration_minutes?: number | null
          games?: number[] | null
          google_event_id?: string | null
          google_last_synced_at?: string | null
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
          duration_minutes?: number | null
          games?: number[] | null
          google_event_id?: string | null
          google_last_synced_at?: string | null
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
      events_rsvps: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: number
          id: number
          modified_at: string | null
          modified_by: string | null
          rsvp: Database['public']['Enums']['events_rsvp_status']
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: number
          id?: number
          modified_at?: string | null
          modified_by?: string | null
          rsvp: Database['public']['Enums']['events_rsvp_status']
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: number
          id?: number
          modified_at?: string | null
          modified_by?: string | null
          rsvp?: Database['public']['Enums']['events_rsvp_status']
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'events_rsvps_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          description: string | null
          ended_at: string | null
          id: number
          modified_at: string | null
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
          modified_at?: string | null
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
          modified_at?: string | null
          modified_by?: string | null
          name?: string | null
          started_at?: string
          url?: string | null
        }
        Relationships: []
      }
      friends: {
        Row: {
          created_at: string
          friend: string
          friender: string
          id: number
        }
        Insert: {
          created_at?: string
          friend: string
          friender: string
          id?: number
        }
        Update: {
          created_at?: string
          friend?: string
          friender?: string
          id?: number
        }
        Relationships: []
      }
      games: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          modified_at: string | null
          modified_by: string | null
          name: string | null
          shorthand: string | null
          steam_id: number | null
          website: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          modified_at?: string | null
          modified_by?: string | null
          name?: string | null
          shorthand?: string | null
          steam_id?: number | null
          website?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          modified_at?: string | null
          modified_by?: string | null
          name?: string | null
          shorthand?: string | null
          steam_id?: number | null
          website?: string | null
        }
        Relationships: []
      }
      gameservers: {
        Row: {
          addresses: string[] | null
          administrator: string | null
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
          administrator?: string | null
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
          administrator?: string | null
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
          ban_end: string | null
          ban_reason: string | null
          ban_start: string | null
          banned: boolean
          badges: Database['public']['Enums']['profile_badge'][]
          birthday: string | null
          country: string | null
          created_at: string
          discord_id: string | null
          id: string
          introduction: string | null
          last_seen: string
          markdown: string | null
          modified_at: string | null
          modified_by: string | null
          patreon_id: string | null
          steam_id: string | null
          supporter_lifetime: boolean
          supporter_patreon: boolean
          username: string
          username_set: boolean
          website: string | null
        }
        Insert: {
          ban_end?: string | null
          ban_reason?: string | null
          ban_start?: string | null
          banned?: boolean
          badges?: Database['public']['Enums']['profile_badge'][]
          birthday?: string | null
          country?: string | null
          created_at?: string
          discord_id?: string | null
          id: string
          introduction?: string | null
          last_seen?: string
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          patreon_id?: string | null
          steam_id?: string | null
          supporter_lifetime?: boolean
          supporter_patreon?: boolean
          username: string
          username_set?: boolean
          website?: string | null
        }
        Update: {
          ban_end?: string | null
          ban_reason?: string | null
          ban_start?: string | null
          banned?: boolean
          badges?: Database['public']['Enums']['profile_badge'][]
          birthday?: string | null
          country?: string | null
          created_at?: string
          discord_id?: string | null
          id?: string
          introduction?: string | null
          last_seen?: string
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          patreon_id?: string | null
          steam_id?: string | null
          supporter_lifetime?: boolean
          supporter_patreon?: boolean
          username?: string
          username_set?: boolean
          website?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          github: string | null
          id: number
          link: string | null
          markdown: string
          modified_at: string | null
          modified_by: string | null
          owner: string | null
          tags: string[] | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          description?: string | null
          github?: string | null
          id?: number
          link?: string | null
          markdown: string
          modified_at?: string | null
          modified_by?: string | null
          owner?: string | null
          tags?: string[] | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          github?: string | null
          id?: number
          link?: string | null
          markdown?: string
          modified_at?: string | null
          modified_by?: string | null
          owner?: string | null
          tags?: string[] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'projects_owner_fkey'
            columns: ['owner']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
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
          created_by: string | null
          docker_control: boolean
          docker_control_port: number | null
          docker_control_secure: boolean
          docker_control_subdomain: string | null
          id: number
          modified_at: string | null
          modified_by: string | null
        }
        Insert: {
          active: boolean
          address: string
          created_at?: string
          created_by?: string | null
          docker_control?: boolean
          docker_control_port?: number | null
          docker_control_secure?: boolean
          docker_control_subdomain?: string | null
          id?: number
          modified_at?: string | null
          modified_by?: string | null
        }
        Update: {
          active?: boolean
          address?: string
          created_at?: string
          created_by?: string | null
          docker_control?: boolean
          docker_control_port?: number | null
          docker_control_secure?: boolean
          docker_control_subdomain?: string | null
          id?: number
          modified_at?: string | null
          modified_by?: string | null
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
      audit_fields_unchanged: {
        Args: { created_at: string, created_by: string }
        Returns: boolean
      }
      authorize: {
        Args: {
          requested_permission: Database['public']['Enums']['app_permission']
        }
        Returns: boolean
      }
      contains_html_tags: { Args: { input_text: string }, Returns: boolean }
      custom_access_token_hook: { Args: { event: Json }, Returns: Json }
      event_rsvp_window_open: {
        Args: { target_event_id: number }
        Returns: boolean
      }
      generate_username: { Args: never, Returns: string }
      get_user_emails: {
        Args: never
        Returns: {
          email: string
          user_id: string
        }[]
      }
      has_permission: {
        Args: { permission_name: Database['public']['Enums']['app_permission'] }
        Returns: boolean
      }
      is_owner: { Args: { record_user_id: string }, Returns: boolean }
      is_profile_owner: { Args: { profile_id: string }, Returns: boolean }
      update_user_last_seen: { Args: { user_id?: string }, Returns: undefined }
      validate_github_repo: { Args: { github_repo: string }, Returns: boolean }
      validate_tag_format: { Args: { tag: string }, Returns: boolean }
      validate_tags_array: { Args: { tags: string[] }, Returns: boolean }
    }
    Enums: {
      app_permission:
        | 'announcements.create'
        | 'announcements.delete'
        | 'announcements.read'
        | 'announcements.update'
        | 'complaints.create'
        | 'complaints.delete'
        | 'complaints.read'
        | 'complaints.update'
        | 'containers.create'
        | 'containers.delete'
        | 'containers.read'
        | 'containers.update'
        | 'events.create'
        | 'events.delete'
        | 'events.read'
        | 'events.update'
        | 'expenses.create'
        | 'expenses.delete'
        | 'expenses.read'
        | 'expenses.update'
        | 'forums.create'
        | 'forums.delete'
        | 'forums.read'
        | 'forums.update'
        | 'funding.create'
        | 'funding.delete'
        | 'funding.read'
        | 'funding.update'
        | 'games.create'
        | 'games.delete'
        | 'games.read'
        | 'games.update'
        | 'gameservers.create'
        | 'gameservers.delete'
        | 'gameservers.read'
        | 'gameservers.update'
        | 'profiles.delete'
        | 'profiles.read'
        | 'profiles.update'
        | 'referendums.create'
        | 'referendums.delete'
        | 'referendums.read'
        | 'referendums.update'
        | 'roles.create'
        | 'roles.delete'
        | 'roles.read'
        | 'roles.update'
        | 'servers.create'
        | 'servers.delete'
        | 'servers.read'
        | 'servers.update'
        | 'users.create'
        | 'users.delete'
        | 'users.read'
        | 'users.update'
        | 'projects.read'
        | 'projects.create'
        | 'projects.update'
        | 'projects.delete'
      app_role: 'admin' | 'moderator'
      events_rsvp_status: 'yes' | 'no' | 'tentative'
      profile_badge: 'builder' | 'earlybird' | 'founder' | 'host'
      region: 'eu' | 'na' | 'all'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
      & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
      ? R
      : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables']
    & DefaultSchema['Views'])
    ? (DefaultSchema['Tables']
      & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
        ? R
        : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema['Tables']
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
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
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
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
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema['CompositeTypes']
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_permission: [
        'announcements.create',
        'announcements.delete',
        'announcements.read',
        'announcements.update',
        'complaints.create',
        'complaints.delete',
        'complaints.read',
        'complaints.update',
        'containers.create',
        'containers.delete',
        'containers.read',
        'containers.update',
        'events.create',
        'events.delete',
        'events.read',
        'events.update',
        'expenses.create',
        'expenses.delete',
        'expenses.read',
        'expenses.update',
        'forums.create',
        'forums.delete',
        'forums.read',
        'forums.update',
        'funding.create',
        'funding.delete',
        'funding.read',
        'funding.update',
        'games.create',
        'games.delete',
        'games.read',
        'games.update',
        'gameservers.create',
        'gameservers.delete',
        'gameservers.read',
        'gameservers.update',
        'profiles.delete',
        'profiles.read',
        'profiles.update',
        'referendums.create',
        'referendums.delete',
        'referendums.read',
        'referendums.update',
        'roles.create',
        'roles.delete',
        'roles.read',
        'roles.update',
        'servers.create',
        'servers.delete',
        'servers.read',
        'servers.update',
        'users.create',
        'users.delete',
        'users.read',
        'users.update',
        'projects.read',
        'projects.create',
        'projects.update',
        'projects.delete',
      ],
      app_role: ['admin', 'moderator'],
      events_rsvp_status: ['yes', 'no', 'tentative'],
      profile_badge: ['builder', 'earlybird', 'founder', 'host'],
      region: ['eu', 'na', 'all'],
    },
  },
} as const
