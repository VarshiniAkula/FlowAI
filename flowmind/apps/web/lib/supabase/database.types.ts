// Supabase-generated schema types.
//
// Regenerate with `pnpm db:types` (runs `supabase gen types typescript
// --local --schema public`). The checked-in version below is a hand-authored
// mirror of the migrations under flowmind/supabase/migrations/, kept in sync
// so the repo typechecks without a running local Supabase stack. Do not
// diverge from the migrations — regenerate after every schema change.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TimestampString = string;
type UuidString = string;

type Role = 'owner' | 'admin' | 'member' | 'viewer';
type InviteRole = 'admin' | 'member' | 'viewer';
type SourceType = 'file' | 'url' | 'text' | 'api';
type IngestStatus = 'pending' | 'processing' | 'ready' | 'failed';
type PublishedStatus = 'published' | 'disabled';
type Visibility = 'public' | 'private';
type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: UuidString;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          created_at: TimestampString;
          updated_at: TimestampString;
        };
        Insert: {
          id: UuidString;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: TimestampString;
          updated_at?: TimestampString;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      organizations: {
        Row: {
          id: UuidString;
          name: string;
          slug: string | null;
          created_by: UuidString | null;
          created_at: TimestampString;
          updated_at: TimestampString;
        };
        Insert: {
          id?: UuidString;
          name: string;
          slug?: string | null;
          created_by?: UuidString | null;
          created_at?: TimestampString;
          updated_at?: TimestampString;
        };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
        Relationships: [];
      };
      memberships: {
        Row: {
          id: UuidString;
          org_id: UuidString;
          user_id: UuidString;
          role: Role;
          created_at: TimestampString;
        };
        Insert: {
          id?: UuidString;
          org_id: UuidString;
          user_id: UuidString;
          role: Role;
          created_at?: TimestampString;
        };
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>;
        Relationships: [];
      };
      invitations: {
        Row: {
          id: UuidString;
          org_id: UuidString;
          email: string;
          role: InviteRole;
          invited_by: UuidString | null;
          token: string;
          expires_at: TimestampString;
          accepted_at: TimestampString | null;
          created_at: TimestampString;
        };
        Insert: {
          id?: UuidString;
          org_id: UuidString;
          email: string;
          role: InviteRole;
          invited_by?: UuidString | null;
          token: string;
          expires_at?: TimestampString;
          accepted_at?: TimestampString | null;
          created_at?: TimestampString;
        };
        Update: Partial<Database['public']['Tables']['invitations']['Insert']>;
        Relationships: [];
      };
      assistants: {
        Row: {
          id: UuidString;
          org_id: UuidString;
          created_by: UuidString | null;
          name: string;
          description: string | null;
          status: string;
          graph: Json;
          settings: Json;
          created_at: TimestampString;
          updated_at: TimestampString;
        };
        Insert: {
          id?: UuidString;
          org_id: UuidString;
          created_by?: UuidString | null;
          name: string;
          description?: string | null;
          status?: string;
          graph?: Json;
          settings?: Json;
          created_at?: TimestampString;
          updated_at?: TimestampString;
        };
        Update: Partial<Database['public']['Tables']['assistants']['Insert']>;
        Relationships: [];
      };
      knowledge_sources: {
        Row: {
          id: UuidString;
          org_id: UuidString;
          assistant_id: UuidString;
          type: SourceType;
          uri: string | null;
          title: string | null;
          status: IngestStatus;
          error: string | null;
          metadata: Json;
          created_by: UuidString | null;
          created_at: TimestampString;
          updated_at: TimestampString;
        };
        Insert: {
          id?: UuidString;
          org_id: UuidString;
          assistant_id: UuidString;
          type: SourceType;
          uri?: string | null;
          title?: string | null;
          status?: IngestStatus;
          error?: string | null;
          metadata?: Json;
          created_by?: UuidString | null;
          created_at?: TimestampString;
          updated_at?: TimestampString;
        };
        Update: Partial<Database['public']['Tables']['knowledge_sources']['Insert']>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: UuidString;
          org_id: UuidString;
          assistant_id: UuidString;
          source_id: UuidString | null;
          storage_path: string | null;
          name: string;
          mime_type: string | null;
          sha256: string | null;
          size_bytes: number | null;
          status: IngestStatus;
          error: string | null;
          metadata: Json;
          created_at: TimestampString;
          updated_at: TimestampString;
        };
        Insert: {
          id?: UuidString;
          org_id: UuidString;
          assistant_id: UuidString;
          source_id?: UuidString | null;
          storage_path?: string | null;
          name: string;
          mime_type?: string | null;
          sha256?: string | null;
          size_bytes?: number | null;
          status?: IngestStatus;
          error?: string | null;
          metadata?: Json;
          created_at?: TimestampString;
          updated_at?: TimestampString;
        };
        Update: Partial<Database['public']['Tables']['documents']['Insert']>;
        Relationships: [];
      };
      document_chunks: {
        Row: {
          id: UuidString;
          org_id: UuidString;
          assistant_id: UuidString;
          document_id: UuidString;
          chunk_index: number;
          content: string;
          token_count: number | null;
          embedding: string | null;
          metadata: Json;
          created_at: TimestampString;
        };
        Insert: {
          id?: UuidString;
          org_id: UuidString;
          assistant_id: UuidString;
          document_id: UuidString;
          chunk_index: number;
          content: string;
          token_count?: number | null;
          embedding?: string | null;
          metadata?: Json;
          created_at?: TimestampString;
        };
        Update: Partial<Database['public']['Tables']['document_chunks']['Insert']>;
        Relationships: [];
      };
      published_assistants: {
        Row: {
          id: UuidString;
          public_id: string;
          org_id: UuidString;
          assistant_id: UuidString;
          version: number;
          graph_snapshot: Json;
          settings_snapshot: Json;
          status: PublishedStatus;
          visibility: Visibility;
          created_by: UuidString | null;
          created_at: TimestampString;
          updated_at: TimestampString;
        };
        Insert: {
          id?: UuidString;
          public_id: string;
          org_id: UuidString;
          assistant_id: UuidString;
          version?: number;
          graph_snapshot: Json;
          settings_snapshot?: Json;
          status?: PublishedStatus;
          visibility?: Visibility;
          created_by?: UuidString | null;
          created_at?: TimestampString;
          updated_at?: TimestampString;
        };
        Update: Partial<Database['public']['Tables']['published_assistants']['Insert']>;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: UuidString;
          org_id: UuidString;
          assistant_id: UuidString;
          published_assistant_id: UuidString | null;
          session_id: string | null;
          user_id: UuidString | null;
          channel: string;
          created_at: TimestampString;
        };
        Insert: {
          id?: UuidString;
          org_id: UuidString;
          assistant_id: UuidString;
          published_assistant_id?: UuidString | null;
          session_id?: string | null;
          user_id?: UuidString | null;
          channel?: string;
          created_at?: TimestampString;
        };
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: UuidString;
          org_id: UuidString;
          conversation_id: UuidString;
          role: MessageRole;
          content: string;
          citations: Json;
          metadata: Json;
          created_at: TimestampString;
        };
        Insert: {
          id?: UuidString;
          org_id: UuidString;
          conversation_id: UuidString;
          role: MessageRole;
          content: string;
          citations?: Json;
          metadata?: Json;
          created_at?: TimestampString;
        };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
        Relationships: [];
      };
      usage_events: {
        Row: {
          id: UuidString;
          org_id: UuidString;
          assistant_id: UuidString;
          event_type: string;
          metadata: Json;
          created_at: TimestampString;
        };
        Insert: {
          id?: UuidString;
          org_id: UuidString;
          assistant_id: UuidString;
          event_type: string;
          metadata?: Json;
          created_at?: TimestampString;
        };
        Update: Partial<Database['public']['Tables']['usage_events']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_org_member: {
        Args: { org: UuidString };
        Returns: boolean;
      };
      org_role: {
        Args: { org: UuidString };
        Returns: Role | null;
      };
      bootstrap_organization: {
        Args: { p_name: string; p_slug: string };
        Returns: UuidString;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
