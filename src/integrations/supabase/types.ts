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
      admin_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: number
          pix_holder_name: string
          pix_key: string
          updated_at: string
        }
        Insert: {
          id?: number
          pix_holder_name?: string
          pix_key?: string
          updated_at?: string
        }
        Update: {
          id?: number
          pix_holder_name?: string
          pix_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string | null
          created_at: string
          expires_at: string
          id: string
          image_name: string | null
          image_path: string | null
          image_size: number | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          image_name?: string | null
          image_path?: string | null
          image_size?: number | null
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          image_name?: string | null
          image_path?: string | null
          image_size?: number | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          admin_id: string | null
          created_at: string
          id: string
          participant_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          id?: string
          participant_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          id?: string
          participant_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      deposit_requests: {
        Row: {
          amount: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          pix_holder_name: string
          status: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          pix_holder_name: string
          status?: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          pix_holder_name?: string
          status?: Database["public"]["Enums"]["request_status"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_main_admin: boolean
          matches_played: number
          nick: string
          nick2: string | null
          phone: string
          wins: number
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          is_main_admin?: boolean
          matches_played?: number
          nick: string
          nick2?: string | null
          phone: string
          wins?: number
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_main_admin?: boolean
          matches_played?: number
          nick?: string
          nick2?: string | null
          phone?: string
          wins?: number
        }
        Relationships: []
      }
      room_links: {
        Row: {
          link: string | null
          released: boolean
          room_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          link?: string | null
          released?: boolean
          room_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          link?: string | null
          released?: boolean
          room_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_links_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_participants: {
        Row: {
          joined_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entry_fee: number
          finished_at: string | null
          id: string
          kill_value: number
          max_participants: number
          name: string
          status: Database["public"]["Enums"]["room_status"]
          win_value: number
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_fee: number
          finished_at?: string | null
          id?: string
          kill_value?: number
          max_participants: number
          name: string
          status?: Database["public"]["Enums"]["room_status"]
          win_value?: number
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_fee?: number
          finished_at?: string | null
          id?: string
          kill_value?: number
          max_participants?: number
          name?: string
          status?: Database["public"]["Enums"]["room_status"]
          win_value?: number
          winner_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          type: Database["public"]["Enums"]["tx_type"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          type?: Database["public"]["Enums"]["tx_type"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          amount: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          pix_key: string
          status: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          pix_key: string
          status?: Database["public"]["Enums"]["request_status"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          pix_key?: string
          status?: Database["public"]["Enums"]["request_status"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_balance: {
        Args: { p_delta: number; p_reason: string; p_user_id: string }
        Returns: undefined
      }
      admin_delete_room: { Args: { p_room_id: string }; Returns: undefined }
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      admin_remove_participant: {
        Args: { p_refund: boolean; p_room_id: string; p_user_id: string }
        Returns: undefined
      }
      admin_set_user_stats: {
        Args: { p_matches_played: number; p_user_id: string; p_wins: number }
        Returns: undefined
      }
      admin_update_profile: {
        Args: {
          p_full_name: string
          p_nick: string
          p_phone: string
          p_user_id: string
        }
        Returns: undefined
      }
      approve_deposit: { Args: { p_id: string }; Returns: undefined }
      approve_withdrawal: { Args: { p_id: string }; Returns: undefined }
      can_access_chat_thread: {
        Args: { p_thread_id: string; p_user_id: string }
        Returns: boolean
      }
      cancel_withdrawal: { Args: { p_id: string }; Returns: undefined }
      cleanup_expired_chat_messages: { Args: never; Returns: undefined }
      create_withdrawal_request: {
        Args: { p_amount: number; p_pix_key: string }
        Returns: string
      }
      finalize_room: { Args: { p_room_id: string }; Returns: undefined }
      finalize_room_with_kills: {
        Args: { p_kills: Json; p_room_id: string; p_winner_id: string }
        Returns: undefined
      }
      finalize_room_with_winner: {
        Args: { p_room_id: string; p_winner_id: string }
        Returns: undefined
      }
      get_chat_admins: {
        Args: never
        Returns: {
          full_name: string
          is_owner: boolean
          nick: string
          user_id: string
        }[]
      }
      get_or_create_private_chat: {
        Args: { p_admin_id: string }
        Returns: string
      }
      get_or_create_public_chat: { Args: never; Returns: string }
      get_ranking: {
        Args: { p_limit?: number }
        Returns: {
          matches_played: number
          nick: string
          wins: number
        }[]
      }
      get_released_room_link: {
        Args: { p_room_id: string }
        Returns: {
          link: string
          released: boolean
        }[]
      }
      get_room_counts: {
        Args: never
        Returns: {
          count: number
          room_id: string
        }[]
      }
      get_room_link_admin: {
        Args: { p_room_id: string }
        Returns: {
          link: string
          released: boolean
        }[]
      }
      get_room_nicks: {
        Args: { p_room_id: string }
        Returns: {
          is_me: boolean
          nick: string
          user_id: string
        }[]
      }
      grant_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_any_admin: { Args: { _user_id: string }; Returns: boolean }
      join_room: { Args: { p_room_id: string }; Returns: undefined }
      log_admin_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_target_id?: string
          p_target_type: string
        }
        Returns: undefined
      }
      reject_deposit: { Args: { p_id: string }; Returns: undefined }
      reject_withdrawal: { Args: { p_id: string }; Returns: undefined }
      release_room_link: {
        Args: { p_released: boolean; p_room_id: string }
        Returns: undefined
      }
      revoke_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: undefined
      }
      save_and_release_room_link: {
        Args: { p_link: string; p_room_id: string }
        Returns: undefined
      }
      send_chat_message: {
        Args: {
          p_body?: string
          p_image_name?: string
          p_image_path?: string
          p_image_size?: number
          p_thread_id: string
        }
        Returns: string
      }
      set_room_link: {
        Args: { p_link: string; p_room_id: string }
        Returns: undefined
      }
      update_app_settings: {
        Args: { p_pix_holder: string; p_pix_key: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin_principal" | "admin_salas" | "participante"
      request_status: "pendente" | "aprovado" | "recusado" | "cancelado"
      room_status: "aberta" | "fechada"
      tx_type:
        | "deposito"
        | "saque"
        | "inscricao"
        | "ajuste_admin"
        | "reembolso"
        | "premio"
        | "saque_estorno"
        | "kill_bonus"
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
      app_role: ["admin_principal", "admin_salas", "participante"],
      request_status: ["pendente", "aprovado", "recusado", "cancelado"],
      room_status: ["aberta", "fechada"],
      tx_type: [
        "deposito",
        "saque",
        "inscricao",
        "ajuste_admin",
        "reembolso",
        "premio",
        "saque_estorno",
        "kill_bonus",
      ],
    },
  },
} as const
