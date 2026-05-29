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
      campaign_products: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          position: number
          product_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          position?: number
          product_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_products_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          active: boolean
          banner_image_url: string | null
          banner_link: string | null
          created_at: string
          cta_text: string | null
          ends_at: string | null
          id: string
          name: string
          position: number
          published: boolean
          slug: string
          starts_at: string | null
          subtitle: string | null
          updated_at: string
          visual_style: string
        }
        Insert: {
          active?: boolean
          banner_image_url?: string | null
          banner_link?: string | null
          created_at?: string
          cta_text?: string | null
          ends_at?: string | null
          id?: string
          name: string
          position?: number
          published?: boolean
          slug: string
          starts_at?: string | null
          subtitle?: string | null
          updated_at?: string
          visual_style?: string
        }
        Update: {
          active?: boolean
          banner_image_url?: string | null
          banner_link?: string | null
          created_at?: string
          cta_text?: string | null
          ends_at?: string | null
          id?: string
          name?: string
          position?: number
          published?: boolean
          slug?: string
          starts_at?: string | null
          subtitle?: string | null
          updated_at?: string
          visual_style?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          band_color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          image_url: string | null
          link: string | null
          name: string
          position: number
          show_in_menu: boolean
          show_on_home: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          band_color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          name: string
          position?: number
          show_in_menu?: boolean
          show_on_home?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          band_color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          name?: string
          position?: number
          show_in_menu?: boolean
          show_on_home?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      home_mosaic_tiles: {
        Row: {
          active: boolean
          badge_text: string | null
          bg_style: string
          created_at: string
          cta_text: string | null
          id: string
          image_url: string | null
          link: string | null
          position: number
          size: string
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge_text?: string | null
          bg_style?: string
          created_at?: string
          cta_text?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          position?: number
          size?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge_text?: string | null
          bg_style?: string
          created_at?: string
          cta_text?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          position?: number
          size?: string
          subtitle?: string | null
          title?: string | null
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
          trier_error_message: string | null
          trier_last_status_check_at: string | null
          trier_numero_nota: string | null
          trier_sent: boolean
          trier_sent_at: string | null
          trier_status: string | null
          trier_status_code: number | null
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
          trier_error_message?: string | null
          trier_last_status_check_at?: string | null
          trier_numero_nota?: string | null
          trier_sent?: boolean
          trier_sent_at?: string | null
          trier_status?: string | null
          trier_status_code?: number | null
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
          trier_error_message?: string | null
          trier_last_status_check_at?: string | null
          trier_numero_nota?: string | null
          trier_sent?: boolean
          trier_sent_at?: string | null
          trier_status?: string | null
          trier_status_code?: number | null
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
          last_trier_sync_at: string | null
          lock_manual_price: boolean
          lock_manual_stock: boolean
          manufacturer: string | null
          max_discount_percentage: number | null
          medicine_list_type: string | null
          minimum_stock: number
          name: string
          on_sale: boolean
          pix_discount_percentage: number | null
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
          source: string | null
          stock: number
          stock_quantity: number | null
          sync_with_trier: boolean
          tags: string | null
          tarja: string | null
          trier_barcode: string | null
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
          last_trier_sync_at?: string | null
          lock_manual_price?: boolean
          lock_manual_stock?: boolean
          manufacturer?: string | null
          max_discount_percentage?: number | null
          medicine_list_type?: string | null
          minimum_stock?: number
          name: string
          on_sale?: boolean
          pix_discount_percentage?: number | null
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
          source?: string | null
          stock?: number
          stock_quantity?: number | null
          sync_with_trier?: boolean
          tags?: string | null
          tarja?: string | null
          trier_barcode?: string | null
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
          last_trier_sync_at?: string | null
          lock_manual_price?: boolean
          lock_manual_stock?: boolean
          manufacturer?: string | null
          max_discount_percentage?: number | null
          medicine_list_type?: string | null
          minimum_stock?: number
          name?: string
          on_sale?: boolean
          pix_discount_percentage?: number | null
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
          source?: string | null
          stock?: number
          stock_quantity?: number | null
          sync_with_trier?: boolean
          tags?: string | null
          tarja?: string | null
          trier_barcode?: string | null
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
      promo_banner_blocks: {
        Row: {
          active: boolean
          badge_text: string | null
          created_at: string
          cta_text: string | null
          cta_url: string | null
          id: string
          image_mode: string
          image_url: string | null
          new_price: number | null
          old_price: number | null
          position: number
          price_suffix: string | null
          subtitle: string | null
          title: string | null
          updated_at: string
          variant: string
        }
        Insert: {
          active?: boolean
          badge_text?: string | null
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          id?: string
          image_mode?: string
          image_url?: string | null
          new_price?: number | null
          old_price?: number | null
          position?: number
          price_suffix?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          variant?: string
        }
        Update: {
          active?: boolean
          badge_text?: string | null
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          id?: string
          image_mode?: string
          image_url?: string | null
          new_price?: number | null
          old_price?: number | null
          position?: number
          price_suffix?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          variant?: string
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
          pix_discount_enabled: boolean
          pix_discount_percentage: number
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
          pix_discount_enabled?: boolean
          pix_discount_percentage?: number
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
          pix_discount_enabled?: boolean
          pix_discount_percentage?: number
          sanitary_license?: string | null
          sanitary_notice?: string | null
          served_neighborhoods?: string | null
          store_name?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      trier_logs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          message: string
          order_id: string | null
          product_id: string | null
          status: string
          type: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          message: string
          order_id?: string | null
          product_id?: string | null
          status?: string
          type: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          message?: string
          order_id?: string | null
          product_id?: string | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      trier_product_mappings: {
        Row: {
          created_at: string
          id: string
          last_synced_at: string | null
          product_id: string | null
          sync_status: string | null
          trier_barcode: string | null
          trier_name: string | null
          trier_product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_synced_at?: string | null
          product_id?: string | null
          sync_status?: string | null
          trier_barcode?: string | null
          trier_name?: string | null
          trier_product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_synced_at?: string | null
          product_id?: string | null
          sync_status?: string | null
          trier_barcode?: string | null
          trier_name?: string | null
          trier_product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trier_product_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      trier_settings: {
        Row: {
          base_url: string
          bearer_token: string | null
          branch_code: string | null
          check_order_status_enabled: boolean
          created_at: string
          ecommerce_filter: string
          ecommerce_filter_enabled: boolean
          environment: string
          id: number
          last_connection_status: string | null
          last_connection_test_at: string | null
          last_sync_categories_at: string | null
          last_sync_discounts_at: string | null
          last_sync_prices_at: string | null
          last_sync_products_at: string | null
          last_sync_stock_at: string | null
          page_size: number
          schedule_discounts_minutes: number
          schedule_prices_minutes: number
          schedule_products_minutes: number
          schedule_stock_minutes: number
          send_orders_enabled: boolean
          sync_categories_enabled: boolean
          sync_discounts_enabled: boolean
          sync_prices_enabled: boolean
          sync_products_enabled: boolean
          sync_stock_enabled: boolean
          updated_at: string
        }
        Insert: {
          base_url?: string
          bearer_token?: string | null
          branch_code?: string | null
          check_order_status_enabled?: boolean
          created_at?: string
          ecommerce_filter?: string
          ecommerce_filter_enabled?: boolean
          environment?: string
          id?: number
          last_connection_status?: string | null
          last_connection_test_at?: string | null
          last_sync_categories_at?: string | null
          last_sync_discounts_at?: string | null
          last_sync_prices_at?: string | null
          last_sync_products_at?: string | null
          last_sync_stock_at?: string | null
          page_size?: number
          schedule_discounts_minutes?: number
          schedule_prices_minutes?: number
          schedule_products_minutes?: number
          schedule_stock_minutes?: number
          send_orders_enabled?: boolean
          sync_categories_enabled?: boolean
          sync_discounts_enabled?: boolean
          sync_prices_enabled?: boolean
          sync_products_enabled?: boolean
          sync_stock_enabled?: boolean
          updated_at?: string
        }
        Update: {
          base_url?: string
          bearer_token?: string | null
          branch_code?: string | null
          check_order_status_enabled?: boolean
          created_at?: string
          ecommerce_filter?: string
          ecommerce_filter_enabled?: boolean
          environment?: string
          id?: number
          last_connection_status?: string | null
          last_connection_test_at?: string | null
          last_sync_categories_at?: string | null
          last_sync_discounts_at?: string | null
          last_sync_prices_at?: string | null
          last_sync_products_at?: string | null
          last_sync_stock_at?: string | null
          page_size?: number
          schedule_discounts_minutes?: number
          schedule_prices_minutes?: number
          schedule_products_minutes?: number
          schedule_stock_minutes?: number
          send_orders_enabled?: boolean
          sync_categories_enabled?: boolean
          sync_discounts_enabled?: boolean
          sync_prices_enabled?: boolean
          sync_products_enabled?: boolean
          sync_stock_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      trier_sync_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          records_checked: number | null
          records_created: number | null
          records_failed: number | null
          records_ignored: number | null
          records_updated: number | null
          started_at: string
          status: string
          sync_type: string
          trigger: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          records_checked?: number | null
          records_created?: number | null
          records_failed?: number | null
          records_ignored?: number | null
          records_updated?: number | null
          started_at?: string
          status?: string
          sync_type: string
          trigger?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          records_checked?: number | null
          records_created?: number | null
          records_failed?: number | null
          records_ignored?: number | null
          records_updated?: number | null
          started_at?: string
          status?: string
          sync_type?: string
          trigger?: string
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
      store_settings_public: {
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
          id: number | null
          instagram: string | null
          legal_name: string | null
          pharmacist_name: string | null
          pix_discount_enabled: boolean | null
          pix_discount_percentage: number | null
          sanitary_license: string | null
          sanitary_notice: string | null
          served_neighborhoods: string | null
          store_name: string | null
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
          id?: number | null
          instagram?: string | null
          legal_name?: string | null
          pharmacist_name?: string | null
          pix_discount_enabled?: boolean | null
          pix_discount_percentage?: number | null
          sanitary_license?: string | null
          sanitary_notice?: string | null
          served_neighborhoods?: string | null
          store_name?: string | null
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
          id?: number | null
          instagram?: string | null
          legal_name?: string | null
          pharmacist_name?: string | null
          pix_discount_enabled?: boolean | null
          pix_discount_percentage?: number | null
          sanitary_license?: string | null
          sanitary_notice?: string | null
          served_neighborhoods?: string | null
          store_name?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
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
