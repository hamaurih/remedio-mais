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
      banners: {
        Row: {
          active: boolean
          created_at: string
          cta_text: string | null
          end_date: string | null
          id: string
          image_url: string | null
          link: string | null
          mobile_image_url: string | null
          placement: string
          position: number
          start_date: string | null
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          cta_text?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          mobile_image_url?: string | null
          placement?: string
          position?: number
          start_date?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          cta_text?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          mobile_image_url?: string | null
          placement?: string
          position?: number
          start_date?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          icon: string | null
          id: string
          image_url: string | null
          name: string
          position: number
          show_in_menu: boolean
          show_on_home: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          name: string
          position?: number
          show_in_menu?: boolean
          show_on_home?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          name?: string
          position?: number
          show_in_menu?: boolean
          show_on_home?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_address: string | null
          customer_name: string
          customer_phone: string
          delivery_method: string
          id: string
          notes: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_address?: string | null
          customer_name: string
          customer_phone: string
          delivery_method?: string
          id?: string
          notes?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_address?: string | null
          customer_name?: string
          customer_phone?: string
          delivery_method?: string
          id?: string
          notes?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      prescriptions: {
        Row: {
          created_at: string
          customer_name: string
          customer_phone: string
          file_url: string | null
          id: string
          internal_notes: string | null
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_phone: string
          file_url?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_phone?: string
          file_url?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          active_ingredient: string | null
          active_ingredient_code: string | null
          barcode: string | null
          cart_quantity_limit: number | null
          category_external_id: string | null
          category_id: string | null
          category_name: string | null
          controlled: boolean
          created_at: string
          custom_warning: string | null
          department_external_id: string | null
          department_name: string | null
          description: string | null
          discount_percentage: number | null
          ecommerce_enabled: boolean | null
          ecommerce_name: string | null
          ecommerce_price: number | null
          ecommerce_stock_quantity: number | null
          featured: boolean
          gallery_images: string[]
          group_code: string | null
          group_name: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          laboratory: string | null
          laboratory_code: string | null
          last_synced_at: string | null
          manufacturer: string | null
          max_discount_percentage: number | null
          medicine_list_type: string | null
          minimum_stock: number
          name: string
          on_sale: boolean
          price: number
          product_badge: string | null
          promo_price: number | null
          promotion_end: string | null
          promotion_start: string | null
          requires_prescription: boolean
          sale_observation: string | null
          seo_description: string | null
          seo_keywords: string | null
          seo_title: string | null
          shelves: string[]
          short_description: string | null
          sku: string | null
          slug: string
          stock: number
          stock_quantity: number | null
          tags: string | null
          tarja: string | null
          trier_product_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          active_ingredient?: string | null
          active_ingredient_code?: string | null
          barcode?: string | null
          cart_quantity_limit?: number | null
          category_external_id?: string | null
          category_id?: string | null
          category_name?: string | null
          controlled?: boolean
          created_at?: string
          custom_warning?: string | null
          department_external_id?: string | null
          department_name?: string | null
          description?: string | null
          discount_percentage?: number | null
          ecommerce_enabled?: boolean | null
          ecommerce_name?: string | null
          ecommerce_price?: number | null
          ecommerce_stock_quantity?: number | null
          featured?: boolean
          gallery_images?: string[]
          group_code?: string | null
          group_name?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          laboratory?: string | null
          laboratory_code?: string | null
          last_synced_at?: string | null
          manufacturer?: string | null
          max_discount_percentage?: number | null
          medicine_list_type?: string | null
          minimum_stock?: number
          name: string
          on_sale?: boolean
          price?: number
          product_badge?: string | null
          promo_price?: number | null
          promotion_end?: string | null
          promotion_start?: string | null
          requires_prescription?: boolean
          sale_observation?: string | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          shelves?: string[]
          short_description?: string | null
          sku?: string | null
          slug: string
          stock?: number
          stock_quantity?: number | null
          tags?: string | null
          tarja?: string | null
          trier_product_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          active_ingredient?: string | null
          active_ingredient_code?: string | null
          barcode?: string | null
          cart_quantity_limit?: number | null
          category_external_id?: string | null
          category_id?: string | null
          category_name?: string | null
          controlled?: boolean
          created_at?: string
          custom_warning?: string | null
          department_external_id?: string | null
          department_name?: string | null
          description?: string | null
          discount_percentage?: number | null
          ecommerce_enabled?: boolean | null
          ecommerce_name?: string | null
          ecommerce_price?: number | null
          ecommerce_stock_quantity?: number | null
          featured?: boolean
          gallery_images?: string[]
          group_code?: string | null
          group_name?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          laboratory?: string | null
          laboratory_code?: string | null
          last_synced_at?: string | null
          manufacturer?: string | null
          max_discount_percentage?: number | null
          medicine_list_type?: string | null
          minimum_stock?: number
          name?: string
          on_sale?: boolean
          price?: number
          product_badge?: string | null
          promo_price?: number | null
          promotion_end?: string | null
          promotion_start?: string | null
          requires_prescription?: boolean
          sale_observation?: string | null
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          shelves?: string[]
          short_description?: string | null
          sku?: string | null
          slug?: string
          stock?: number
          stock_quantity?: number | null
          tags?: string | null
          tarja?: string | null
          trier_product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          address: string | null
          afe: string | null
          cnpj: string | null
          crf: string | null
          delivery_fee: number | null
          footer_text: string | null
          hero_subtitle: string | null
          hero_title: string | null
          hours: string | null
          id: number
          instagram: string | null
          legal_name: string | null
          pharmacist_name: string | null
          sanitary_license: string | null
          sanitary_notice: string | null
          served_neighborhoods: string | null
          store_name: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          afe?: string | null
          cnpj?: string | null
          crf?: string | null
          delivery_fee?: number | null
          footer_text?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          hours?: string | null
          id?: number
          instagram?: string | null
          legal_name?: string | null
          pharmacist_name?: string | null
          sanitary_license?: string | null
          sanitary_notice?: string | null
          served_neighborhoods?: string | null
          store_name?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          afe?: string | null
          cnpj?: string | null
          crf?: string | null
          delivery_fee?: number | null
          footer_text?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          hours?: string | null
          id?: number
          instagram?: string | null
          legal_name?: string | null
          pharmacist_name?: string | null
          sanitary_license?: string | null
          sanitary_notice?: string | null
          served_neighborhoods?: string | null
          store_name?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      trier_sync_logs: {
        Row: {
          details: Json | null
          error_message: string | null
          finished_at: string | null
          id: string
          items_created: number | null
          items_fetched: number | null
          items_skipped: number | null
          items_updated: number | null
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          details?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_created?: number | null
          items_fetched?: number | null
          items_skipped?: number | null
          items_updated?: number | null
          started_at?: string
          status?: string
          trigger?: string
        }
        Update: {
          details?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          items_created?: number | null
          items_fetched?: number | null
          items_skipped?: number | null
          items_updated?: number | null
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
