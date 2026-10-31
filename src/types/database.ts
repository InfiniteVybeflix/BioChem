/**
 * BioChem — database type contract.
 *
 * This file mirrors `supabase/migrations/*.sql` in the exact shape
 * produced by `supabase gen types typescript`, so the
 * "Database sync" GitHub workflow can regenerate it from the live
 * database without breaking the app:
 *
 *   supabase gen types typescript --linked > src/types/database.ts
 *
 * App-level helpers (UserRole, QuestionOption, jsonb accessors …)
 * live in `src/types/domain.ts` — import from there.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
          role: Database["public"]["Enums"]["user_role"];
          xp: number;
          streak_count: number;
          longest_streak: number;
          last_active_date: string | null;
          timezone: string;
          suspended: boolean;
          suspension_reason: string | null;
          school_id: string | null;
          year_of_study: number | null;
          year_synced_at: string | null;
          approved: boolean;
          onboarding_done: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          avatar_url?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          xp?: number;
          streak_count?: number;
          longest_streak?: number;
          last_active_date?: string | null;
          timezone?: string;
          suspended?: boolean;
          suspension_reason?: string | null;
          school_id?: string | null;
          year_of_study?: number | null;
          year_synced_at?: string | null;
          approved?: boolean;
          onboarding_done?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          avatar_url?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          xp?: number;
          streak_count?: number;
          longest_streak?: number;
          last_active_date?: string | null;
          timezone?: string;
          suspended?: boolean;
          suspension_reason?: string | null;
          school_id?: string | null;
          year_of_study?: number | null;
          year_synced_at?: string | null;
          approved?: boolean;
          onboarding_done?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          id: string;
          name: string;
          short_name: string;
          country: string;
          logo_url: string | null;
          max_years: number;
          current_academic_year: string;
          year_advance_at: string | null;
          last_advanced_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          short_name: string;
          country?: string;
          logo_url?: string | null;
          max_years?: number;
          current_academic_year?: string;
          year_advance_at?: string | null;
          last_advanced_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          short_name?: string;
          country?: string;
          logo_url?: string | null;
          max_years?: number;
          current_academic_year?: string;
          year_advance_at?: string | null;
          last_advanced_at?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      site_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          updated_at?: string;
        };
        Update: {
          value?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      topics: {
        Row: {
          id: string;
          zone: Database["public"]["Enums"]["exam_zone"];
          parent_id: string | null;
          title: string;
          slug: string;
          description: string | null;
          order_index: number;
          school_id: string | null;
          year: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          zone: Database["public"]["Enums"]["exam_zone"];
          parent_id?: string | null;
          title: string;
          slug: string;
          description?: string | null;
          order_index?: number;
          school_id?: string | null;
          year?: number | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          zone?: Database["public"]["Enums"]["exam_zone"];
          parent_id?: string | null;
          title?: string;
          description?: string | null;
          order_index?: number;
          school_id?: string | null;
          year?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "topics_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "topics_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "topics_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notes: {
        Row: {
          id: string;
          topic_id: string;
          title: string;
          slug: string;
          summary: string | null;
          content_md: string;
          status: Database["public"]["Enums"]["content_status"];
          is_exam_critical: boolean;
          contributed_by: string | null;
          published_by: string | null;
          reading_minutes: number;
          tags: string[];
          views: number;
          created_at: string;
          updated_at: string;
          published_at: string | null;
        };
        Insert: {
          id?: string;
          topic_id: string;
          title: string;
          slug: string;
          summary?: string | null;
          content_md: string;
          status?: Database["public"]["Enums"]["content_status"];
          is_exam_critical?: boolean;
          contributed_by?: string | null;
          published_by?: string | null;
          reading_minutes?: number;
          tags?: string[];
          views?: number;
          created_at?: string;
          updated_at?: string;
          published_at?: string | null;
        };
        Update: {
          topic_id?: string;
          title?: string;
          summary?: string | null;
          content_md?: string;
          status?: Database["public"]["Enums"]["content_status"];
          is_exam_critical?: boolean;
          reading_minutes?: number;
          tags?: string[];
          updated_at?: string;
          published_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notes_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_contributed_by_fkey";
            columns: ["contributed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      outcomes: {
        Row: {
          id: string;
          topic_id: string;
          code: string;
          statement: string;
          order_index: number;
        };
        Insert: {
          id?: string;
          topic_id: string;
          code: string;
          statement: string;
          order_index?: number;
        };
        Update: {
          statement?: string;
          order_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: "outcomes_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      user_outcome_progress: {
        Row: {
          id: string;
          user_id: string;
          outcome_id: string;
          mastered: boolean;
          confidence: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          outcome_id: string;
          mastered?: boolean;
          confidence?: number;
          updated_at?: string;
        };
        Update: {
          mastered?: boolean;
          confidence?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "uop_outcome_id_fkey";
            columns: ["outcome_id"];
            isOneToOne: false;
            referencedRelation: "outcomes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_outcome_progress_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: {
          id: string;
          topic_id: string | null;
          zone: Database["public"]["Enums"]["exam_zone"];
          difficulty: Database["public"]["Enums"]["difficulty"];
          type: Database["public"]["Enums"]["question_type"];
          stem_md: string;
          options: Json;
          answer_key: string;
          explanation_md: string;
          marks: number;
          source: string;
          created_by: string | null;
          status: Database["public"]["Enums"]["content_status"];
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          topic_id?: string | null;
          zone: Database["public"]["Enums"]["exam_zone"];
          difficulty?: Database["public"]["Enums"]["difficulty"];
          type?: Database["public"]["Enums"]["question_type"];
          stem_md: string;
          options?: Json;
          answer_key: string;
          explanation_md?: string;
          marks?: number;
          source?: string;
          created_by?: string | null;
          status?: Database["public"]["Enums"]["content_status"];
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          topic_id?: string | null;
          stem_md?: string;
          options?: Json;
          answer_key?: string;
          explanation_md?: string;
          marks?: number;
          status?: Database["public"]["Enums"]["content_status"];
          tags?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questions_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      exams: {
        Row: {
          id: string;
          title: string;
          zone: Database["public"]["Enums"]["exam_zone"];
          description: string | null;
          duration_minutes: number;
          total_marks: number;
          created_by: string | null;
          is_past_paper: boolean;
          past_paper_url: string | null;
          worked_solutions_url: string | null;
          published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          zone: Database["public"]["Enums"]["exam_zone"];
          description?: string | null;
          duration_minutes?: number;
          total_marks?: number;
          created_by?: string | null;
          is_past_paper?: boolean;
          past_paper_url?: string | null;
          worked_solutions_url?: string | null;
          published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          duration_minutes?: number;
          total_marks?: number;
          past_paper_url?: string | null;
          worked_solutions_url?: string | null;
          published?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "exams_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_questions: {
        Row: {
          exam_id: string;
          question_id: string;
          order_index: number;
          marks: number;
        };
        Insert: {
          exam_id: string;
          question_id: string;
          order_index?: number;
          marks?: number;
        };
        Update: {
          order_index?: number;
          marks?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_questions_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_attempts: {
        Row: {
          id: string;
          user_id: string;
          exam_id: string | null;
          zone: Database["public"]["Enums"]["exam_zone"];
          mode: Database["public"]["Enums"]["attempt_mode"];
          config: Json;
          question_ids: string[];
          answers: Json;
          score: number;
          max_score: number;
          status: Database["public"]["Enums"]["attempt_status"];
          started_at: string;
          submitted_at: string | null;
          duration_seconds: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          exam_id?: string | null;
          zone: Database["public"]["Enums"]["exam_zone"];
          mode?: Database["public"]["Enums"]["attempt_mode"];
          config?: Json;
          question_ids: string[];
          answers?: Json;
          score?: number;
          max_score?: number;
          status?: Database["public"]["Enums"]["attempt_status"];
          started_at?: string;
          submitted_at?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
        };
        Update: {
          answers?: Json;
          score?: number;
          max_score?: number;
          status?: Database["public"]["Enums"]["attempt_status"];
          submitted_at?: string | null;
          duration_seconds?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey";
            columns: ["exam_id"];
            isOneToOne: false;
            referencedRelation: "exams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_attempts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      flashcards: {
        Row: {
          id: string;
          topic_id: string | null;
          note_id: string | null;
          front_md: string;
          back_md: string;
          source: string;
          visibility: Database["public"]["Enums"]["visibility"];
          created_by: string | null;
          status: Database["public"]["Enums"]["content_status"];
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          topic_id?: string | null;
          note_id?: string | null;
          front_md: string;
          back_md: string;
          source?: string;
          visibility?: Database["public"]["Enums"]["visibility"];
          created_by?: string | null;
          status?: Database["public"]["Enums"]["content_status"];
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          front_md?: string;
          back_md?: string;
          visibility?: Database["public"]["Enums"]["visibility"];
          status?: Database["public"]["Enums"]["content_status"];
          tags?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flashcards_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flashcards_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flashcards_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      flashcard_reviews: {
        Row: {
          id: string;
          user_id: string;
          flashcard_id: string;
          ease: number;
          interval_days: number;
          repetitions: number;
          lapses: number;
          due_date: string;
          last_reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          flashcard_id: string;
          ease?: number;
          interval_days?: number;
          repetitions?: number;
          lapses?: number;
          due_date?: string;
          last_reviewed_at?: string | null;
        };
        Update: {
          ease?: number;
          interval_days?: number;
          repetitions?: number;
          lapses?: number;
          due_date?: string;
          last_reviewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "flashcard_reviews_flashcard_id_fkey";
            columns: ["flashcard_id"];
            isOneToOne: false;
            referencedRelation: "flashcards";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "flashcard_reviews_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      submissions: {
        Row: {
          id: string;
          user_id: string;
          type: Database["public"]["Enums"]["submission_type"];
          topic_id: string | null;
          title: string;
          content_md: string | null;
          payload: Json;
          status: Database["public"]["Enums"]["content_status"];
          reviewed_by: string | null;
          review_notes: string | null;
          created_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: Database["public"]["Enums"]["submission_type"];
          topic_id?: string | null;
          title: string;
          content_md?: string | null;
          payload?: Json;
          status?: Database["public"]["Enums"]["content_status"];
          created_at?: string;
        };
        Update: {
          status?: Database["public"]["Enums"]["content_status"];
          review_notes?: string | null;
          reviewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      discussions: {
        Row: {
          id: string;
          topic_id: string | null;
          user_id: string;
          title: string;
          body_md: string;
          is_answered: boolean;
          is_pinned: boolean;
          views: number;
          reply_count: number;
          last_activity_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          topic_id?: string | null;
          user_id: string;
          title: string;
          body_md: string;
          is_answered?: boolean;
          is_pinned?: boolean;
          views?: number;
          reply_count?: number;
          last_activity_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          body_md?: string;
          is_answered?: boolean;
          is_pinned?: boolean;
          updated_at?: string;
          last_activity_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discussions_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discussions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      discussion_replies: {
        Row: {
          id: string;
          discussion_id: string;
          user_id: string;
          parent_reply_id: string | null;
          body_md: string;
          is_verified: boolean;
          verified_by: string | null;
          upvotes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          discussion_id: string;
          user_id: string;
          parent_reply_id?: string | null;
          body_md: string;
          is_verified?: boolean;
          verified_by?: string | null;
          upvotes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          body_md?: string;
          is_verified?: boolean;
          verified_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "discussion_replies_discussion_id_fkey";
            columns: ["discussion_id"];
            isOneToOne: false;
            referencedRelation: "discussions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "discussion_replies_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      discussion_upvotes: {
        Row: {
          discussion_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          discussion_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      reply_upvotes: {
        Row: {
          reply_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          reply_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      chat_conversations: {
        Row: {
          id: string;
          kind: string;
          name: string | null;
          topic_id: string | null;
          created_by: string | null;
          last_message_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          kind: string;
          name?: string | null;
          topic_id?: string | null;
          created_by?: string | null;
          last_message_at?: string;
          created_at?: string;
        };
        Update: {
          name?: string | null;
          last_message_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_conversations_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_conversations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_members: {
        Row: {
          conversation_id: string;
          user_id: string;
          role: string;
          joined_at: string;
          last_read_at: string | null;
        };
        Insert: {
          conversation_id: string;
          user_id: string;
          role?: string;
          joined_at?: string;
          last_read_at?: string | null;
        };
        Update: {
          role?: string;
          last_read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "chat_members_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "chat_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_keys: {
        Row: {
          conversation_id: string;
          key_b64: string;
        };
        Insert: {
          conversation_id: string;
          key_b64: string;
        };
        Update: {
          key_b64?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_keys_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "chat_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          kind: string;
          cipher_b64: string;
          iv: string;
          attachment: Json | null;
          reply_to: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          kind?: string;
          cipher_b64?: string;
          iv?: string;
          attachment?: Json | null;
          reply_to?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          cipher_b64?: string;
          iv?: string;
          attachment?: Json | null;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "chat_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_messages_reply_to_fkey";
            columns: ["reply_to"];
            isOneToOne: false;
            referencedRelation: "chat_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      chat_reports: {
        Row: {
          id: string;
          reporter_id: string;
          message_id: string;
          reason: string;
          status: Database["public"]["Enums"]["chat_report_status"];
          resolved_by: string | null;
          resolution_notes: string | null;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          message_id: string;
          reason: string;
          status?: Database["public"]["Enums"]["chat_report_status"];
          created_at?: string;
        };
        Update: {
          status?: Database["public"]["Enums"]["chat_report_status"];
          resolution_notes?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "chat_reports_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "chat_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      support_tickets: {
        Row: {
          id: string;
          user_id: string | null;
          email: string;
          category: string;
          subject: string;
          message: string;
          status: string;
          page: string | null;
          user_agent: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          email?: string;
          category: string;
          subject: string;
          message: string;
          status?: string;
          page?: string | null;
          user_agent?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      support_replies: {
        Row: {
          id: string;
          ticket_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          body: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "support_replies_ticket_id_fkey";
            columns: ["ticket_id"];
            isOneToOne: false;
            referencedRelation: "support_tickets";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          id: string;
          posted_by: string;
          title: string;
          org: string;
          location: string;
          type: Database["public"]["Enums"]["job_type"];
          description_md: string;
          contact: string;
          status: Database["public"]["Enums"]["job_status"];
          approved_by: string | null;
          closes_at: string | null;
          is_sponsored: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          posted_by: string;
          title: string;
          org: string;
          location: string;
          type: Database["public"]["Enums"]["job_type"];
          description_md: string;
          contact: string;
          status?: Database["public"]["Enums"]["job_status"];
          approved_by?: string | null;
          closes_at?: string | null;
          is_sponsored?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          org?: string;
          location?: string;
          type?: Database["public"]["Enums"]["job_type"];
          description_md?: string;
          contact?: string;
          status?: Database["public"]["Enums"]["job_status"];
          closes_at?: string | null;
          is_sponsored?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_posted_by_fkey";
            columns: ["posted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      job_enquiries: {
        Row: {
          id: string;
          job_id: string;
          user_id: string;
          message: string;
          status: Database["public"]["Enums"]["enquiry_status"];
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          user_id: string;
          message: string;
          status?: Database["public"]["Enums"]["enquiry_status"];
          created_at?: string;
        };
        Update: {
          status?: Database["public"]["Enums"]["enquiry_status"];
        };
        Relationships: [
          {
            foreignKeyName: "job_enquiries_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_enquiries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ads: {
        Row: {
          id: string;
          title: string;
          body: string;
          placement: Database["public"]["Enums"]["ad_placement"];
          target_url: string;
          image_url: string | null;
          cta_label: string;
          starts_at: string;
          ends_at: string | null;
          impressions: number;
          clicks: number;
          enabled: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body: string;
          placement: Database["public"]["Enums"]["ad_placement"];
          target_url: string;
          image_url?: string | null;
          cta_label?: string;
          starts_at?: string;
          ends_at?: string | null;
          enabled?: boolean;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          title?: string;
          body?: string;
          placement?: Database["public"]["Enums"]["ad_placement"];
          target_url?: string;
          image_url?: string | null;
          cta_label?: string;
          ends_at?: string | null;
          enabled?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "ads_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ad_impressions: {
        Row: {
          id: string;
          ad_id: string;
          user_id: string | null;
          kind: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ad_id: string;
          user_id?: string | null;
          kind?: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "ad_impressions_ad_id_fkey";
            columns: ["ad_id"];
            isOneToOne: false;
            referencedRelation: "ads";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          title: string;
          body: string | null;
          link: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          title: string;
          body?: string | null;
          link?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_prefs: {
        Row: {
          user_id: string;
          new_notes: boolean;
          mock_results: boolean;
          chat_mentions: boolean;
          daily_questions: boolean;
          announcements: boolean;
          jobs: boolean;
          push_enabled: boolean;
          email_digest: boolean;
          quiet_start: string;
          quiet_end: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          new_notes?: boolean;
          mock_results?: boolean;
          chat_mentions?: boolean;
          daily_questions?: boolean;
          announcements?: boolean;
          jobs?: boolean;
          push_enabled?: boolean;
          email_digest?: boolean;
          quiet_start?: string;
          quiet_end?: string;
          updated_at?: string;
        };
        Update: {
          new_notes?: boolean;
          mock_results?: boolean;
          chat_mentions?: boolean;
          daily_questions?: boolean;
          announcements?: boolean;
          jobs?: boolean;
          push_enabled?: boolean;
          email_digest?: boolean;
          quiet_start?: string;
          quiet_end?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          keys: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          keys: Json;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          archived?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_conversations_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: string;
          content: string;
          grounding_note_ids: string[];
          model: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: string;
          content: string;
          grounding_note_ids?: string[];
          model?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_question_settings: {
        Row: {
          user_id: string;
          topic_ids: string[];
          difficulty: Database["public"]["Enums"]["difficulty"];
          count: number;
          delivery_time: string;
          timezone: string;
          enabled: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          topic_ids?: string[];
          difficulty?: Database["public"]["Enums"]["difficulty"];
          count?: number;
          delivery_time?: string;
          timezone?: string;
          enabled?: boolean;
          updated_at?: string;
        };
        Update: {
          topic_ids?: string[];
          difficulty?: Database["public"]["Enums"]["difficulty"];
          count?: number;
          delivery_time?: string;
          timezone?: string;
          enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_question_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_questions: {
        Row: {
          id: string;
          user_id: string;
          for_date: string;
          topic_id: string | null;
          difficulty: Database["public"]["Enums"]["difficulty"];
          payload: Json;
          selected_answer: string | null;
          is_correct: boolean | null;
          answered_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          for_date: string;
          topic_id?: string | null;
          difficulty?: Database["public"]["Enums"]["difficulty"];
          payload: Json;
          selected_answer?: string | null;
          is_correct?: boolean | null;
          answered_at?: string | null;
          created_at?: string;
        };
        Update: {
          selected_answer?: string | null;
          is_correct?: boolean | null;
          answered_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "daily_questions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "daily_questions_topic_id_fkey";
            columns: ["topic_id"];
            isOneToOne: false;
            referencedRelation: "topics";
            referencedColumns: ["id"];
          },
        ];
      };
      study_plans: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          source: string;
          raw_input: string | null;
          plan: Json;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          source?: string;
          raw_input?: string | null;
          plan: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          plan?: Json;
          active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "study_plans_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_events: {
        Row: {
          id: string;
          user_id: string;
          study_plan_id: string | null;
          title: string;
          type: Database["public"]["Enums"]["plan_event_type"];
          day_of_week: number | null;
          date: string | null;
          start_time: string;
          end_time: string;
          notes: string | null;
          color: string;
          reminder_minutes: number | null;
          reminder_sent_at: string | null;
          completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          study_plan_id?: string | null;
          title: string;
          type?: Database["public"]["Enums"]["plan_event_type"];
          day_of_week?: number | null;
          date?: string | null;
          start_time: string;
          end_time: string;
          notes?: string | null;
          color?: string;
          reminder_minutes?: number | null;
          completed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          type?: Database["public"]["Enums"]["plan_event_type"];
          day_of_week?: number | null;
          date?: string | null;
          start_time?: string;
          end_time?: string;
          notes?: string | null;
          color?: string;
          reminder_minutes?: number | null;
          reminder_sent_at?: string | null;
          completed?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plan_events_study_plan_id_fkey";
            columns: ["study_plan_id"];
            isOneToOne: false;
            referencedRelation: "study_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      announcements: {
        Row: {
          id: string;
          author_id: string | null;
          title: string;
          body_md: string;
          audience: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id?: string | null;
          title: string;
          body_md: string;
          audience?: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      feature_flags: {
        Row: {
          key: string;
          enabled: boolean;
          description: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          enabled: boolean;
          description?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          enabled?: boolean;
          description?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      leaderboard_entries: {
        Row: {
          id: string;
          user_id: string;
          period: string;
          points: number;
          contributions: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          period: string;
          points?: number;
          contributions?: number;
          updated_at?: string;
        };
        Update: {
          points?: number;
          contributions?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leaderboard_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      xp_events: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          reason: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          reason: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "xp_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage: {
        Row: {
          id: string;
          user_id: string | null;
          task: Database["public"]["Enums"]["ai_task_type"];
          model: string;
          status: string;
          latency_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          task: Database["public"]["Enums"]["ai_task_type"];
          model: string;
          status?: string;
          latency_ms?: number | null;
          created_at?: string;
        };
        Update: {
          model?: string;
          status?: string;
          latency_ms?: number | null;
        };
        Relationships: [];
      };
      ai_queue: {
        Row: {
          id: string;
          user_id: string | null;
          task: Database["public"]["Enums"]["ai_task_type"];
          payload: Json;
          attempts: number;
          max_attempts: number;
          next_attempt_at: string;
          status: Database["public"]["Enums"]["ai_queue_status"];
          last_error: string | null;
          result: Json | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          task: Database["public"]["Enums"]["ai_task_type"];
          payload?: Json;
          attempts?: number;
          max_attempts?: number;
          next_attempt_at?: string;
          status?: Database["public"]["Enums"]["ai_queue_status"];
          last_error?: string | null;
          result?: Json | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          attempts?: number;
          next_attempt_at?: string;
          status?: Database["public"]["Enums"]["ai_queue_status"];
          last_error?: string | null;
          result?: Json | null;
          processed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      touch_streak: { Args: Record<string, never>; Returns: number };
      award_xp: { Args: { p_amount: number; p_reason: string }; Returns: number };
      award_xp_to: {
        Args: { p_user: string; p_amount: number; p_reason: string };
        Returns: number;
      };
      refresh_monthly_leaderboard: { Args: Record<string, never>; Returns: void };
      increment_note_views: { Args: { p_note_id: string }; Returns: void };
      increment_discussion_views: { Args: { p_discussion_id: string }; Returns: void };
      current_app_role: { Args: Record<string, never>; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      is_chat_member: { Args: { p_conversation: string }; Returns: boolean };
      sync_my_year: { Args: Record<string, never>; Returns: number };
      advance_school_year: { Args: { p_school: string }; Returns: number };
    };
    Enums: {
      user_role: "student" | "lecturer" | "admin";
      exam_zone: "cat1" | "cat2" | "main";
      difficulty: "easy" | "medium" | "hard";
      content_status: "draft" | "pending" | "published" | "rejected" | "archived";
      question_type: "mcq" | "short_answer" | "long_answer" | "structured";
      attempt_status: "in_progress" | "submitted" | "abandoned";
      attempt_mode: "practice" | "mock" | "custom" | "past_paper";
      job_type: "internship" | "entry" | "full_time";
      job_status: "pending" | "approved" | "rejected" | "closed";
      enquiry_status: "sent" | "read" | "replied";
      ad_placement: "jobs" | "events" | "resources" | "sidebar" | "banner";
      notification_type:
        | "new_notes"
        | "mock_results"
        | "chat_mentions"
        | "daily_questions"
        | "announcements"
        | "jobs"
        | "system";
      submission_type: "note" | "question" | "past_paper" | "flashcard_set";
      plan_event_type: "study" | "class" | "exam" | "personal" | "deadline";
      ai_task_type:
        | "tutor"
        | "explain"
        | "daily_questions"
        | "study_plan"
        | "flashcards"
        | "week_planner"
        | "moderation";
      visibility: "public" | "private";
      chat_report_status: "open" | "resolved" | "dismissed";
      ai_queue_status: "pending" | "processing" | "done" | "failed" | "dead";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database[Extract<keyof Database, "public">];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
export type CompositeTypes<T extends keyof PublicSchema["CompositeTypes"]> =
  PublicSchema["CompositeTypes"][T];
