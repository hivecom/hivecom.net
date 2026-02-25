export type Json
  = | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
  private: {
    Tables: {
      kvstore: {
        Row: {
          created_at: string | null
          created_by: string | null
          key: string
          modified_at: string | null
          modified_by: string | null
          type: Database['public']['Enums']['kvstore_type']
          value: Json
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          key: string
          modified_at?: string | null
          modified_by?: string | null
          type?: Database['public']['Enums']['kvstore_type']
          value: Json
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          key?: string
          modified_at?: string | null
          modified_by?: string | null
          type?: Database['public']['Enums']['kvstore_type']
          value?: Json
        }
        Relationships: []
      }
      teamspeak_tokens: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          server_id: string
          token_hash: string
          unique_id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at?: string
          server_id: string
          token_hash: string
          unique_id: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          server_id?: string
          token_hash?: string
          unique_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      queue_dispatch_worker_sync_steam: { Args: never, Returns: undefined }
      queue_enqueue_worker_sync_steam: { Args: never, Returns: undefined }
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
      discussion_replies: {
        Row: {
          created_at: string
          created_by: string | null
          discussion_id: string
          id: string
          is_deleted: boolean
          markdown: string
          meta: Json | null
          modified_at: string
          modified_by: string | null
          reply_to_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discussion_id: string
          id?: string
          is_deleted?: boolean
          markdown: string
          meta?: Json | null
          modified_at?: string
          modified_by?: string | null
          reply_to_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discussion_id?: string
          id?: string
          is_deleted?: boolean
          markdown?: string
          meta?: Json | null
          modified_at?: string
          modified_by?: string | null
          reply_to_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'discussion_replies_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussion_replies_discussion_id_fkey'
            columns: ['discussion_id']
            isOneToOne: false
            referencedRelation: 'discussions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussion_replies_modified_by_fkey'
            columns: ['modified_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussion_replies_reply_to_id_fkey'
            columns: ['reply_to_id']
            isOneToOne: false
            referencedRelation: 'discussion_replies'
            referencedColumns: ['id']
          },
        ]
      }
      discussion_topics: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_archived: boolean
          is_locked: boolean
          modified_at: string
          modified_by: string | null
          name: string
          parent_id: string | null
          priority: number
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_locked?: boolean
          modified_at?: string
          modified_by?: string | null
          name: string
          parent_id?: string | null
          priority?: number
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_locked?: boolean
          modified_at?: string
          modified_by?: string | null
          name?: string
          parent_id?: string | null
          priority?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: 'discussion_topics_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussion_topics_modified_by_fkey'
            columns: ['modified_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussion_topics_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'discussion_topics'
            referencedColumns: ['id']
          },
        ]
      }
      discussions: {
        Row: {
          accepted_reply_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          discussion_topic_id: string | null
          event_id: number | null
          gameserver_id: number | null
          id: string
          is_archived: boolean
          is_draft: boolean
          is_locked: boolean
          is_sticky: boolean
          markdown: string | null
          modified_at: string
          modified_by: string | null
          profile_id: string | null
          project_id: number | null
          referendum_id: number | null
          reply_count: number
          slug: string | null
          title: string | null
          view_count: number
        }
        Insert: {
          accepted_reply_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discussion_topic_id?: string | null
          event_id?: number | null
          gameserver_id?: number | null
          id?: string
          is_archived?: boolean
          is_draft?: boolean
          is_locked?: boolean
          is_sticky?: boolean
          markdown?: string | null
          modified_at?: string
          modified_by?: string | null
          profile_id?: string | null
          project_id?: number | null
          referendum_id?: number | null
          reply_count?: number
          slug?: string | null
          title?: string | null
          view_count?: number
        }
        Update: {
          accepted_reply_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          discussion_topic_id?: string | null
          event_id?: number | null
          gameserver_id?: number | null
          id?: string
          is_archived?: boolean
          is_draft?: boolean
          is_locked?: boolean
          is_sticky?: boolean
          markdown?: string | null
          modified_at?: string
          modified_by?: string | null
          profile_id?: string | null
          project_id?: number | null
          referendum_id?: number | null
          reply_count?: number
          slug?: string | null
          title?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: 'discussions_accepted_reply_id_fkey'
            columns: ['accepted_reply_id']
            isOneToOne: false
            referencedRelation: 'discussion_replies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussions_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussions_discussion_topic_id_fkey'
            columns: ['discussion_topic_id']
            isOneToOne: false
            referencedRelation: 'discussion_topics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussions_event_id_fkey'
            columns: ['event_id']
            isOneToOne: false
            referencedRelation: 'events'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussions_gameserver_id_fkey'
            columns: ['gameserver_id']
            isOneToOne: false
            referencedRelation: 'gameservers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussions_modified_by_fkey'
            columns: ['modified_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussions_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussions_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussions_referendum_id_fkey'
            columns: ['referendum_id']
            isOneToOne: false
            referencedRelation: 'referendums'
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
          discord_event_id: string | null
          discord_last_synced_at: string | null
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
          discord_event_id?: string | null
          discord_last_synced_at?: string | null
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
          discord_event_id?: string | null
          discord_last_synced_at?: string | null
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
      kvstore: {
        Row: {
          created_at: string
          created_by: string
          key: string
          modified_at: string | null
          modified_by: string | null
          type: Database['public']['Enums']['kvstore_type']
          value: Json
        }
        Insert: {
          created_at?: string
          created_by?: string
          key: string
          modified_at?: string | null
          modified_by?: string | null
          type?: Database['public']['Enums']['kvstore_type']
          value: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          key?: string
          modified_at?: string | null
          modified_by?: string | null
          type?: Database['public']['Enums']['kvstore_type']
          value?: Json
        }
        Relationships: []
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
      motds: {
        Row: {
          created_at: string
          created_by: string
          id: number
          message: string
          modified_at: string | null
          modified_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: number
          message: string
          modified_at?: string | null
          modified_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: number
          message?: string
          modified_at?: string | null
          modified_by?: string | null
        }
        Relationships: []
      }
      presences_discord: {
        Row: {
          activity_details: string | null
          activity_ended_at: string | null
          activity_name: string | null
          activity_started_at: string | null
          activity_state: string | null
          activity_type: string | null
          details: Json | null
          id: string
          last_online_at: string | null
          profile_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          activity_details?: string | null
          activity_ended_at?: string | null
          activity_name?: string | null
          activity_started_at?: string | null
          activity_state?: string | null
          activity_type?: string | null
          details?: Json | null
          id?: string
          last_online_at?: string | null
          profile_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          activity_details?: string | null
          activity_ended_at?: string | null
          activity_name?: string | null
          activity_started_at?: string | null
          activity_state?: string | null
          activity_type?: string | null
          details?: Json | null
          id?: string
          last_online_at?: string | null
          profile_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'presences_discord_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      presences_steam: {
        Row: {
          current_app_id: number | null
          current_app_name: string | null
          details: Json | null
          fetched_at: string | null
          id: string
          last_app_id: number | null
          last_app_name: string | null
          last_online_at: string | null
          profile_id: string
          status: Database['public']['Enums']['presence_steam_status'] | null
          steam_name: string | null
          updated_at: string
          visibility: string | null
        }
        Insert: {
          current_app_id?: number | null
          current_app_name?: string | null
          details?: Json | null
          fetched_at?: string | null
          id?: string
          last_app_id?: number | null
          last_app_name?: string | null
          last_online_at?: string | null
          profile_id: string
          status?: Database['public']['Enums']['presence_steam_status'] | null
          steam_name?: string | null
          updated_at?: string
          visibility?: string | null
        }
        Update: {
          current_app_id?: number | null
          current_app_name?: string | null
          details?: Json | null
          fetched_at?: string | null
          id?: string
          last_app_id?: number | null
          last_app_name?: string | null
          last_online_at?: string | null
          profile_id?: string
          status?: Database['public']['Enums']['presence_steam_status'] | null
          steam_name?: string | null
          updated_at?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'presences_steam_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      presences_teamspeak: {
        Row: {
          channel_id: string | null
          channel_name: string | null
          channel_path: string[] | null
          details: Json | null
          id: string
          last_seen_at: string | null
          profile_id: string
          server_id: string
          status: string | null
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          channel_name?: string | null
          channel_path?: string[] | null
          details?: Json | null
          id?: string
          last_seen_at?: string | null
          profile_id: string
          server_id: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          channel_name?: string | null
          channel_path?: string[] | null
          details?: Json | null
          id?: string
          last_seen_at?: string | null
          profile_id?: string
          server_id?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'presences_teamspeak_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          badges: Database['public']['Enums']['profile_badge'][]
          ban_end: string | null
          ban_reason: string | null
          ban_start: string | null
          banned: boolean
          birthday: string | null
          country: string | null
          created_at: string
          discord_id: string | null
          email_notifications_bounced: boolean
          email_notifications_disabled: boolean
          id: string
          introduction: string | null
          last_seen: string
          markdown: string | null
          modified_at: string | null
          modified_by: string | null
          patreon_id: string | null
          rich_presence_disabled: boolean
          steam_id: string | null
          supporter_lifetime: boolean
          supporter_patreon: boolean
          teamspeak_identities: Json
          username: string
          username_set: boolean
          website: string | null
        }
        Insert: {
          badges?: Database['public']['Enums']['profile_badge'][]
          ban_end?: string | null
          ban_reason?: string | null
          ban_start?: string | null
          banned?: boolean
          birthday?: string | null
          country?: string | null
          created_at?: string
          discord_id?: string | null
          email_notifications_bounced?: boolean
          email_notifications_disabled?: boolean
          id: string
          introduction?: string | null
          last_seen?: string
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          patreon_id?: string | null
          rich_presence_disabled?: boolean
          steam_id?: string | null
          supporter_lifetime?: boolean
          supporter_patreon?: boolean
          teamspeak_identities?: Json
          username: string
          username_set?: boolean
          website?: string | null
        }
        Update: {
          badges?: Database['public']['Enums']['profile_badge'][]
          ban_end?: string | null
          ban_reason?: string | null
          ban_start?: string | null
          banned?: boolean
          birthday?: string | null
          country?: string | null
          created_at?: string
          discord_id?: string | null
          email_notifications_bounced?: boolean
          email_notifications_disabled?: boolean
          id?: string
          introduction?: string | null
          last_seen?: string
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          patreon_id?: string | null
          rich_presence_disabled?: boolean
          steam_id?: string | null
          supporter_lifetime?: boolean
          supporter_patreon?: boolean
          teamspeak_identities?: Json
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
          created_at: string
          id: number
          modified_at: string | null
          referendum_id: number | null
          user_id: string
        }
        Insert: {
          choices?: number[]
          created_at?: string
          id?: number
          modified_at?: string | null
          referendum_id?: number | null
          user_id?: string
        }
        Update: {
          choices?: number[]
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
          accessible: boolean
          active: boolean
          address: string
          created_at: string
          created_by: string | null
          docker_control: boolean
          docker_control_port: number | null
          docker_control_secure: boolean
          docker_control_subdomain: string | null
          id: number
          last_accessed: string | null
          modified_at: string | null
          modified_by: string | null
        }
        Insert: {
          accessible?: boolean
          active: boolean
          address: string
          created_at?: string
          created_by?: string | null
          docker_control?: boolean
          docker_control_port?: number | null
          docker_control_secure?: boolean
          docker_control_subdomain?: string | null
          id?: number
          last_accessed?: string | null
          modified_at?: string | null
          modified_by?: string | null
        }
        Update: {
          accessible?: boolean
          active?: boolean
          address?: string
          created_at?: string
          created_by?: string | null
          docker_control?: boolean
          docker_control_port?: number | null
          docker_control_secure?: boolean
          docker_control_subdomain?: string | null
          id?: number
          last_accessed?: string | null
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
      admin_delete_user_sessions: {
        Args: { target_user: string }
        Returns: undefined
      }
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
      get_admin_user_overview: {
        Args: never
        Returns: {
          auth_provider: string
          auth_providers: string[]
          discord_display_name: string
          email: string
          is_confirmed: boolean
          user_id: string
        }[]
      }
      get_discussion_topic_breadcrumbs: {
        Args: { target_topic_id: string }
        Returns: {
          id: string
          name: string
          parent_id: string
          slug: string
        }[]
      }
      get_private_config: { Args: { config_key: string }, Returns: Json }
      get_user_emails: {
        Args: never
        Returns: {
          email: string
          user_id: string
        }[]
      }
      get_user_id_by_email: {
        Args: { email: string }
        Returns: {
          id: string
        }[]
      }
      has_permission: {
        Args: { permission_name: Database['public']['Enums']['app_permission'] }
        Returns: boolean
      }
      increment_discussion_view_count: {
        Args: { target_discussion_id: string }
        Returns: undefined
      }
      is_owner: { Args: { record_user_id: string }, Returns: boolean }
      is_profile_owner: { Args: { profile_id: string }, Returns: boolean }
      normalize_mentions: { Args: { input_text: string }, Returns: string }
      pgmq_delete: {
        Args: { msg_id: number, queue_name: string }
        Returns: boolean
      }
      pgmq_read: {
        Args: { qty: number, queue_name: string, vt: number }
        Returns: unknown[]
        SetofOptions: {
          from: '*'
          to: 'message_record'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      pgmq_send: { Args: { msg: Json, queue_name: string }, Returns: number }
      search_profiles: {
        Args: { search_term: string }
        Returns: {
          badges: Database['public']['Enums']['profile_badge'][]
          ban_end: string | null
          ban_reason: string | null
          ban_start: string | null
          banned: boolean
          birthday: string | null
          country: string | null
          created_at: string
          discord_id: string | null
          email_notifications_bounced: boolean
          email_notifications_disabled: boolean
          id: string
          introduction: string | null
          last_seen: string
          markdown: string | null
          modified_at: string | null
          modified_by: string | null
          patreon_id: string | null
          rich_presence_disabled: boolean
          steam_id: string | null
          supporter_lifetime: boolean
          supporter_patreon: boolean
          teamspeak_identities: Json
          username: string
          username_set: boolean
          website: string | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'profiles'
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
        | 'projects.create'
        | 'projects.read'
        | 'projects.update'
        | 'projects.delete'
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
        | 'assets.create'
        | 'assets.delete'
        | 'assets.read'
        | 'assets.update'
        | 'motds.create'
        | 'motds.read'
        | 'motds.update'
        | 'motds.delete'
        | 'kvstore.create'
        | 'kvstore.read'
        | 'kvstore.update'
        | 'kvstore.delete'
        | 'discussions.create'
        | 'discussions.read'
        | 'discussions.update'
        | 'discussions.delete'
        | 'discussions.manage'
      app_role: 'admin' | 'moderator'
      events_rsvp_status: 'yes' | 'no' | 'tentative'
      kvstore_type: 'NUMBER' | 'BOOLEAN' | 'STRING' | 'JSON'
      presence_steam_status:
        | 'offline'
        | 'online'
        | 'busy'
        | 'away'
        | 'snooze'
        | 'looking_to_trade'
        | 'looking_to_play'
      profile_badge: 'founder' | 'earlybird' | 'builder' | 'host'
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
  private: {
    Enums: {},
  },
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
        'projects.create',
        'projects.read',
        'projects.update',
        'projects.delete',
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
        'assets.create',
        'assets.delete',
        'assets.read',
        'assets.update',
        'motds.create',
        'motds.read',
        'motds.update',
        'motds.delete',
        'kvstore.create',
        'kvstore.read',
        'kvstore.update',
        'kvstore.delete',
        'discussions.create',
        'discussions.read',
        'discussions.update',
        'discussions.delete',
        'discussions.manage',
      ],
      app_role: ['admin', 'moderator'],
      events_rsvp_status: ['yes', 'no', 'tentative'],
      kvstore_type: ['NUMBER', 'BOOLEAN', 'STRING', 'JSON'],
      presence_steam_status: [
        'offline',
        'online',
        'busy',
        'away',
        'snooze',
        'looking_to_trade',
        'looking_to_play',
      ],
      profile_badge: ['founder', 'earlybird', 'builder', 'host'],
      region: ['eu', 'na', 'all'],
    },
  },
} as const
