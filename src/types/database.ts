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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ad_impressions: {
        Row: {
          ad_id: string
          created_at: string
          id: string
          kind: string
          user_id: string | null
        }
        Insert: {
          ad_id: string
          created_at?: string
          id?: string
          kind?: string
          user_id?: string | null
        }
        Update: {
          ad_id?: string
          created_at?: string
          id?: string
          kind?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_impressions_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_impressions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ads: {
        Row: {
          body: string
          clicks: number
          created_at: string
          created_by: string | null
          cta_label: string
          enabled: boolean
          ends_at: string | null
          id: string
          image_url: string | null
          impressions: number
          placement: Database["public"]["Enums"]["ad_placement"]
          starts_at: string
          target_url: string
          title: string
        }
        Insert: {
          body: string
          clicks?: number
          created_at?: string
          created_by?: string | null
          cta_label?: string
          enabled?: boolean
          ends_at?: string | null
          id?: string
          image_url?: string | null
          impressions?: number
          placement: Database["public"]["Enums"]["ad_placement"]
          starts_at?: string
          target_url: string
          title: string
        }
        Update: {
          body?: string
          clicks?: number
          created_at?: string
          created_by?: string | null
          cta_label?: string
          enabled?: boolean
          ends_at?: string | null
          id?: string
          image_url?: string | null
          impressions?: number
          placement?: Database["public"]["Enums"]["ad_placement"]
          starts_at?: string
          target_url?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          grounding_note_ids: string[]
          id: string
          model: string | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          grounding_note_ids?: string[]
          id?: string
          model?: string | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          grounding_note_ids?: string[]
          id?: string
          model?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_queue: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          processed_at: string | null
          result: Json | null
          status: Database["public"]["Enums"]["ai_queue_status"]
          task: Database["public"]["Enums"]["ai_task_type"]
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          processed_at?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["ai_queue_status"]
          task: Database["public"]["Enums"]["ai_task_type"]
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          processed_at?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["ai_queue_status"]
          task?: Database["public"]["Enums"]["ai_task_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          created_at: string
          id: string
          latency_ms: number | null
          model: string
          status: string
          task: Database["public"]["Enums"]["ai_task_type"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          model: string
          status?: string
          task: Database["public"]["Enums"]["ai_task_type"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string
          status?: string
          task?: Database["public"]["Enums"]["ai_task_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          author_id: string | null
          body_md: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          audience?: string
          author_id?: string | null
          body_md: string
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          audience?: string
          author_id?: string | null
          body_md?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          last_message_at: string
          name: string | null
          topic_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          last_message_at?: string
          name?: string | null
          topic_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          last_message_at?: string
          name?: string | null
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_keys: {
        Row: {
          conversation_id: string
          key_b64: string
        }
        Insert: {
          conversation_id: string
          key_b64: string
        }
        Update: {
          conversation_id?: string
          key_b64?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_keys_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_members: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachment: Json | null
          cipher_b64: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          iv: string
          kind: string
          reply_to: string | null
          sender_id: string
        }
        Insert: {
          attachment?: Json | null
          cipher_b64?: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          iv?: string
          kind?: string
          reply_to?: string | null
          sender_id: string
        }
        Update: {
          attachment?: Json | null
          cipher_b64?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          iv?: string
          kind?: string
          reply_to?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reports: {
        Row: {
          created_at: string
          id: string
          message_id: string
          reason: string
          reporter_id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["chat_report_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          reason: string
          reporter_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["chat_report_status"]
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          reason?: string
          reporter_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["chat_report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "chat_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_question_settings: {
        Row: {
          count: number
          delivery_time: string
          difficulty: Database["public"]["Enums"]["difficulty"]
          enabled: boolean
          timezone: string
          topic_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          delivery_time?: string
          difficulty?: Database["public"]["Enums"]["difficulty"]
          enabled?: boolean
          timezone?: string
          topic_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          delivery_time?: string
          difficulty?: Database["public"]["Enums"]["difficulty"]
          enabled?: boolean
          timezone?: string
          topic_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_question_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_questions: {
        Row: {
          answered_at: string | null
          created_at: string
          difficulty: Database["public"]["Enums"]["difficulty"]
          for_date: string
          id: string
          is_correct: boolean | null
          payload: Json
          selected_answer: string | null
          topic_id: string | null
          user_id: string
        }
        Insert: {
          answered_at?: string | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty"]
          for_date?: string
          id?: string
          is_correct?: boolean | null
          payload: Json
          selected_answer?: string | null
          topic_id?: string | null
          user_id: string
        }
        Update: {
          answered_at?: string | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty"]
          for_date?: string
          id?: string
          is_correct?: boolean | null
          payload?: Json
          selected_answer?: string | null
          topic_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_questions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_replies: {
        Row: {
          body_md: string
          created_at: string
          discussion_id: string
          id: string
          is_verified: boolean
          parent_reply_id: string | null
          updated_at: string
          upvotes: number
          user_id: string
          verified_by: string | null
        }
        Insert: {
          body_md: string
          created_at?: string
          discussion_id: string
          id?: string
          is_verified?: boolean
          parent_reply_id?: string | null
          updated_at?: string
          upvotes?: number
          user_id: string
          verified_by?: string | null
        }
        Update: {
          body_md?: string
          created_at?: string
          discussion_id?: string
          id?: string
          is_verified?: boolean
          parent_reply_id?: string | null
          updated_at?: string
          upvotes?: number
          user_id?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discussion_replies_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "discussions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_replies_parent_reply_id_fkey"
            columns: ["parent_reply_id"]
            isOneToOne: false
            referencedRelation: "discussion_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_replies_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_upvotes: {
        Row: {
          created_at: string
          discussion_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          discussion_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          discussion_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussion_upvotes_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "discussions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_upvotes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discussions: {
        Row: {
          body_md: string
          created_at: string
          id: string
          is_answered: boolean
          is_pinned: boolean
          last_activity_at: string
          reply_count: number
          search: unknown
          title: string
          topic_id: string | null
          updated_at: string
          user_id: string
          views: number
        }
        Insert: {
          body_md: string
          created_at?: string
          id?: string
          is_answered?: boolean
          is_pinned?: boolean
          last_activity_at?: string
          reply_count?: number
          search?: unknown
          title: string
          topic_id?: string | null
          updated_at?: string
          user_id: string
          views?: number
        }
        Update: {
          body_md?: string
          created_at?: string
          id?: string
          is_answered?: boolean
          is_pinned?: boolean
          last_activity_at?: string
          reply_count?: number
          search?: unknown
          title?: string
          topic_id?: string | null
          updated_at?: string
          user_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "discussions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          answers: Json
          config: Json
          created_at: string
          duration_seconds: number | null
          exam_id: string | null
          id: string
          max_score: number
          mode: string
          question_ids: string[]
          score: number
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          submitted_at: string | null
          user_id: string
          zone: Database["public"]["Enums"]["exam_zone"]
        }
        Insert: {
          answers?: Json
          config?: Json
          created_at?: string
          duration_seconds?: number | null
          exam_id?: string | null
          id?: string
          max_score?: number
          mode?: string
          question_ids?: string[]
          score?: number
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          submitted_at?: string | null
          user_id: string
          zone: Database["public"]["Enums"]["exam_zone"]
        }
        Update: {
          answers?: Json
          config?: Json
          created_at?: string
          duration_seconds?: number | null
          exam_id?: string | null
          id?: string
          max_score?: number
          mode?: string
          question_ids?: string[]
          score?: number
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          submitted_at?: string | null
          user_id?: string
          zone?: Database["public"]["Enums"]["exam_zone"]
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          exam_id: string
          marks: number
          order_index: number
          question_id: string
        }
        Insert: {
          exam_id: string
          marks?: number
          order_index?: number
          question_id: string
        }
        Update: {
          exam_id?: string
          marks?: number
          order_index?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          id: string
          is_past_paper: boolean
          past_paper_url: string | null
          published: boolean
          title: string
          total_marks: number
          updated_at: string
          worked_solutions_url: string | null
          zone: Database["public"]["Enums"]["exam_zone"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_past_paper?: boolean
          past_paper_url?: string | null
          published?: boolean
          title: string
          total_marks?: number
          updated_at?: string
          worked_solutions_url?: string | null
          zone: Database["public"]["Enums"]["exam_zone"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          is_past_paper?: boolean
          past_paper_url?: string | null
          published?: boolean
          title?: string
          total_marks?: number
          updated_at?: string
          worked_solutions_url?: string | null
          zone?: Database["public"]["Enums"]["exam_zone"]
        }
        Relationships: [
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_reviews: {
        Row: {
          due_date: string
          ease: number
          flashcard_id: string
          id: string
          interval_days: number
          lapses: number
          last_reviewed_at: string | null
          repetitions: number
          user_id: string
        }
        Insert: {
          due_date?: string
          ease?: number
          flashcard_id: string
          id?: string
          interval_days?: number
          lapses?: number
          last_reviewed_at?: string | null
          repetitions?: number
          user_id: string
        }
        Update: {
          due_date?: string
          ease?: number
          flashcard_id?: string
          id?: string
          interval_days?: number
          lapses?: number
          last_reviewed_at?: string | null
          repetitions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_reviews_flashcard_id_fkey"
            columns: ["flashcard_id"]
            isOneToOne: false
            referencedRelation: "flashcards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcards: {
        Row: {
          back_md: string
          created_at: string
          created_by: string | null
          front_md: string
          id: string
          note_id: string | null
          source: string
          status: Database["public"]["Enums"]["content_status"]
          tags: string[]
          topic_id: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility"]
        }
        Insert: {
          back_md: string
          created_at?: string
          created_by?: string | null
          front_md: string
          id?: string
          note_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          topic_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Update: {
          back_md?: string
          created_at?: string
          created_by?: string | null
          front_md?: string
          id?: string
          note_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          topic_id?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      job_enquiries: {
        Row: {
          created_at: string
          id: string
          job_id: string
          message: string
          status: Database["public"]["Enums"]["enquiry_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          message: string
          status?: Database["public"]["Enums"]["enquiry_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          message?: string
          status?: Database["public"]["Enums"]["enquiry_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_enquiries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_enquiries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          approved_by: string | null
          closes_at: string | null
          contact: string
          created_at: string
          description_md: string
          id: string
          is_sponsored: boolean
          location: string
          org: string
          posted_by: string
          status: Database["public"]["Enums"]["job_status"]
          title: string
          type: Database["public"]["Enums"]["job_type"]
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          closes_at?: string | null
          contact: string
          created_at?: string
          description_md: string
          id?: string
          is_sponsored?: boolean
          location: string
          org: string
          posted_by: string
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          type: Database["public"]["Enums"]["job_type"]
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          closes_at?: string | null
          contact?: string
          created_at?: string
          description_md?: string
          id?: string
          is_sponsored?: boolean
          location?: string
          org?: string
          posted_by?: string
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          type?: Database["public"]["Enums"]["job_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_entries: {
        Row: {
          contributions: number
          id: string
          period: string
          points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          contributions?: number
          id?: string
          period: string
          points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          contributions?: number
          id?: string
          period?: string
          points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content_md: string
          contributed_by: string | null
          created_at: string
          id: string
          is_exam_critical: boolean
          published_at: string | null
          published_by: string | null
          reading_minutes: number
          search: unknown
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          summary: string | null
          tags: string[]
          title: string
          topic_id: string
          updated_at: string
          views: number
        }
        Insert: {
          content_md: string
          contributed_by?: string | null
          created_at?: string
          id?: string
          is_exam_critical?: boolean
          published_at?: string | null
          published_by?: string | null
          reading_minutes?: number
          search?: unknown
          slug: string
          status?: Database["public"]["Enums"]["content_status"]
          summary?: string | null
          tags?: string[]
          title: string
          topic_id: string
          updated_at?: string
          views?: number
        }
        Update: {
          content_md?: string
          contributed_by?: string | null
          created_at?: string
          id?: string
          is_exam_critical?: boolean
          published_at?: string | null
          published_by?: string | null
          reading_minutes?: number
          search?: unknown
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          summary?: string | null
          tags?: string[]
          title?: string
          topic_id?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "notes_contributed_by_fkey"
            columns: ["contributed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          announcements: boolean
          chat_mentions: boolean
          daily_questions: boolean
          email_digest: boolean
          jobs: boolean
          mock_results: boolean
          new_notes: boolean
          push_enabled: boolean
          quiet_end: string
          quiet_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          announcements?: boolean
          chat_mentions?: boolean
          daily_questions?: boolean
          email_digest?: boolean
          jobs?: boolean
          mock_results?: boolean
          new_notes?: boolean
          push_enabled?: boolean
          quiet_end?: string
          quiet_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          announcements?: boolean
          chat_mentions?: boolean
          daily_questions?: boolean
          email_digest?: boolean
          jobs?: boolean
          mock_results?: boolean
          new_notes?: boolean
          push_enabled?: boolean
          quiet_end?: string
          quiet_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outcomes: {
        Row: {
          code: string
          id: string
          order_index: number
          statement: string
          topic_id: string
        }
        Insert: {
          code: string
          id?: string
          order_index?: number
          statement: string
          topic_id: string
        }
        Update: {
          code?: string
          id?: string
          order_index?: number
          statement?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_events: {
        Row: {
          color: string
          completed: boolean
          created_at: string
          date: string | null
          day_of_week: number | null
          end_time: string
          id: string
          notes: string | null
          reminder_minutes: number | null
          reminder_sent_at: string | null
          start_time: string
          study_plan_id: string | null
          title: string
          type: Database["public"]["Enums"]["plan_event_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          completed?: boolean
          created_at?: string
          date?: string | null
          day_of_week?: number | null
          end_time?: string
          id?: string
          notes?: string | null
          reminder_minutes?: number | null
          reminder_sent_at?: string | null
          start_time?: string
          study_plan_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["plan_event_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          completed?: boolean
          created_at?: string
          date?: string | null
          day_of_week?: number | null
          end_time?: string
          id?: string
          notes?: string | null
          reminder_minutes?: number | null
          reminder_sent_at?: string | null
          start_time?: string
          study_plan_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["plan_event_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_events_study_plan_id_fkey"
            columns: ["study_plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approved: boolean
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          last_active_date: string | null
          longest_streak: number
          onboarding_done: boolean
          role: Database["public"]["Enums"]["user_role"]
          school_id: string | null
          streak_count: number
          suspended: boolean
          suspension_reason: string | null
          timezone: string
          updated_at: string
          xp: number
          year_of_study: number | null
          year_synced_at: string | null
        }
        Insert: {
          approved?: boolean
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          last_active_date?: string | null
          longest_streak?: number
          onboarding_done?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string | null
          streak_count?: number
          suspended?: boolean
          suspension_reason?: string | null
          timezone?: string
          updated_at?: string
          xp?: number
          year_of_study?: number | null
          year_synced_at?: string | null
        }
        Update: {
          approved?: boolean
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          last_active_date?: string | null
          longest_streak?: number
          onboarding_done?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string | null
          streak_count?: number
          suspended?: boolean
          suspension_reason?: string | null
          timezone?: string
          updated_at?: string
          xp?: number
          year_of_study?: number | null
          year_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: Json
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          answer_key: string
          created_at: string
          created_by: string | null
          difficulty: Database["public"]["Enums"]["difficulty"]
          explanation_md: string
          id: string
          marks: number
          options: Json
          search: unknown
          source: string
          status: Database["public"]["Enums"]["content_status"]
          stem_md: string
          tags: string[]
          topic_id: string | null
          type: Database["public"]["Enums"]["question_type"]
          updated_at: string
          zone: Database["public"]["Enums"]["exam_zone"]
        }
        Insert: {
          answer_key: string
          created_at?: string
          created_by?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty"]
          explanation_md?: string
          id?: string
          marks?: number
          options?: Json
          search?: unknown
          source?: string
          status?: Database["public"]["Enums"]["content_status"]
          stem_md: string
          tags?: string[]
          topic_id?: string | null
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
          zone: Database["public"]["Enums"]["exam_zone"]
        }
        Update: {
          answer_key?: string
          created_at?: string
          created_by?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty"]
          explanation_md?: string
          id?: string
          marks?: number
          options?: Json
          search?: unknown
          source?: string
          status?: Database["public"]["Enums"]["content_status"]
          stem_md?: string
          tags?: string[]
          topic_id?: string | null
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
          zone?: Database["public"]["Enums"]["exam_zone"]
        }
        Relationships: [
          {
            foreignKeyName: "questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      reply_upvotes: {
        Row: {
          created_at: string
          reply_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          reply_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          reply_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reply_upvotes_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "discussion_replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reply_upvotes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          country: string
          created_at: string
          current_academic_year: string
          id: string
          is_active: boolean
          last_advanced_at: string | null
          logo_url: string | null
          max_years: number
          name: string
          short_name: string
          updated_at: string
          year_advance_at: string | null
        }
        Insert: {
          country?: string
          created_at?: string
          current_academic_year?: string
          id?: string
          is_active?: boolean
          last_advanced_at?: string | null
          logo_url?: string | null
          max_years?: number
          name: string
          short_name: string
          updated_at?: string
          year_advance_at?: string | null
        }
        Update: {
          country?: string
          created_at?: string
          current_academic_year?: string
          id?: string
          is_active?: boolean
          last_advanced_at?: string | null
          logo_url?: string | null
          max_years?: number
          name?: string
          short_name?: string
          updated_at?: string
          year_advance_at?: string | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      study_plans: {
        Row: {
          active: boolean
          created_at: string
          id: string
          plan: Json
          raw_input: string | null
          source: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          plan?: Json
          raw_input?: string | null
          source?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          plan?: Json
          raw_input?: string | null
          source?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          content_md: string | null
          created_at: string
          id: string
          payload: Json
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
          topic_id: string | null
          type: Database["public"]["Enums"]["submission_type"]
          user_id: string
        }
        Insert: {
          content_md?: string | null
          created_at?: string
          id?: string
          payload?: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          topic_id?: string | null
          type: Database["public"]["Enums"]["submission_type"]
          user_id: string
        }
        Update: {
          content_md?: string | null
          created_at?: string
          id?: string
          payload?: Json
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          topic_id?: string | null
          type?: Database["public"]["Enums"]["submission_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_replies: {
        Row: {
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_replies_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          email: string
          id: string
          message: string
          page: string | null
          status: string
          subject: string
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          email?: string
          id?: string
          message: string
          page?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          page?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          order_index: number
          parent_id: string | null
          school_id: string | null
          slug: string
          title: string
          updated_at: string
          year: number | null
          zone: Database["public"]["Enums"]["exam_zone"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          order_index?: number
          parent_id?: string | null
          school_id?: string | null
          slug: string
          title: string
          updated_at?: string
          year?: number | null
          zone: Database["public"]["Enums"]["exam_zone"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          order_index?: number
          parent_id?: string | null
          school_id?: string | null
          slug?: string
          title?: string
          updated_at?: string
          year?: number | null
          zone?: Database["public"]["Enums"]["exam_zone"]
        }
        Relationships: [
          {
            foreignKeyName: "topics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topics_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topics_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_outcome_progress: {
        Row: {
          confidence: number
          id: string
          mastered: boolean
          outcome_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          id?: string
          mastered?: boolean
          outcome_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          id?: string
          mastered?: boolean
          outcome_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_outcome_progress_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_outcome_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_events: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_school_year: { Args: { p_school: string }; Returns: number }
      award_xp: {
        Args: { p_amount: number; p_reason: string }
        Returns: number
      }
      award_xp_to: {
        Args: { p_amount: number; p_reason: string; p_user: string }
        Returns: number
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      increment_discussion_views: {
        Args: { p_discussion_id: string }
        Returns: undefined
      }
      increment_note_views: { Args: { p_note_id: string }; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_chat_member: { Args: { p_conversation: string }; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      refresh_monthly_leaderboard: { Args: never; Returns: undefined }
      sync_my_year: { Args: never; Returns: number }
      touch_streak: { Args: never; Returns: number }
    }
    Enums: {
      ad_placement: "jobs" | "events" | "resources" | "sidebar" | "banner"
      ai_queue_status: "pending" | "processing" | "done" | "failed" | "dead"
      ai_task_type:
        | "tutor"
        | "explain"
        | "daily_questions"
        | "study_plan"
        | "flashcards"
        | "week_planner"
        | "moderation"
      attempt_status: "in_progress" | "submitted" | "abandoned"
      chat_report_status: "open" | "resolved" | "dismissed"
      content_status:
        | "draft"
        | "pending"
        | "published"
        | "rejected"
        | "archived"
      difficulty: "easy" | "medium" | "hard"
      enquiry_status: "sent" | "read" | "replied"
      exam_zone: "cat1" | "cat2" | "main"
      job_status: "pending" | "approved" | "rejected" | "closed"
      job_type: "internship" | "entry" | "full_time"
      notification_type:
        | "new_notes"
        | "mock_results"
        | "chat_mentions"
        | "daily_questions"
        | "announcements"
        | "jobs"
        | "system"
      plan_event_type: "study" | "class" | "exam" | "personal" | "deadline"
      question_type: "mcq" | "short_answer" | "long_answer" | "structured"
      submission_type: "note" | "question" | "past_paper" | "flashcard_set"
      user_role: "student" | "lecturer" | "admin"
      visibility: "public" | "private"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      ad_placement: ["jobs", "events", "resources", "sidebar", "banner"],
      ai_queue_status: ["pending", "processing", "done", "failed", "dead"],
      ai_task_type: [
        "tutor",
        "explain",
        "daily_questions",
        "study_plan",
        "flashcards",
        "week_planner",
        "moderation",
      ],
      attempt_status: ["in_progress", "submitted", "abandoned"],
      chat_report_status: ["open", "resolved", "dismissed"],
      content_status: ["draft", "pending", "published", "rejected", "archived"],
      difficulty: ["easy", "medium", "hard"],
      enquiry_status: ["sent", "read", "replied"],
      exam_zone: ["cat1", "cat2", "main"],
      job_status: ["pending", "approved", "rejected", "closed"],
      job_type: ["internship", "entry", "full_time"],
      notification_type: [
        "new_notes",
        "mock_results",
        "chat_mentions",
        "daily_questions",
        "announcements",
        "jobs",
        "system",
      ],
      plan_event_type: ["study", "class", "exam", "personal", "deadline"],
      question_type: ["mcq", "short_answer", "long_answer", "structured"],
      submission_type: ["note", "question", "past_paper", "flashcard_set"],
      user_role: ["student", "lecturer", "admin"],
      visibility: ["public", "private"],
    },
  },
} as const
