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
      companies: {
        Row: {
          contact: string | null
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          pincode: string | null
          post: string | null
          role: Database["public"]["Enums"]["party_role"] | null
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          pincode?: string | null
          post?: string | null
          role?: Database["public"]["Enums"]["party_role"] | null
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          pincode?: string | null
          post?: string | null
          role?: Database["public"]["Enums"]["party_role"] | null
          updated_at?: string
        }
        Relationships: []
      }
      component_parties: {
        Row: {
          component_id: string
          created_at: string
          id: string
          party_id: string
        }
        Insert: {
          component_id: string
          created_at?: string
          id?: string
          party_id: string
        }
        Update: {
          component_id?: string
          created_at?: string
          id?: string
          party_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "component_parties_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_parties_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          category: Database["public"]["Enums"]["component_category"] | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          part_code: string | null
          unit: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["component_category"] | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          part_code?: string | null
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["component_category"] | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          part_code?: string | null
          unit?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      receiving_document_items: {
        Row: {
          component_id: string | null
          created_at: string
          document_id: string
          gst_amount: number
          gst_percent: number
          id: string
          item_name: string
          line_no: number
          line_total: number
          line_type: Database["public"]["Enums"]["document_line_type"]
          quantity: number
          subtotal: number
          unit: Database["public"]["Enums"]["unit_type"]
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          document_id: string
          gst_amount?: number
          gst_percent?: number
          id?: string
          item_name: string
          line_no: number
          line_total?: number
          line_type: Database["public"]["Enums"]["document_line_type"]
          quantity: number
          subtotal?: number
          unit: Database["public"]["Enums"]["unit_type"]
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          component_id?: string | null
          created_at?: string
          document_id?: string
          gst_amount?: number
          gst_percent?: number
          id?: string
          item_name?: string
          line_no?: number
          line_total?: number
          line_type?: Database["public"]["Enums"]["document_line_type"]
          quantity?: number
          subtotal?: number
          unit?: Database["public"]["Enums"]["unit_type"]
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receiving_document_items_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receiving_document_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "receiving_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      receiving_documents: {
        Row: {
          challan_number: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_number: string
          external_document_path: string | null
          gst_total: number
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          party_company: string | null
          party_contact: string | null
          party_location: string | null
          party_name: string | null
          party_pincode: string | null
          party_post: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          source: Database["public"]["Enums"]["document_source"]
          status: Database["public"]["Enums"]["receiving_document_status"]
          subtotal: number
          total_amount: number
          transaction_date: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          vehicle_details: string | null
        }
        Insert: {
          challan_number?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_number: string
          external_document_path?: string | null
          gst_total?: number
          id?: string
          kind: Database["public"]["Enums"]["document_kind"]
          party_company?: string | null
          party_contact?: string | null
          party_location?: string | null
          party_name?: string | null
          party_pincode?: string | null
          party_post?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          source: Database["public"]["Enums"]["document_source"]
          status?: Database["public"]["Enums"]["receiving_document_status"]
          subtotal?: number
          total_amount?: number
          transaction_date?: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          vehicle_details?: string | null
        }
        Update: {
          challan_number?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_number?: string
          external_document_path?: string | null
          gst_total?: number
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          party_company?: string | null
          party_contact?: string | null
          party_location?: string | null
          party_name?: string | null
          party_pincode?: string | null
          party_post?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          source?: Database["public"]["Enums"]["document_source"]
          status?: Database["public"]["Enums"]["receiving_document_status"]
          subtotal?: number
          total_amount?: number
          transaction_date?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          vehicle_details?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receiving_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receiving_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          challan_number: string | null
          challan_path: string
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          external_document_path: string | null
          id: string
          material_id: string
          party_company: string | null
          party_contact: string | null
          party_location: string | null
          party_name: string | null
          party_pincode: string | null
          party_post: string | null
          pieces: number
          total_amount: number
          transaction_date: string
          transaction_number: string
          type: Database["public"]["Enums"]["transaction_type"]
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          challan_number?: string | null
          challan_path: string
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          external_document_path?: string | null
          id?: string
          material_id: string
          party_company?: string | null
          party_contact?: string | null
          party_location?: string | null
          party_name?: string | null
          party_pincode?: string | null
          party_post?: string | null
          pieces: number
          total_amount?: number
          transaction_date?: string
          transaction_number: string
          type: Database["public"]["Enums"]["transaction_type"]
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          challan_number?: string | null
          challan_path?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          external_document_path?: string | null
          id?: string
          material_id?: string
          party_company?: string | null
          party_contact?: string | null
          party_location?: string | null
          party_name?: string | null
          party_pincode?: string | null
          party_post?: string | null
          pieces?: number
          total_amount?: number
          transaction_date?: string
          transaction_number?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_upload_challan: { Args: never; Returns: boolean }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      generate_transaction_number: {
        Args: { p_type: Database["public"]["Enums"]["transaction_type"] }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer"
      component_category: "direct" | "indirect"
      document_kind: "raw-material" | "other"
      document_line_type: "component" | "other"
      document_source: "supplier" | "shop"
      party_role: "customer" | "supplier" | "both"
      payment_status: "pending" | "paid"
      receiving_document_status: "completed" | "cancelled"
      transaction_type: "received" | "given"
      unit_type: "pieces" | "kg" | "meter" | "litre" | "set"
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
      app_role: ["admin", "operator", "viewer"],
      component_category: ["direct", "indirect"],
      document_kind: ["raw-material", "other"],
      document_line_type: ["component", "other"],
      document_source: ["supplier", "shop"],
      party_role: ["customer", "supplier", "both"],
      payment_status: ["pending", "paid"],
      receiving_document_status: ["completed", "cancelled"],
      transaction_type: ["received", "given"],
      unit_type: ["pieces", "kg", "meter", "litre", "set"],
    },
  },
} as const
