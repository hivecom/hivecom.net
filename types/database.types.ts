export type Json
  = | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
  public: {
    Tables: {
      alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          body: string | null
          created_at: string
          created_by: string | null
          href: string | null
          id: string
          is_acknowledged: boolean
          modified_at: string
          modified_by: string | null
          severity: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          href?: string | null
          id?: string
          is_acknowledged?: boolean
          modified_at?: string
          modified_by?: string | null
          severity?: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body?: string | null
          created_at?: string
          created_by?: string | null
          href?: string | null
          id?: string
          is_acknowledged?: boolean
          modified_at?: string
          modified_by?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      complaints: {
        Row: {
          acknowledged: boolean
          context_discussion: string | null
          context_discussion_reply: string | null
          context_gameserver: number | null
          context_user: string | null
          created_at: string
          created_by: string | null
          id: number
          message: string
          responded_at: string | null
          responded_by: string | null
          response: string | null
        }
        Insert: {
          acknowledged?: boolean
          context_discussion?: string | null
          context_discussion_reply?: string | null
          context_gameserver?: number | null
          context_user?: string | null
          created_at?: string
          created_by?: string | null
          id?: number
          message: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
        }
        Update: {
          acknowledged?: boolean
          context_discussion?: string | null
          context_discussion_reply?: string | null
          context_gameserver?: number | null
          context_user?: string | null
          created_at?: string
          created_by?: string | null
          id?: number
          message?: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'complaints_context_discussion_fkey'
            columns: ['context_discussion']
            isOneToOne: false
            referencedRelation: 'discussions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'complaints_context_discussion_reply_fkey'
            columns: ['context_discussion_reply']
            isOneToOne: false
            referencedRelation: 'discussion_replies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'complaints_context_discussion_reply_fkey'
            columns: ['context_discussion_reply']
            isOneToOne: false
            referencedRelation: 'forum_discussion_replies'
            referencedColumns: ['id']
          },
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
          is_forum_reply: boolean
          is_nsfw: boolean
          is_offtopic: boolean
          markdown: string
          meta: Json | null
          modified_at: string
          modified_by: string | null
          reactions: Json
          reply_to_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discussion_id: string
          id?: string
          is_deleted?: boolean
          is_forum_reply?: boolean
          is_nsfw?: boolean
          is_offtopic?: boolean
          markdown: string
          meta?: Json | null
          modified_at?: string
          modified_by?: string | null
          reactions?: Json
          reply_to_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discussion_id?: string
          id?: string
          is_deleted?: boolean
          is_forum_reply?: boolean
          is_nsfw?: boolean
          is_offtopic?: boolean
          markdown?: string
          meta?: Json | null
          modified_at?: string
          modified_by?: string | null
          reactions?: Json
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
          {
            foreignKeyName: 'discussion_replies_reply_to_id_fkey'
            columns: ['reply_to_id']
            isOneToOne: false
            referencedRelation: 'forum_discussion_replies'
            referencedColumns: ['id']
          },
        ]
      }
      discussion_subscriptions: {
        Row: {
          created_at: string
          discussion_id: string
          id: string
          last_seen_at: string
          modified_at: string
          modified_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          discussion_id: string
          id?: string
          last_seen_at?: string
          modified_at?: string
          modified_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          discussion_id?: string
          id?: string
          last_seen_at?: string
          modified_at?: string
          modified_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'discussion_subscriptions_discussion_id_fkey'
            columns: ['discussion_id']
            isOneToOne: false
            referencedRelation: 'discussions'
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
          last_activity_at: string
          modified_at: string
          modified_by: string | null
          name: string
          parent_id: string | null
          priority: number
          slug: string
          total_reply_count: number
          total_view_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_locked?: boolean
          last_activity_at?: string
          modified_at?: string
          modified_by?: string | null
          name: string
          parent_id?: string | null
          priority?: number
          slug: string
          total_reply_count?: number
          total_view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_locked?: boolean
          last_activity_at?: string
          modified_at?: string
          modified_by?: string | null
          name?: string
          parent_id?: string | null
          priority?: number
          slug?: string
          total_reply_count?: number
          total_view_count?: number
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
          is_nsfw: boolean
          is_sticky: boolean
          last_activity_at: string
          markdown: string | null
          modified_at: string
          modified_by: string | null
          pinned_reply_id: string | null
          profile_id: string | null
          project_id: number | null
          reactions: Json
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
          is_nsfw?: boolean
          is_sticky?: boolean
          last_activity_at?: string
          markdown?: string | null
          modified_at?: string
          modified_by?: string | null
          pinned_reply_id?: string | null
          profile_id?: string | null
          project_id?: number | null
          reactions?: Json
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
          is_nsfw?: boolean
          is_sticky?: boolean
          last_activity_at?: string
          markdown?: string | null
          modified_at?: string
          modified_by?: string | null
          pinned_reply_id?: string | null
          profile_id?: string | null
          project_id?: number | null
          reactions?: Json
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
            foreignKeyName: 'discussions_accepted_reply_id_fkey'
            columns: ['accepted_reply_id']
            isOneToOne: false
            referencedRelation: 'forum_discussion_replies'
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
            foreignKeyName: 'discussions_pinned_reply_id_fkey'
            columns: ['pinned_reply_id']
            isOneToOne: false
            referencedRelation: 'discussion_replies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'discussions_pinned_reply_id_fkey'
            columns: ['pinned_reply_id']
            isOneToOne: false
            referencedRelation: 'forum_discussion_replies'
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          href: string | null
          id: string
          is_read: boolean
          modified_at: string
          modified_by: string | null
          source: string | null
          source_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          href?: string | null
          id?: string
          is_read?: boolean
          modified_at?: string
          modified_by?: string | null
          source?: string | null
          source_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          href?: string | null
          id?: string
          is_read?: boolean
          modified_at?: string
          modified_by?: string | null
          source?: string | null
          source_id?: string | null
          title?: string
          user_id?: string
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
          agreed_content_rules: boolean
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
          has_banner: boolean
          id: string
          introduction: string | null
          last_seen: string
          markdown: string | null
          modified_at: string | null
          modified_by: string | null
          patreon_id: string | null
          public: boolean
          rich_presence_enabled: boolean
          steam_id: string | null
          supporter_lifetime: boolean
          supporter_patreon: boolean
          teamspeak_identities: Json
          theme_id: string | null
          username: string
          username_set: boolean
          website: string | null
        }
        Insert: {
          agreed_content_rules?: boolean
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
          has_banner?: boolean
          id: string
          introduction?: string | null
          last_seen?: string
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          patreon_id?: string | null
          public?: boolean
          rich_presence_enabled?: boolean
          steam_id?: string | null
          supporter_lifetime?: boolean
          supporter_patreon?: boolean
          teamspeak_identities?: Json
          theme_id?: string | null
          username: string
          username_set?: boolean
          website?: string | null
        }
        Update: {
          agreed_content_rules?: boolean
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
          has_banner?: boolean
          id?: string
          introduction?: string | null
          last_seen?: string
          markdown?: string | null
          modified_at?: string | null
          modified_by?: string | null
          patreon_id?: string | null
          public?: boolean
          rich_presence_enabled?: boolean
          steam_id?: string | null
          supporter_lifetime?: boolean
          supporter_patreon?: boolean
          teamspeak_identities?: Json
          theme_id?: string | null
          username?: string
          username_set?: boolean
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_theme_id_fkey'
            columns: ['theme_id']
            isOneToOne: false
            referencedRelation: 'themes'
            referencedColumns: ['id']
          },
        ]
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
          is_public: boolean
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
          is_public?: boolean
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
          is_public?: boolean
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
      settings: {
        Row: {
          created_at: string
          data: Json
          id: string
          modified_at: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          modified_at?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          modified_at?: string | null
        }
        Relationships: []
      }
      themes: {
        Row: {
          created_at: string
          created_by: string | null
          dark_accent: string
          dark_bg: string
          dark_bg_accent_lowered: string
          dark_bg_accent_raised: string
          dark_bg_blue_lowered: string
          dark_bg_blue_raised: string
          dark_bg_green_lowered: string
          dark_bg_green_raised: string
          dark_bg_lowered: string
          dark_bg_medium: string
          dark_bg_raised: string
          dark_bg_red_lowered: string
          dark_bg_red_raised: string
          dark_bg_yellow_lowered: string
          dark_bg_yellow_raised: string
          dark_border: string
          dark_border_strong: string
          dark_border_weak: string
          dark_button_fill: string
          dark_button_fill_hover: string
          dark_button_gray: string
          dark_button_gray_hover: string
          dark_text: string
          dark_text_blue: string
          dark_text_green: string
          dark_text_invert: string
          dark_text_light: string
          dark_text_lighter: string
          dark_text_lightest: string
          dark_text_red: string
          dark_text_yellow: string
          description: string
          id: string
          is_official: boolean
          is_unmaintained: boolean
          light_accent: string
          light_bg: string
          light_bg_accent_lowered: string
          light_bg_accent_raised: string
          light_bg_blue_lowered: string
          light_bg_blue_raised: string
          light_bg_green_lowered: string
          light_bg_green_raised: string
          light_bg_lowered: string
          light_bg_medium: string
          light_bg_raised: string
          light_bg_red_lowered: string
          light_bg_red_raised: string
          light_bg_yellow_lowered: string
          light_bg_yellow_raised: string
          light_border: string
          light_border_strong: string
          light_border_weak: string
          light_button_fill: string
          light_button_fill_hover: string
          light_button_gray: string
          light_button_gray_hover: string
          light_text: string
          light_text_blue: string
          light_text_green: string
          light_text_invert: string
          light_text_light: string
          light_text_lighter: string
          light_text_lightest: string
          light_text_red: string
          light_text_yellow: string
          modified_at: string | null
          modified_by: string | null
          name: string
          rounding: number
          spacing: number
          transitions: number
          widening: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dark_accent: string
          dark_bg: string
          dark_bg_accent_lowered: string
          dark_bg_accent_raised: string
          dark_bg_blue_lowered: string
          dark_bg_blue_raised: string
          dark_bg_green_lowered: string
          dark_bg_green_raised: string
          dark_bg_lowered: string
          dark_bg_medium: string
          dark_bg_raised: string
          dark_bg_red_lowered: string
          dark_bg_red_raised: string
          dark_bg_yellow_lowered: string
          dark_bg_yellow_raised: string
          dark_border: string
          dark_border_strong: string
          dark_border_weak: string
          dark_button_fill: string
          dark_button_fill_hover: string
          dark_button_gray: string
          dark_button_gray_hover: string
          dark_text: string
          dark_text_blue: string
          dark_text_green: string
          dark_text_invert: string
          dark_text_light: string
          dark_text_lighter: string
          dark_text_lightest: string
          dark_text_red: string
          dark_text_yellow: string
          description?: string
          id?: string
          is_official?: boolean
          is_unmaintained?: boolean
          light_accent: string
          light_bg: string
          light_bg_accent_lowered: string
          light_bg_accent_raised: string
          light_bg_blue_lowered: string
          light_bg_blue_raised: string
          light_bg_green_lowered: string
          light_bg_green_raised: string
          light_bg_lowered: string
          light_bg_medium: string
          light_bg_raised: string
          light_bg_red_lowered: string
          light_bg_red_raised: string
          light_bg_yellow_lowered: string
          light_bg_yellow_raised: string
          light_border: string
          light_border_strong: string
          light_border_weak: string
          light_button_fill: string
          light_button_fill_hover: string
          light_button_gray: string
          light_button_gray_hover: string
          light_text: string
          light_text_blue: string
          light_text_green: string
          light_text_invert: string
          light_text_light: string
          light_text_lighter: string
          light_text_lightest: string
          light_text_red: string
          light_text_yellow: string
          modified_at?: string | null
          modified_by?: string | null
          name: string
          rounding?: number
          spacing?: number
          transitions?: number
          widening?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dark_accent?: string
          dark_bg?: string
          dark_bg_accent_lowered?: string
          dark_bg_accent_raised?: string
          dark_bg_blue_lowered?: string
          dark_bg_blue_raised?: string
          dark_bg_green_lowered?: string
          dark_bg_green_raised?: string
          dark_bg_lowered?: string
          dark_bg_medium?: string
          dark_bg_raised?: string
          dark_bg_red_lowered?: string
          dark_bg_red_raised?: string
          dark_bg_yellow_lowered?: string
          dark_bg_yellow_raised?: string
          dark_border?: string
          dark_border_strong?: string
          dark_border_weak?: string
          dark_button_fill?: string
          dark_button_fill_hover?: string
          dark_button_gray?: string
          dark_button_gray_hover?: string
          dark_text?: string
          dark_text_blue?: string
          dark_text_green?: string
          dark_text_invert?: string
          dark_text_light?: string
          dark_text_lighter?: string
          dark_text_lightest?: string
          dark_text_red?: string
          dark_text_yellow?: string
          description?: string
          id?: string
          is_official?: boolean
          is_unmaintained?: boolean
          light_accent?: string
          light_bg?: string
          light_bg_accent_lowered?: string
          light_bg_accent_raised?: string
          light_bg_blue_lowered?: string
          light_bg_blue_raised?: string
          light_bg_green_lowered?: string
          light_bg_green_raised?: string
          light_bg_lowered?: string
          light_bg_medium?: string
          light_bg_raised?: string
          light_bg_red_lowered?: string
          light_bg_red_raised?: string
          light_bg_yellow_lowered?: string
          light_bg_yellow_raised?: string
          light_border?: string
          light_border_strong?: string
          light_border_weak?: string
          light_button_fill?: string
          light_button_fill_hover?: string
          light_button_gray?: string
          light_button_gray_hover?: string
          light_text?: string
          light_text_blue?: string
          light_text_green?: string
          light_text_invert?: string
          light_text_light?: string
          light_text_lighter?: string
          light_text_lightest?: string
          light_text_red?: string
          light_text_yellow?: string
          modified_at?: string | null
          modified_by?: string | null
          name?: string
          rounding?: number
          spacing?: number
          transitions?: number
          widening?: number
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
      forum_discussion_replies: {
        Row: {
          created_at: string | null
          created_by: string | null
          discussion_id: string | null
          id: string | null
          is_deleted: boolean | null
          is_forum_reply: boolean | null
          is_nsfw: boolean | null
          is_offtopic: boolean | null
          markdown: string | null
          meta: Json | null
          modified_at: string | null
          modified_by: string | null
          reactions: Json | null
          reply_to_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          discussion_id?: string | null
          id?: string | null
          is_deleted?: boolean | null
          is_forum_reply?: boolean | null
          is_nsfw?: boolean | null
          is_offtopic?: boolean | null
          markdown?: string | null
          meta?: Json | null
          modified_at?: string | null
          modified_by?: string | null
          reactions?: Json | null
          reply_to_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          discussion_id?: string | null
          id?: string | null
          is_deleted?: boolean | null
          is_forum_reply?: boolean | null
          is_nsfw?: boolean | null
          is_offtopic?: boolean | null
          markdown?: string | null
          meta?: Json | null
          modified_at?: string | null
          modified_by?: string | null
          reactions?: Json | null
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
          {
            foreignKeyName: 'discussion_replies_reply_to_id_fkey'
            columns: ['reply_to_id']
            isOneToOne: false
            referencedRelation: 'forum_discussion_replies'
            referencedColumns: ['id']
          },
        ]
      }
      theme_usage: {
        Row: {
          theme_id: string | null
          user_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_theme_id_fkey'
            columns: ['theme_id']
            isOneToOne: false
            referencedRelation: 'themes'
            referencedColumns: ['id']
          },
        ]
      }
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
      current_user_role: {
        Args: never
        Returns: Database['public']['Enums']['app_role']
      }
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
      get_forum_activity_feed: {
        Args: { p_created_by?: string, p_limit?: number, p_offset?: number }
        Returns: {
          body: string
          created_at: string
          created_by: string
          discussion_id: string
          id: string
          is_nsfw: boolean
          is_offtopic: boolean
          item_type: string
          title: string
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
      has_verified_mfa: { Args: never, Returns: boolean }
      increment_discussion_view_count: {
        Args: { target_discussion_id: string }
        Returns: undefined
      }
      is_not_banned: { Args: never, Returns: boolean }
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
          id: string
          username: string
        }[]
      }
      slugify: { Args: { input: string }, Returns: string }
      toggle_reaction: {
        Args: {
          p_emote: string
          p_id: string
          p_provider?: string
          p_table: string
        }
        Returns: Json
      }
      unique_discussion_slug: { Args: { base_slug: string }, Returns: string }
      update_user_last_seen: { Args: { user_id?: string }, Returns: undefined }
      validate_github_repo: { Args: { github_repo: string }, Returns: boolean }
      validate_tag_format: { Args: { tag: string }, Returns: boolean }
      validate_tags_array: { Args: { tags: string[] }, Returns: boolean }
    }
    Enums: {
      app_permission:
        | 'assets.create'
        | 'assets.delete'
        | 'assets.read'
        | 'assets.update'
        | 'complaints.create'
        | 'complaints.delete'
        | 'complaints.read'
        | 'complaints.update'
        | 'containers.create'
        | 'containers.delete'
        | 'containers.read'
        | 'containers.update'
        | 'discussion_topics.create'
        | 'discussion_topics.read'
        | 'discussion_topics.update'
        | 'discussion_topics.delete'
        | 'discussions.create'
        | 'discussions.read'
        | 'discussions.update'
        | 'discussions.delete'
        | 'events.create'
        | 'events.delete'
        | 'events.read'
        | 'events.update'
        | 'expenses.create'
        | 'expenses.delete'
        | 'expenses.read'
        | 'expenses.update'
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
        | 'kvstore.create'
        | 'kvstore.read'
        | 'kvstore.update'
        | 'kvstore.delete'
        | 'motds.create'
        | 'motds.read'
        | 'motds.update'
        | 'motds.delete'
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
        | 'alerts.read'
        | 'themes.create'
        | 'themes.read'
        | 'themes.update'
        | 'themes.delete'
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
  public: {
    Enums: {
      app_permission: [
        'assets.create',
        'assets.delete',
        'assets.read',
        'assets.update',
        'complaints.create',
        'complaints.delete',
        'complaints.read',
        'complaints.update',
        'containers.create',
        'containers.delete',
        'containers.read',
        'containers.update',
        'discussion_topics.create',
        'discussion_topics.read',
        'discussion_topics.update',
        'discussion_topics.delete',
        'discussions.create',
        'discussions.read',
        'discussions.update',
        'discussions.delete',
        'events.create',
        'events.delete',
        'events.read',
        'events.update',
        'expenses.create',
        'expenses.delete',
        'expenses.read',
        'expenses.update',
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
        'kvstore.create',
        'kvstore.read',
        'kvstore.update',
        'kvstore.delete',
        'motds.create',
        'motds.read',
        'motds.update',
        'motds.delete',
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
        'alerts.read',
        'themes.create',
        'themes.read',
        'themes.update',
        'themes.delete',
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
