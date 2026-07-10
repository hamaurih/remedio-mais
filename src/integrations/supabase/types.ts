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
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          metadata: Json
          order_id: string | null
          priority: string
          read: boolean
          read_at: string | null
          role_target: string
          target_user_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          order_id?: string | null
          priority?: string
          read?: boolean
          read_at?: string | null
          role_target?: string
          target_user_id?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          order_id?: string | null
          priority?: string
          read?: boolean
          read_at?: string | null
          role_target?: string
          target_user_id?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          accent_color: string | null
          active: boolean
          animation_type: string
          autoplay_delay: number
          background_color: string | null
          background_image_url: string | null
          background_intensity: string | null
          badge: string | null
          banner_type: string
          button_color: string | null
          created_at: string
          cta_text: string | null
          desktop_image_url: string | null
          discount_percent: number | null
          discount_prefix: string | null
          discount_suffix: string | null
          end_date: string | null
          highlight_price: number | null
          id: string
          image_alt: string | null
          image_fit: string
          image_focus: string
          image_url: string | null
          legal_color: string | null
          legal_text: string | null
          link: string | null
          linked_campaign_id: string | null
          linked_category_id: string | null
          linked_entity_id: string | null
          linked_entity_slug: string | null
          linked_entity_type: string | null
          linked_product_id: string | null
          mobile_image_url: string | null
          placement: string
          position: number
          product_image_url: string | null
          product_position: string
          product_size: string | null
          published: boolean
          secondary_image_url: string | null
          show_side_shapes: boolean | null
          show_text_over_image: boolean
          side_shapes_color: string | null
          side_shapes_size: string | null
          size_variant: string
          start_date: string | null
          subtitle: string | null
          support_color: string | null
          support_text: string | null
          tablet_image_url: string | null
          text_position: string
          title: string | null
          title_color: string | null
          title_font: string | null
          title_size: string | null
          transition_type: string
          updated_at: string
          visual_model: string
          visual_style: string
        }
        Insert: {
          accent_color?: string | null
          active?: boolean
          animation_type?: string
          autoplay_delay?: number
          background_color?: string | null
          background_image_url?: string | null
          background_intensity?: string | null
          badge?: string | null
          banner_type?: string
          button_color?: string | null
          created_at?: string
          cta_text?: string | null
          desktop_image_url?: string | null
          discount_percent?: number | null
          discount_prefix?: string | null
          discount_suffix?: string | null
          end_date?: string | null
          highlight_price?: number | null
          id?: string
          image_alt?: string | null
          image_fit?: string
          image_focus?: string
          image_url?: string | null
          legal_color?: string | null
          legal_text?: string | null
          link?: string | null
          linked_campaign_id?: string | null
          linked_category_id?: string | null
          linked_entity_id?: string | null
          linked_entity_slug?: string | null
          linked_entity_type?: string | null
          linked_product_id?: string | null
          mobile_image_url?: string | null
          placement?: string
          position?: number
          product_image_url?: string | null
          product_position?: string
          product_size?: string | null
          published?: boolean
          secondary_image_url?: string | null
          show_side_shapes?: boolean | null
          show_text_over_image?: boolean
          side_shapes_color?: string | null
          side_shapes_size?: string | null
          size_variant?: string
          start_date?: string | null
          subtitle?: string | null
          support_color?: string | null
          support_text?: string | null
          tablet_image_url?: string | null
          text_position?: string
          title?: string | null
          title_color?: string | null
          title_font?: string | null
          title_size?: string | null
          transition_type?: string
          updated_at?: string
          visual_model?: string
          visual_style?: string
        }
        Update: {
          accent_color?: string | null
          active?: boolean
          animation_type?: string
          autoplay_delay?: number
          background_color?: string | null
          background_image_url?: string | null
          background_intensity?: string | null
          badge?: string | null
          banner_type?: string
          button_color?: string | null
          created_at?: string
          cta_text?: string | null
          desktop_image_url?: string | null
          discount_percent?: number | null
          discount_prefix?: string | null
          discount_suffix?: string | null
          end_date?: string | null
          highlight_price?: number | null
          id?: string
          image_alt?: string | null
          image_fit?: string
          image_focus?: string
          image_url?: string | null
          legal_color?: string | null
          legal_text?: string | null
          link?: string | null
          linked_campaign_id?: string | null
          linked_category_id?: string | null
          linked_entity_id?: string | null
          linked_entity_slug?: string | null
          linked_entity_type?: string | null
          linked_product_id?: string | null
          mobile_image_url?: string | null
          placement?: string
          position?: number
          product_image_url?: string | null
          product_position?: string
          product_size?: string | null
          published?: boolean
          secondary_image_url?: string | null
          show_side_shapes?: boolean | null
          show_text_over_image?: boolean
          side_shapes_color?: string | null
          side_shapes_size?: string | null
          size_variant?: string
          start_date?: string | null
          subtitle?: string | null
          support_color?: string | null
          support_text?: string | null
          tablet_image_url?: string | null
          text_position?: string
          title?: string | null
          title_color?: string | null
          title_font?: string | null
          title_size?: string | null
          transition_type?: string
          updated_at?: string
          visual_model?: string
          visual_style?: string
        }
        Relationships: [
          {
            foreignKeyName: "banners_linked_campaign_fk"
            columns: ["linked_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banners_linked_category_fk"
            columns: ["linked_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banners_linked_product_fk"
            columns: ["linked_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_products: {
        Row: {
          campaign_id: string
          created_at: string
          featured_slot: number | null
          id: string
          position: number
          product_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          featured_slot?: number | null
          id?: string
          position?: number
          product_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          featured_slot?: number | null
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
          banner_destination: string
          banner_image_url: string | null
          banner_link: string | null
          banner_mode: string
          created_at: string
          cta_text: string | null
          destination_category_id: string | null
          destination_product_id: string | null
          ends_at: string | null
          id: string
          name: string
          position: number
          published: boolean
          show_on_home: boolean
          slug: string
          starts_at: string | null
          subtitle: string | null
          updated_at: string
          visual_style: string
        }
        Insert: {
          active?: boolean
          banner_destination?: string
          banner_image_url?: string | null
          banner_link?: string | null
          banner_mode?: string
          created_at?: string
          cta_text?: string | null
          destination_category_id?: string | null
          destination_product_id?: string | null
          ends_at?: string | null
          id?: string
          name: string
          position?: number
          published?: boolean
          show_on_home?: boolean
          slug: string
          starts_at?: string | null
          subtitle?: string | null
          updated_at?: string
          visual_style?: string
        }
        Update: {
          active?: boolean
          banner_destination?: string
          banner_image_url?: string | null
          banner_link?: string | null
          banner_mode?: string
          created_at?: string
          cta_text?: string | null
          destination_category_id?: string | null
          destination_product_id?: string | null
          ends_at?: string | null
          id?: string
          name?: string
          position?: number
          published?: boolean
          show_on_home?: boolean
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
          department_id: string | null
          description: string | null
          icon: string | null
          id: string
          image_url: string | null
          link: string | null
          macro_group: string | null
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
          department_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          macro_group?: string | null
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
          department_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          link?: string | null
          macro_group?: string | null
          name?: string
          position?: number
          show_in_menu?: boolean
          show_on_home?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          cep: string
          city: string
          complement: string | null
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          label: string | null
          lat: number | null
          lng: number | null
          neighborhood: string | null
          number: string | null
          place_id: string | null
          reference: string | null
          state: string
          street: string
          updated_at: string
        }
        Insert: {
          cep: string
          city: string
          complement?: string | null
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          label?: string | null
          lat?: number | null
          lng?: number | null
          neighborhood?: string | null
          number?: string | null
          place_id?: string | null
          reference?: string | null
          state: string
          street: string
          updated_at?: string
        }
        Update: {
          cep?: string
          city?: string
          complement?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          label?: string | null
          lat?: number | null
          lng?: number | null
          neighborhood?: string | null
          number?: string | null
          place_id?: string | null
          reference?: string | null
          state?: string
          street?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          active: boolean
          band_color: string | null
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
          band_color?: string | null
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
          band_color?: string | null
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
      home_mosaic_tiles: {
        Row: {
          active: boolean
          badge_preset: string | null
          badge_text: string | null
          bg_style: string
          campaign_id: string | null
          category_id: string | null
          created_at: string
          cta_text: string | null
          custom_image_url: string | null
          id: string
          image_source: string
          image_url: string | null
          link: string | null
          link_type: string
          manual_link: string | null
          position: number
          product_id: string | null
          size: string
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge_preset?: string | null
          badge_text?: string | null
          bg_style?: string
          campaign_id?: string | null
          category_id?: string | null
          created_at?: string
          cta_text?: string | null
          custom_image_url?: string | null
          id?: string
          image_source?: string
          image_url?: string | null
          link?: string | null
          link_type?: string
          manual_link?: string | null
          position?: number
          product_id?: string | null
          size?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge_preset?: string | null
          badge_text?: string | null
          bg_style?: string
          campaign_id?: string | null
          category_id?: string | null
          created_at?: string
          cta_text?: string | null
          custom_image_url?: string | null
          id?: string
          image_source?: string
          image_url?: string | null
          link?: string | null
          link_type?: string
          manual_link?: string | null
          position?: number
          product_id?: string | null
          size?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      import_job_items: {
        Row: {
          action: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          error_message: string | null
          id: string
          import_job_id: string
          match_type: string | null
          matched_product_id: string | null
          normalized_data: Json
          raw_data: Json
          row_number: number
          status: string
        }
        Insert: {
          action?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          error_message?: string | null
          id?: string
          import_job_id: string
          match_type?: string | null
          matched_product_id?: string | null
          normalized_data?: Json
          raw_data?: Json
          row_number: number
          status?: string
        }
        Update: {
          action?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          error_message?: string | null
          id?: string
          import_job_id?: string
          match_type?: string | null
          matched_product_id?: string | null
          normalized_data?: Json
          raw_data?: Json
          row_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_job_items_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_job_items_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          column_mapping: Json
          created_at: string
          created_by: string | null
          created_count: number
          error_count: number
          file_name: string
          file_type: string
          id: string
          options: Json
          skipped_count: number
          status: string
          summary: Json
          total_rows: number
          updated_at: string
          updated_count: number
        }
        Insert: {
          column_mapping?: Json
          created_at?: string
          created_by?: string | null
          created_count?: number
          error_count?: number
          file_name: string
          file_type: string
          id?: string
          options?: Json
          skipped_count?: number
          status?: string
          summary?: Json
          total_rows?: number
          updated_at?: string
          updated_count?: number
        }
        Update: {
          column_mapping?: Json
          created_at?: string
          created_by?: string | null
          created_count?: number
          error_count?: number
          file_name?: string
          file_type?: string
          id?: string
          options?: Json
          skipped_count?: number
          status?: string
          summary?: Json
          total_rows?: number
          updated_at?: string
          updated_count?: number
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          active: boolean
          badge_text: string | null
          campaign_id: string | null
          category_id: string | null
          created_at: string
          highlight: boolean
          icon: string | null
          id: string
          label: string
          link_type: string
          menu_area: string
          open_in_new_tab: boolean
          page_key: string | null
          parent_id: string | null
          position: number
          product_id: string | null
          show_on_desktop: boolean
          show_on_mobile: boolean
          slug: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          active?: boolean
          badge_text?: string | null
          campaign_id?: string | null
          category_id?: string | null
          created_at?: string
          highlight?: boolean
          icon?: string | null
          id?: string
          label: string
          link_type?: string
          menu_area: string
          open_in_new_tab?: boolean
          page_key?: string | null
          parent_id?: string | null
          position?: number
          product_id?: string | null
          show_on_desktop?: boolean
          show_on_mobile?: boolean
          slug?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          active?: boolean
          badge_text?: string | null
          campaign_id?: string | null
          category_id?: string | null
          created_at?: string
          highlight?: boolean
          icon?: string | null
          id?: string
          label?: string
          link_type?: string
          menu_area?: string
          open_in_new_tab?: boolean
          page_key?: string | null
          parent_id?: string | null
          position?: number
          product_id?: string | null
          show_on_desktop?: boolean
          show_on_mobile?: boolean
          slug?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          message: string | null
          metadata: Json
          new_status: string | null
          old_status: string | null
          order_id: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          new_status?: string | null
          old_status?: string | null
          order_id: string
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string | null
          metadata?: Json
          new_status?: string | null
          old_status?: string | null
          order_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          controlled: boolean
          id: string
          item_notes: string | null
          item_status: string
          order_id: string
          product_id: string | null
          product_image_url: string | null
          product_name: string
          quantity: number
          requires_prescription: boolean
          status_updated_at: string | null
          status_updated_by: string | null
          total: number | null
          trier_item_sent: boolean
          trier_product_id: string | null
          unit_price: number
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          controlled?: boolean
          id?: string
          item_notes?: string | null
          item_status?: string
          order_id: string
          product_id?: string | null
          product_image_url?: string | null
          product_name: string
          quantity: number
          requires_prescription?: boolean
          status_updated_at?: string | null
          status_updated_by?: string | null
          total?: number | null
          trier_item_sent?: boolean
          trier_product_id?: string | null
          unit_price: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          controlled?: boolean
          id?: string
          item_notes?: string | null
          item_status?: string
          order_id?: string
          product_id?: string | null
          product_image_url?: string | null
          product_name?: string
          quantity?: number
          requires_prescription?: boolean
          status_updated_at?: string | null
          status_updated_by?: string | null
          total?: number | null
          trier_item_sent?: boolean
          trier_product_id?: string | null
          unit_price?: number
          variant_id?: string | null
          variant_label?: string | null
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
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          created_at: string
          customer_address: string | null
          customer_cpf: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string
          delivery_cep: string | null
          delivery_city: string | null
          delivery_complement: string | null
          delivery_fee: number
          delivery_method: string
          delivery_neighborhood: string | null
          delivery_number: string | null
          delivery_reference: string | null
          delivery_state: string | null
          delivery_status: string
          delivery_street: string | null
          delivery_type: string
          discount: number
          external_reference: string | null
          fulfillment_status: string
          id: string
          mercado_pago_checkout_url: string | null
          mercado_pago_order_id: string | null
          mercado_pago_payment_id: string | null
          mercado_pago_preference_id: string | null
          notes: string | null
          order_status: string
          paid_at: string | null
          payment_gateway: string | null
          payment_method: string | null
          payment_status: string
          sales_channel: string
          status: string
          subtotal: number
          total: number
          trier_attempts: number
          trier_error_message: string | null
          trier_last_error: string | null
          trier_last_status_check_at: string | null
          trier_numero_nota: string | null
          trier_order_id: string | null
          trier_payload_hash: string | null
          trier_sale_id: string | null
          trier_sent: boolean
          trier_sent_at: string | null
          trier_status: string | null
          trier_status_code: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          customer_address?: string | null
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          delivery_cep?: string | null
          delivery_city?: string | null
          delivery_complement?: string | null
          delivery_fee?: number
          delivery_method?: string
          delivery_neighborhood?: string | null
          delivery_number?: string | null
          delivery_reference?: string | null
          delivery_state?: string | null
          delivery_status?: string
          delivery_street?: string | null
          delivery_type?: string
          discount?: number
          external_reference?: string | null
          fulfillment_status?: string
          id?: string
          mercado_pago_checkout_url?: string | null
          mercado_pago_order_id?: string | null
          mercado_pago_payment_id?: string | null
          mercado_pago_preference_id?: string | null
          notes?: string | null
          order_status?: string
          paid_at?: string | null
          payment_gateway?: string | null
          payment_method?: string | null
          payment_status?: string
          sales_channel?: string
          status?: string
          subtotal?: number
          total?: number
          trier_attempts?: number
          trier_error_message?: string | null
          trier_last_error?: string | null
          trier_last_status_check_at?: string | null
          trier_numero_nota?: string | null
          trier_order_id?: string | null
          trier_payload_hash?: string | null
          trier_sale_id?: string | null
          trier_sent?: boolean
          trier_sent_at?: string | null
          trier_status?: string | null
          trier_status_code?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          customer_address?: string | null
          customer_cpf?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          delivery_cep?: string | null
          delivery_city?: string | null
          delivery_complement?: string | null
          delivery_fee?: number
          delivery_method?: string
          delivery_neighborhood?: string | null
          delivery_number?: string | null
          delivery_reference?: string | null
          delivery_state?: string | null
          delivery_status?: string
          delivery_street?: string | null
          delivery_type?: string
          discount?: number
          external_reference?: string | null
          fulfillment_status?: string
          id?: string
          mercado_pago_checkout_url?: string | null
          mercado_pago_order_id?: string | null
          mercado_pago_payment_id?: string | null
          mercado_pago_preference_id?: string | null
          notes?: string | null
          order_status?: string
          paid_at?: string | null
          payment_gateway?: string | null
          payment_method?: string | null
          payment_status?: string
          sales_channel?: string
          status?: string
          subtotal?: number
          total?: number
          trier_attempts?: number
          trier_error_message?: string | null
          trier_last_error?: string | null
          trier_last_status_check_at?: string | null
          trier_numero_nota?: string | null
          trier_order_id?: string | null
          trier_payload_hash?: string | null
          trier_sale_id?: string | null
          trier_sent?: boolean
          trier_sent_at?: string | null
          trier_status?: string | null
          trier_status_code?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payment_errors: {
        Row: {
          created_at: string
          error_code: string | null
          http_status: number | null
          id: string
          message: string | null
          mp_error: Json | null
          order_id: string | null
          payload_summary: Json | null
          stage: string
          supabase_error: Json | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          http_status?: number | null
          id?: string
          message?: string | null
          mp_error?: Json | null
          order_id?: string | null
          payload_summary?: Json | null
          stage: string
          supabase_error?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          http_status?: number | null
          id?: string
          message?: string | null
          mp_error?: Json | null
          order_id?: string | null
          payload_summary?: Json | null
          stage?: string
          supabase_error?: Json | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          created_at: string
          event_type: string | null
          external_id: string
          gateway: string
          id: string
          order_id: string | null
          payload: Json | null
          processed: boolean
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          external_id: string
          gateway?: string
          id?: string
          order_id?: string | null
          payload?: Json | null
          processed?: boolean
        }
        Update: {
          created_at?: string
          event_type?: string | null
          external_id?: string
          gateway?: string
          id?: string
          order_id?: string | null
          payload?: Json | null
          processed?: boolean
        }
        Relationships: []
      }
      payment_settings: {
        Row: {
          boleto_enabled: boolean
          credit_card_enabled: boolean
          environment: string
          gateway: string
          id: number
          last_connection_status: string | null
          last_connection_test_at: string | null
          modo_integracao: string
          pix_enabled: boolean
          updated_at: string
        }
        Insert: {
          boleto_enabled?: boolean
          credit_card_enabled?: boolean
          environment?: string
          gateway?: string
          id?: number
          last_connection_status?: string | null
          last_connection_test_at?: string | null
          modo_integracao?: string
          pix_enabled?: boolean
          updated_at?: string
        }
        Update: {
          boleto_enabled?: boolean
          credit_card_enabled?: boolean
          environment?: string
          gateway?: string
          id?: number
          last_connection_status?: string | null
          last_connection_test_at?: string | null
          modo_integracao?: string
          pix_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      prescriptions: {
        Row: {
          approved_at: string | null
          created_at: string
          customer_name: string
          customer_phone: string
          file_url: string | null
          id: string
          internal_notes: string | null
          notes: string | null
          product_id: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          customer_name: string
          customer_phone: string
          file_url?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          product_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string
          file_url?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          product_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      product_related: {
        Row: {
          created_at: string
          position: number
          product_id: string
          related_product_id: string
        }
        Insert: {
          created_at?: string
          position?: number
          product_id: string
          related_product_id: string
        }
        Update: {
          created_at?: string
          position?: number
          product_id?: string
          related_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_related_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_related_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sync_logs: {
        Row: {
          created_at: string
          error_message: string | null
          fields_protected: Json | null
          fields_updated: Json | null
          id: string
          new_values: Json | null
          old_values: Json | null
          product_id: string | null
          status: string
          sync_type: string
          trier_product_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          fields_protected?: Json | null
          fields_updated?: Json | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          product_id?: string | null
          status?: string
          sync_type: string
          trier_product_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          fields_protected?: Json | null
          fields_updated?: Json | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          product_id?: string | null
          status?: string
          sync_type?: string
          trier_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_sync_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_taxonomy: {
        Row: {
          category_id: string | null
          created_at: string
          department_id: string | null
          id: string
          is_manual: boolean
          is_primary: boolean
          product_id: string
          source: string
          subcategory_id: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          is_manual?: boolean
          is_primary?: boolean
          product_id: string
          source?: string
          subcategory_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          is_manual?: boolean
          is_primary?: boolean
          product_id?: string
          source?: string
          subcategory_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_taxonomy_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_taxonomy_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_taxonomy_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_taxonomy_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          barcode: string | null
          created_at: string
          id: string
          image_url: string | null
          name: string | null
          parent_product_id: string
          position: number
          price: number | null
          promo_price: number | null
          sku: string | null
          stock: number
          trier_product_id: string | null
          updated_at: string
          variation_type: string
          variation_value: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string | null
          parent_product_id: string
          position?: number
          price?: number | null
          promo_price?: number | null
          sku?: string | null
          stock?: number
          trier_product_id?: string | null
          updated_at?: string
          variation_type?: string
          variation_value: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string | null
          parent_product_id?: string
          position?: number
          price?: number | null
          promo_price?: number | null
          sku?: string | null
          stock?: number
          trier_product_id?: string | null
          updated_at?: string
          variation_type?: string
          variation_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          active_ingredient: string | null
          active_ingredient_code: string | null
          barcode: string | null
          bestseller_rank: number | null
          cart_quantity_limit: number | null
          category_external_id: string | null
          category_id: string | null
          category_name: string | null
          channel_price_notes: string | null
          commercial_tags: string[]
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
          generic_equivalent_id: string | null
          group_code: string | null
          group_name: string | null
          has_variants: boolean
          id: string
          image_url: string | null
          is_active: boolean | null
          is_generic: boolean
          laboratory: string | null
          laboratory_code: string | null
          last_stock_sync_at: string | null
          last_synced_at: string | null
          last_trier_sync_at: string | null
          lock_manual_price: boolean
          lock_manual_stock: boolean
          manual_active: boolean
          manual_barcode: boolean
          manual_category: boolean
          manual_description: boolean
          manual_disabled: boolean
          manual_image: boolean
          manual_name: boolean
          manual_override: boolean
          manual_seo: boolean
          manual_shelves: boolean
          manufacturer: string | null
          mapping_status: string
          max_discount_percentage: number | null
          medicine_list_type: string | null
          minimum_stock: number
          name: string
          needs_review: boolean
          on_sale: boolean
          pix_discount_percentage: number | null
          price: number
          price_base: number | null
          price_origin: string
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
          show_in_filters: boolean
          show_in_menu: boolean
          site_price: number | null
          site_promo_price: number | null
          sku: string | null
          slug: string
          source: string | null
          stock: number
          stock_origin: string
          stock_quantity: number | null
          sync_with_trier: boolean
          tags: string | null
          tarja: string | null
          trier_active: boolean | null
          trier_barcode: string | null
          trier_product_id: string | null
          trier_stock_quantity: number | null
          updated_at: string
          use_channel_pricing: boolean
          variation_type: string | null
          whatsapp_price: number | null
          whatsapp_promo_price: number | null
        }
        Insert: {
          active?: boolean
          active_ingredient?: string | null
          active_ingredient_code?: string | null
          barcode?: string | null
          bestseller_rank?: number | null
          cart_quantity_limit?: number | null
          category_external_id?: string | null
          category_id?: string | null
          category_name?: string | null
          channel_price_notes?: string | null
          commercial_tags?: string[]
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
          generic_equivalent_id?: string | null
          group_code?: string | null
          group_name?: string | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_generic?: boolean
          laboratory?: string | null
          laboratory_code?: string | null
          last_stock_sync_at?: string | null
          last_synced_at?: string | null
          last_trier_sync_at?: string | null
          lock_manual_price?: boolean
          lock_manual_stock?: boolean
          manual_active?: boolean
          manual_barcode?: boolean
          manual_category?: boolean
          manual_description?: boolean
          manual_disabled?: boolean
          manual_image?: boolean
          manual_name?: boolean
          manual_override?: boolean
          manual_seo?: boolean
          manual_shelves?: boolean
          manufacturer?: string | null
          mapping_status?: string
          max_discount_percentage?: number | null
          medicine_list_type?: string | null
          minimum_stock?: number
          name: string
          needs_review?: boolean
          on_sale?: boolean
          pix_discount_percentage?: number | null
          price?: number
          price_base?: number | null
          price_origin?: string
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
          show_in_filters?: boolean
          show_in_menu?: boolean
          site_price?: number | null
          site_promo_price?: number | null
          sku?: string | null
          slug: string
          source?: string | null
          stock?: number
          stock_origin?: string
          stock_quantity?: number | null
          sync_with_trier?: boolean
          tags?: string | null
          tarja?: string | null
          trier_active?: boolean | null
          trier_barcode?: string | null
          trier_product_id?: string | null
          trier_stock_quantity?: number | null
          updated_at?: string
          use_channel_pricing?: boolean
          variation_type?: string | null
          whatsapp_price?: number | null
          whatsapp_promo_price?: number | null
        }
        Update: {
          active?: boolean
          active_ingredient?: string | null
          active_ingredient_code?: string | null
          barcode?: string | null
          bestseller_rank?: number | null
          cart_quantity_limit?: number | null
          category_external_id?: string | null
          category_id?: string | null
          category_name?: string | null
          channel_price_notes?: string | null
          commercial_tags?: string[]
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
          generic_equivalent_id?: string | null
          group_code?: string | null
          group_name?: string | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_generic?: boolean
          laboratory?: string | null
          laboratory_code?: string | null
          last_stock_sync_at?: string | null
          last_synced_at?: string | null
          last_trier_sync_at?: string | null
          lock_manual_price?: boolean
          lock_manual_stock?: boolean
          manual_active?: boolean
          manual_barcode?: boolean
          manual_category?: boolean
          manual_description?: boolean
          manual_disabled?: boolean
          manual_image?: boolean
          manual_name?: boolean
          manual_override?: boolean
          manual_seo?: boolean
          manual_shelves?: boolean
          manufacturer?: string | null
          mapping_status?: string
          max_discount_percentage?: number | null
          medicine_list_type?: string | null
          minimum_stock?: number
          name?: string
          needs_review?: boolean
          on_sale?: boolean
          pix_discount_percentage?: number | null
          price?: number
          price_base?: number | null
          price_origin?: string
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
          show_in_filters?: boolean
          show_in_menu?: boolean
          site_price?: number | null
          site_promo_price?: number | null
          sku?: string | null
          slug?: string
          source?: string | null
          stock?: number
          stock_origin?: string
          stock_quantity?: number | null
          sync_with_trier?: boolean
          tags?: string | null
          tarja?: string | null
          trier_active?: boolean | null
          trier_barcode?: string | null
          trier_product_id?: string | null
          trier_stock_quantity?: number | null
          updated_at?: string
          use_channel_pricing?: boolean
          variation_type?: string | null
          whatsapp_price?: number | null
          whatsapp_promo_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_generic_equivalent_id_fkey"
            columns: ["generic_equivalent_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      promo_banner_blocks: {
        Row: {
          active: boolean
          animation_type: string | null
          background_image_url: string | null
          background_intensity: string | null
          badge_text: string | null
          bg_color: string
          bg_custom: string | null
          block_type: string
          created_at: string
          cta_color: string
          cta_text: string | null
          cta_url: string | null
          custom_background_color: string | null
          custom_badge_color: string | null
          custom_cta_color: string | null
          decoration_enabled: boolean | null
          id: string
          image_mode: string
          image_position: string
          image_size: string
          image_url: string | null
          new_price: number | null
          old_price: number | null
          position: number
          price_suffix: string | null
          show_cta: boolean
          show_price: boolean
          show_text: boolean
          subtitle: string | null
          theme_key: string | null
          title: string | null
          updated_at: string
          variant: string
        }
        Insert: {
          active?: boolean
          animation_type?: string | null
          background_image_url?: string | null
          background_intensity?: string | null
          badge_text?: string | null
          bg_color?: string
          bg_custom?: string | null
          block_type?: string
          created_at?: string
          cta_color?: string
          cta_text?: string | null
          cta_url?: string | null
          custom_background_color?: string | null
          custom_badge_color?: string | null
          custom_cta_color?: string | null
          decoration_enabled?: boolean | null
          id?: string
          image_mode?: string
          image_position?: string
          image_size?: string
          image_url?: string | null
          new_price?: number | null
          old_price?: number | null
          position?: number
          price_suffix?: string | null
          show_cta?: boolean
          show_price?: boolean
          show_text?: boolean
          subtitle?: string | null
          theme_key?: string | null
          title?: string | null
          updated_at?: string
          variant?: string
        }
        Update: {
          active?: boolean
          animation_type?: string | null
          background_image_url?: string | null
          background_intensity?: string | null
          badge_text?: string | null
          bg_color?: string
          bg_custom?: string | null
          block_type?: string
          created_at?: string
          cta_color?: string
          cta_text?: string | null
          cta_url?: string | null
          custom_background_color?: string | null
          custom_badge_color?: string | null
          custom_cta_color?: string | null
          decoration_enabled?: boolean | null
          id?: string
          image_mode?: string
          image_position?: string
          image_size?: string
          image_url?: string | null
          new_price?: number | null
          old_price?: number | null
          position?: number
          price_suffix?: string | null
          show_cta?: boolean
          show_price?: boolean
          show_text?: boolean
          subtitle?: string | null
          theme_key?: string | null
          title?: string | null
          updated_at?: string
          variant?: string
        }
        Relationships: []
      }
      refund_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_item_id: string | null
          product_id: string | null
          quantity: number
          reason: string | null
          refund_request_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          order_item_id?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          refund_request_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_item_id?: string | null
          product_id?: string | null
          quantity?: number
          reason?: string | null
          refund_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_refund_request_id_fkey"
            columns: ["refund_request_id"]
            isOneToOne: false
            referencedRelation: "refund_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_requests: {
        Row: {
          amount: number | null
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string | null
          mercado_pago_refund_id: string | null
          order_id: string
          payment_id: string | null
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          requested_by: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          mercado_pago_refund_id?: string | null
          order_id: string
          payment_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          mercado_pago_refund_id?: string | null
          order_id?: string
          payment_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      seller_permissions: {
        Row: {
          can_execute_refund: boolean
          can_request_refund: boolean
          can_view_prescriptions: boolean
          created_at: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          can_execute_refund?: boolean
          can_request_refund?: boolean
          can_view_prescriptions?: boolean
          created_at?: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          can_execute_refund?: boolean
          can_request_refund?: boolean
          can_view_prescriptions?: boolean
          created_at?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          order_id: string | null
          product_id: string
          quantity: number
          reason: string | null
          source: string | null
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          product_id: string
          quantity: number
          reason?: string | null
          source?: string | null
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          product_id?: string
          quantity?: number
          reason?: string | null
          source?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          address: string | null
          afe: string | null
          cnpj: string | null
          contact_email: string | null
          crf: string | null
          delivery_fee: number | null
          delivery_fee_zones: Json
          delivery_max_km: number
          delivery_mode: string
          facebook: string | null
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
          state_registration: string | null
          store_geocoded_at: string | null
          store_lat: number | null
          store_lng: number | null
          store_name: string | null
          tiktok: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          afe?: string | null
          cnpj?: string | null
          contact_email?: string | null
          crf?: string | null
          delivery_fee?: number | null
          delivery_fee_zones?: Json
          delivery_max_km?: number
          delivery_mode?: string
          facebook?: string | null
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
          state_registration?: string | null
          store_geocoded_at?: string | null
          store_lat?: number | null
          store_lng?: number | null
          store_name?: string | null
          tiktok?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          afe?: string | null
          cnpj?: string | null
          contact_email?: string | null
          crf?: string | null
          delivery_fee?: number | null
          delivery_fee_zones?: Json
          delivery_max_km?: number
          delivery_mode?: string
          facebook?: string | null
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
          state_registration?: string | null
          store_geocoded_at?: string | null
          store_lat?: number | null
          store_lng?: number | null
          store_name?: string | null
          tiktok?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      subcategories: {
        Row: {
          active: boolean
          category_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          position: number
          show_in_menu: boolean
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          position?: number
          show_in_menu?: boolean
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          position?: number
          show_in_menu?: boolean
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      trier_barcode_divergences: {
        Row: {
          created_at: string
          current_barcode: string | null
          id: string
          product_id: string | null
          resolved_at: string | null
          status: string
          trier_barcode: string | null
          trier_product_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_barcode?: string | null
          id?: string
          product_id?: string | null
          resolved_at?: string | null
          status?: string
          trier_barcode?: string | null
          trier_product_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_barcode?: string | null
          id?: string
          product_id?: string | null
          resolved_at?: string | null
          status?: string
          trier_barcode?: string | null
          trier_product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trier_barcode_divergences_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      trier_category_mappings: {
        Row: {
          active: boolean
          case_sensitive: boolean
          category_id: string | null
          created_at: string
          department_id: string | null
          id: string
          match_type: string
          match_value: string
          notes: string | null
          priority: number
          source_field: string
          subcategory_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          case_sensitive?: boolean
          category_id?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          match_type: string
          match_value: string
          notes?: string | null
          priority?: number
          source_field: string
          subcategory_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          case_sensitive?: boolean
          category_id?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          match_type?: string
          match_value?: string
          notes?: string | null
          priority?: number
          source_field?: string
          subcategory_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trier_category_mappings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trier_category_mappings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trier_category_mappings_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
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
      trier_order_logs: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          endpoint: string | null
          error_message: string | null
          http_status: number | null
          id: string
          order_id: string | null
          request_payload_masked: Json | null
          response_payload_masked: Json | null
          status: string | null
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          endpoint?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          order_id?: string | null
          request_payload_masked?: Json | null
          response_payload_masked?: Json | null
          status?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          endpoint?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          order_id?: string | null
          request_payload_masked?: Json | null
          response_payload_masked?: Json | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trier_order_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
          allow_overwrite_site_price: boolean
          allow_overwrite_whatsapp_price: boolean
          auto_send_orders_enabled: boolean
          auto_sync_paused: boolean
          base_url: string
          branch_code: string | null
          card_payment_code: number | null
          check_order_status_enabled: boolean
          created_at: string
          delivery_fee_product_code: string | null
          delivery_fee_product_name: string | null
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
          pix_payment_code: number | null
          schedule_discounts_minutes: number
          schedule_prices_minutes: number
          schedule_products_minutes: number
          schedule_stock_minutes: number
          seller_code: number | null
          seller_name: string | null
          send_orders_enabled: boolean
          stock_source: string
          sync_categories_enabled: boolean
          sync_discounts_enabled: boolean
          sync_mode: string
          sync_prices_enabled: boolean
          sync_products_enabled: boolean
          sync_stock_enabled: boolean
          trier_customer_mode: string
          trier_payment_mode: string
          trier_pix_native_code: number | null
          trier_sales_base_mode: string | null
          trier_sales_base_url: string | null
          trier_site_credit_card_code: number | null
          trier_site_debit_card_code: number | null
          trier_site_pix_card_code: number | null
          trier_test_customer_code: number | null
          trier_test_seller_code: number | null
          trier_test_seller_name: string | null
          updated_at: string
        }
        Insert: {
          allow_overwrite_site_price?: boolean
          allow_overwrite_whatsapp_price?: boolean
          auto_send_orders_enabled?: boolean
          auto_sync_paused?: boolean
          base_url?: string
          branch_code?: string | null
          card_payment_code?: number | null
          check_order_status_enabled?: boolean
          created_at?: string
          delivery_fee_product_code?: string | null
          delivery_fee_product_name?: string | null
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
          pix_payment_code?: number | null
          schedule_discounts_minutes?: number
          schedule_prices_minutes?: number
          schedule_products_minutes?: number
          schedule_stock_minutes?: number
          seller_code?: number | null
          seller_name?: string | null
          send_orders_enabled?: boolean
          stock_source?: string
          sync_categories_enabled?: boolean
          sync_discounts_enabled?: boolean
          sync_mode?: string
          sync_prices_enabled?: boolean
          sync_products_enabled?: boolean
          sync_stock_enabled?: boolean
          trier_customer_mode?: string
          trier_payment_mode?: string
          trier_pix_native_code?: number | null
          trier_sales_base_mode?: string | null
          trier_sales_base_url?: string | null
          trier_site_credit_card_code?: number | null
          trier_site_debit_card_code?: number | null
          trier_site_pix_card_code?: number | null
          trier_test_customer_code?: number | null
          trier_test_seller_code?: number | null
          trier_test_seller_name?: string | null
          updated_at?: string
        }
        Update: {
          allow_overwrite_site_price?: boolean
          allow_overwrite_whatsapp_price?: boolean
          auto_send_orders_enabled?: boolean
          auto_sync_paused?: boolean
          base_url?: string
          branch_code?: string | null
          card_payment_code?: number | null
          check_order_status_enabled?: boolean
          created_at?: string
          delivery_fee_product_code?: string | null
          delivery_fee_product_name?: string | null
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
          pix_payment_code?: number | null
          schedule_discounts_minutes?: number
          schedule_prices_minutes?: number
          schedule_products_minutes?: number
          schedule_stock_minutes?: number
          seller_code?: number | null
          seller_name?: string | null
          send_orders_enabled?: boolean
          stock_source?: string
          sync_categories_enabled?: boolean
          sync_discounts_enabled?: boolean
          sync_mode?: string
          sync_prices_enabled?: boolean
          sync_products_enabled?: boolean
          sync_stock_enabled?: boolean
          trier_customer_mode?: string
          trier_payment_mode?: string
          trier_pix_native_code?: number | null
          trier_sales_base_mode?: string | null
          trier_sales_base_url?: string | null
          trier_site_credit_card_code?: number | null
          trier_site_debit_card_code?: number | null
          trier_site_pix_card_code?: number | null
          trier_test_customer_code?: number | null
          trier_test_seller_code?: number | null
          trier_test_seller_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      trier_sync_jobs: {
        Row: {
          created_at: string
          details: Json | null
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
          details?: Json | null
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
          details?: Json | null
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
      products_health_summary: {
        Row: {
          ativos: number | null
          ativos_sem_estoque: number | null
          com_barcode: number | null
          com_estoque: number | null
          com_promo: number | null
          com_trier_id: number | null
          estoque_baixo_ativos: number | null
          ja_sincronizado: number | null
          mapeados: number | null
          marcados_revisao: number | null
          orfaos: number | null
          origem_import: number | null
          origem_manual: number | null
          origem_trier: number | null
          revisar: number | null
          sem_preco: number | null
          total: number | null
          ultima_sync: string | null
          vendaveis: number | null
        }
        Relationships: []
      }
      store_settings_public: {
        Row: {
          address: string | null
          afe: string | null
          cnpj: string | null
          contact_email: string | null
          crf: string | null
          delivery_fee: number | null
          facebook: string | null
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
          state_registration: string | null
          store_name: string | null
          tiktok: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          afe?: string | null
          cnpj?: string | null
          contact_email?: string | null
          crf?: string | null
          delivery_fee?: number | null
          facebook?: string | null
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
          state_registration?: string | null
          store_name?: string | null
          tiktok?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          afe?: string | null
          cnpj?: string | null
          contact_email?: string | null
          crf?: string | null
          delivery_fee?: number | null
          facebook?: string | null
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
          state_registration?: string | null
          store_name?: string | null
          tiktok?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_invite_seller: { Args: { _email: string }; Returns: Json }
      admin_list_sellers: {
        Args: never
        Returns: {
          can_execute_refund: boolean
          can_request_refund: boolean
          can_view_prescriptions: boolean
          email: string
          full_name: string
          granted_at: string
          user_id: string
        }[]
      }
      admin_product_detail: { Args: { _id: string }; Returns: Json }
      admin_products_list: {
        Args: {
          _category_id?: string
          _manufacturer?: string
          _page?: number
          _page_size?: number
          _search?: string
          _status?: string
        }
        Returns: Json
      }
      admin_revoke_seller: { Args: { _user_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "seller"
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
      app_role: ["admin", "user", "seller"],
    },
  },
} as const
