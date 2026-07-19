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
      admin_notifications: {
        Row: {
          id: string
          order_id: string | null
          organization_id: string
          store_id: string
        }
        Insert: {
          id?: string
          order_id?: string | null
          organization_id?: string
          store_id?: string
        }
        Update: {
          id?: string
          order_id?: string | null
          organization_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_order_same_tenant_fk"
            columns: ["organization_id", "store_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "admin_notifications_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      banners: {
        Row: {
          active: boolean
          id: string
          linked_campaign_id: string | null
          linked_category_id: string | null
          linked_product_id: string | null
          organization_id: string
          store_id: string
        }
        Insert: {
          active?: boolean
          id?: string
          linked_campaign_id?: string | null
          linked_category_id?: string | null
          linked_product_id?: string | null
          organization_id?: string
          store_id?: string
        }
        Update: {
          active?: boolean
          id?: string
          linked_campaign_id?: string | null
          linked_category_id?: string | null
          linked_product_id?: string | null
          organization_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banners_campaign_same_tenant_fk"
            columns: ["organization_id", "store_id", "linked_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "banners_category_same_tenant_fk"
            columns: ["organization_id", "store_id", "linked_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "banners_product_same_tenant_fk"
            columns: ["organization_id", "store_id", "linked_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "banners_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      campaign_products: {
        Row: {
          campaign_id: string
          id: string
          organization_id: string
          product_id: string
          store_id: string
        }
        Insert: {
          campaign_id: string
          id?: string
          organization_id?: string
          product_id: string
          store_id?: string
        }
        Update: {
          campaign_id?: string
          id?: string
          organization_id?: string
          product_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_products_campaign_same_tenant_fk"
            columns: ["organization_id", "store_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "campaign_products_product_same_tenant_fk"
            columns: ["organization_id", "store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "campaign_products_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      campaigns: {
        Row: {
          active: boolean
          destination_category_id: string | null
          destination_product_id: string | null
          id: string
          name: string
          organization_id: string
          published: boolean
          slug: string
          store_id: string
        }
        Insert: {
          active?: boolean
          destination_category_id?: string | null
          destination_product_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          published?: boolean
          slug: string
          store_id?: string
        }
        Update: {
          active?: boolean
          destination_category_id?: string | null
          destination_product_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          published?: boolean
          slug?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_category_same_tenant_fk"
            columns: ["organization_id", "store_id", "destination_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "campaigns_product_same_tenant_fk"
            columns: ["organization_id", "store_id", "destination_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "campaigns_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          department_id: string | null
          id: string
          name: string
          organization_id: string
          slug: string
          store_id: string
        }
        Insert: {
          active?: boolean
          department_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          slug: string
          store_id?: string
        }
        Update: {
          active?: boolean
          department_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_department_same_tenant_fk"
            columns: ["organization_id", "store_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "categories_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          cep: string
          city: string
          customer_id: string
          id: string
          state: string
          street: string
        }
        Insert: {
          cep?: string
          city?: string
          customer_id: string
          id?: string
          state?: string
          street?: string
        }
        Update: {
          cep?: string
          city?: string
          customer_id?: string
          id?: string
          state?: string
          street?: string
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
          id: string
          name: string
          organization_id: string
          slug: string
          store_id: string
        }
        Insert: {
          active?: boolean
          id?: string
          name?: string
          organization_id?: string
          slug: string
          store_id?: string
        }
        Update: {
          active?: boolean
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      features: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          key: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          key: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          key?: string
          name?: string
        }
        Relationships: []
      }
      home_layout: {
        Row: {
          enabled: boolean
          id: string
          organization_id: string
          section_key: string
          store_id: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          organization_id?: string
          section_key: string
          store_id?: string
        }
        Update: {
          enabled?: boolean
          id?: string
          organization_id?: string
          section_key?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_layout_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      home_mosaic_tiles: {
        Row: {
          active: boolean
          campaign_id: string | null
          category_id: string | null
          id: string
          organization_id: string
          product_id: string | null
          store_id: string
        }
        Insert: {
          active?: boolean
          campaign_id?: string | null
          category_id?: string | null
          id?: string
          organization_id?: string
          product_id?: string | null
          store_id?: string
        }
        Update: {
          active?: boolean
          campaign_id?: string | null
          category_id?: string | null
          id?: string
          organization_id?: string
          product_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_mosaic_campaign_same_tenant_fk"
            columns: ["organization_id", "store_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "home_mosaic_category_same_tenant_fk"
            columns: ["organization_id", "store_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "home_mosaic_product_same_tenant_fk"
            columns: ["organization_id", "store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "home_mosaic_tiles_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean
          campaign_id: string | null
          category_id: string | null
          id: string
          organization_id: string
          parent_id: string | null
          product_id: string | null
          store_id: string
        }
        Insert: {
          active?: boolean
          campaign_id?: string | null
          category_id?: string | null
          id?: string
          organization_id?: string
          parent_id?: string | null
          product_id?: string | null
          store_id?: string
        }
        Update: {
          active?: boolean
          campaign_id?: string | null
          category_id?: string | null
          id?: string
          organization_id?: string
          parent_id?: string | null
          product_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_campaign_same_tenant_fk"
            columns: ["organization_id", "store_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "menu_items_category_same_tenant_fk"
            columns: ["organization_id", "store_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "menu_items_parent_same_tenant_fk"
            columns: ["organization_id", "store_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "menu_items_product_same_tenant_fk"
            columns: ["organization_id", "store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "menu_items_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      order_events: {
        Row: {
          id: string
          order_id: string
          organization_id: string
          store_id: string
        }
        Insert: {
          id?: string
          order_id: string
          organization_id?: string
          store_id?: string
        }
        Update: {
          id?: string
          order_id?: string
          organization_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_same_tenant_fk"
            columns: ["organization_id", "store_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "order_events_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          organization_id: string
          product_id: string | null
          product_name: string
          quantity: number
          store_id: string
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          id?: string
          order_id: string
          organization_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          store_id?: string
          unit_price?: number
          variant_id?: string | null
        }
        Update: {
          id?: string
          order_id?: string
          organization_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          store_id?: string
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_same_tenant_fk"
            columns: ["organization_id", "store_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "order_items_product_same_tenant_fk"
            columns: ["organization_id", "store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "order_items_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "order_items_variant_same_tenant_fk"
            columns: ["organization_id", "store_id", "variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
        ]
      }
      orders: {
        Row: {
          customer_name: string
          customer_phone: string
          id: string
          organization_id: string
          payment_status: string
          store_id: string
          user_id: string | null
        }
        Insert: {
          customer_name?: string
          customer_phone?: string
          id?: string
          organization_id?: string
          payment_status?: string
          store_id?: string
          user_id?: string | null
        }
        Update: {
          customer_name?: string
          customer_phone?: string
          id?: string
          organization_id?: string
          payment_status?: string
          store_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_domains: {
        Row: {
          created_at: string
          hostname: string
          id: string
          is_primary: boolean
          organization_id: string
          status: string
          store_id: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          hostname: string
          id?: string
          is_primary?: boolean
          organization_id: string
          status?: string
          store_id?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          hostname?: string
          id?: string
          is_primary?: boolean
          organization_id?: string
          status?: string
          store_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_domains_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_feature_overrides: {
        Row: {
          created_at: string
          enabled: boolean
          expires_at: string | null
          feature_key: string
          limits: Json
          organization_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          enabled: boolean
          expires_at?: string | null
          feature_key: string
          limits?: Json
          organization_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          expires_at?: string | null
          feature_key?: string
          limits?: Json
          organization_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_feature_overrides_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "organization_feature_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          kind: string
          last_connection_status: string | null
          last_connection_test_at: string | null
          last_sync_at: string | null
          organization_id: string
          provider: string
          secret_ref: string | null
          status: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          kind: string
          last_connection_status?: string | null
          last_connection_test_at?: string | null
          last_sync_at?: string | null
          organization_id: string
          provider: string
          secret_ref?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          kind?: string
          last_connection_status?: string | null
          last_connection_test_at?: string | null
          last_sync_at?: string | null
          organization_id?: string
          provider?: string
          secret_ref?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_integrations_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          default_store_id: string | null
          id: string
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_store_id?: string | null
          id?: string
          organization_id: string
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_store_id?: string | null
          id?: string
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_default_store_same_org_fk"
            columns: ["organization_id", "default_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          legal_name: string | null
          name: string
          settings: Json
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          name: string
          settings?: Json
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          legal_name?: string | null
          name?: string
          settings?: Json
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_errors: {
        Row: {
          id: string
          order_id: string | null
          organization_id: string
          store_id: string
        }
        Insert: {
          id?: string
          order_id?: string | null
          organization_id?: string
          store_id?: string
        }
        Update: {
          id?: string
          order_id?: string | null
          organization_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_errors_order_same_tenant_fk"
            columns: ["organization_id", "store_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "payment_errors_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      payment_events: {
        Row: {
          id: string
          order_id: string | null
          organization_id: string
          store_id: string
        }
        Insert: {
          id?: string
          order_id?: string | null
          organization_id?: string
          store_id?: string
        }
        Update: {
          id?: string
          order_id?: string | null
          organization_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_order_same_tenant_fk"
            columns: ["organization_id", "store_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "payment_events_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      payment_providers: {
        Row: {
          capabilities: string[]
          created_at: string
          credential_secret_name: string | null
          display_name: string
          enabled: boolean
          environment: string
          id: string
          metadata: Json
          organization_id: string
          provider_key: string
          public_config: Json
          store_id: string
          updated_at: string
          webhook_secret_name: string | null
        }
        Insert: {
          capabilities?: string[]
          created_at?: string
          credential_secret_name?: string | null
          display_name: string
          enabled?: boolean
          environment?: string
          id?: string
          metadata?: Json
          organization_id: string
          provider_key: string
          public_config?: Json
          store_id: string
          updated_at?: string
          webhook_secret_name?: string | null
        }
        Update: {
          capabilities?: string[]
          created_at?: string
          credential_secret_name?: string | null
          display_name?: string
          enabled?: boolean
          environment?: string
          id?: string
          metadata?: Json
          organization_id?: string
          provider_key?: string
          public_config?: Json
          store_id?: string
          updated_at?: string
          webhook_secret_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_providers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_providers_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      payment_routes: {
        Row: {
          conditions: Json
          created_at: string
          currency: string
          enabled: boolean
          id: string
          max_amount: number | null
          min_amount: number | null
          organization_id: string
          payment_method: string
          priority: number
          provider_id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          conditions?: Json
          created_at?: string
          currency?: string
          enabled?: boolean
          id?: string
          max_amount?: number | null
          min_amount?: number | null
          organization_id: string
          payment_method: string
          priority?: number
          provider_id: string
          store_id: string
          updated_at?: string
        }
        Update: {
          conditions?: Json
          created_at?: string
          currency?: string
          enabled?: boolean
          id?: string
          max_amount?: number | null
          min_amount?: number | null
          organization_id?: string
          payment_method?: string
          priority?: number
          provider_id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_routes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_routes_provider_same_tenant_fk"
            columns: ["organization_id", "store_id", "provider_id"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "payment_routes_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
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
          organization_id: string
          pix_enabled: boolean
          store_id: string
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
          organization_id: string
          pix_enabled?: boolean
          store_id: string
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
          organization_id?: string
          pix_enabled?: boolean
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settings_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      pharmacies: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      pharmacy_memberships: {
        Row: {
          created_at: string
          is_active: boolean
          pharmacy_id: string
          role: Database["public"]["Enums"]["pharmacy_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          pharmacy_id: string
          role: Database["public"]["Enums"]["pharmacy_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          pharmacy_id?: string
          role?: Database["public"]["Enums"]["pharmacy_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pharmacy_memberships_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          enabled: boolean
          feature_key: string
          limits: Json
          plan_id: string
        }
        Insert: {
          enabled?: boolean
          feature_key: string
          limits?: Json
          plan_id: string
        }
        Update: {
          enabled?: boolean
          feature_key?: string
          limits?: Json
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "features"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          price_monthly: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id: string
          name: string
          price_monthly?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_monthly?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      prescriptions: {
        Row: {
          customer_name: string
          customer_phone: string
          id: string
          organization_id: string
          product_id: string | null
          store_id: string
          user_id: string | null
        }
        Insert: {
          customer_name?: string
          customer_phone?: string
          id?: string
          organization_id?: string
          product_id?: string | null
          store_id?: string
          user_id?: string | null
        }
        Update: {
          customer_name?: string
          customer_phone?: string
          id?: string
          organization_id?: string
          product_id?: string | null
          store_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_product_same_tenant_fk"
            columns: ["organization_id", "store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "prescriptions_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      product_related: {
        Row: {
          organization_id: string
          product_id: string
          related_product_id: string
          store_id: string
        }
        Insert: {
          organization_id?: string
          product_id: string
          related_product_id: string
          store_id?: string
        }
        Update: {
          organization_id?: string
          product_id?: string
          related_product_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_related_product_same_tenant_fk"
            columns: ["organization_id", "store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "product_related_related_same_tenant_fk"
            columns: ["organization_id", "store_id", "related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "product_related_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      product_taxonomy: {
        Row: {
          category_id: string | null
          department_id: string | null
          id: string
          organization_id: string
          product_id: string
          store_id: string
          subcategory_id: string | null
        }
        Insert: {
          category_id?: string | null
          department_id?: string | null
          id?: string
          organization_id?: string
          product_id: string
          store_id?: string
          subcategory_id?: string | null
        }
        Update: {
          category_id?: string | null
          department_id?: string | null
          id?: string
          organization_id?: string
          product_id?: string
          store_id?: string
          subcategory_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_taxonomy_category_same_tenant_fk"
            columns: ["organization_id", "store_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "product_taxonomy_department_same_tenant_fk"
            columns: ["organization_id", "store_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "product_taxonomy_product_same_tenant_fk"
            columns: ["organization_id", "store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "product_taxonomy_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "product_taxonomy_subcategory_same_tenant_fk"
            columns: ["organization_id", "store_id", "subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          id: string
          organization_id: string
          parent_product_id: string
          store_id: string
        }
        Insert: {
          active?: boolean
          id?: string
          organization_id?: string
          parent_product_id: string
          store_id?: string
        }
        Update: {
          active?: boolean
          id?: string
          organization_id?: string
          parent_product_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_parent_same_tenant_fk"
            columns: ["organization_id", "store_id", "parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "product_variants_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string | null
          generic_equivalent_id: string | null
          id: string
          name: string
          organization_id: string
          slug: string
          store_id: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          generic_equivalent_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          slug: string
          store_id?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          generic_equivalent_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_same_tenant_fk"
            columns: ["organization_id", "store_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "products_generic_same_tenant_fk"
            columns: ["organization_id", "store_id", "generic_equivalent_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "products_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promo_banner_blocks: {
        Row: {
          active: boolean
          id: string
          organization_id: string
          store_id: string
        }
        Insert: {
          active?: boolean
          id?: string
          organization_id?: string
          store_id?: string
        }
        Update: {
          active?: boolean
          id?: string
          organization_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_banner_blocks_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      refund_items: {
        Row: {
          id: string
          order_item_id: string | null
          organization_id: string
          product_id: string | null
          refund_request_id: string
          store_id: string
        }
        Insert: {
          id?: string
          order_item_id?: string | null
          organization_id?: string
          product_id?: string | null
          refund_request_id: string
          store_id?: string
        }
        Update: {
          id?: string
          order_item_id?: string | null
          organization_id?: string
          product_id?: string | null
          refund_request_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_items_order_item_same_tenant_fk"
            columns: ["organization_id", "store_id", "order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "refund_items_product_same_tenant_fk"
            columns: ["organization_id", "store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "refund_items_request_same_tenant_fk"
            columns: ["organization_id", "store_id", "refund_request_id"]
            isOneToOne: false
            referencedRelation: "refund_requests"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "refund_items_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      refund_requests: {
        Row: {
          id: string
          order_id: string
          organization_id: string
          store_id: string
        }
        Insert: {
          id?: string
          order_id: string
          organization_id?: string
          store_id?: string
        }
        Update: {
          id?: string
          order_id?: string
          organization_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_order_same_tenant_fk"
            columns: ["organization_id", "store_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "refund_requests_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          id: string
          order_id: string | null
          organization_id: string
          product_id: string
          store_id: string
        }
        Insert: {
          id?: string
          order_id?: string | null
          organization_id?: string
          product_id: string
          store_id?: string
        }
        Update: {
          id?: string
          order_id?: string | null
          organization_id?: string
          product_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_order_same_tenant_fk"
            columns: ["organization_id", "store_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_product_same_tenant_fk"
            columns: ["organization_id", "store_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "stock_movements_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
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
          organization_id: string
          pharmacist_name: string | null
          pix_discount_enabled: boolean
          pix_discount_percentage: number
          quality_require_own_image: boolean
          quality_strict_mode: string
          sanitary_license: string | null
          sanitary_notice: string | null
          served_neighborhoods: string | null
          state_registration: string | null
          store_geocoded_at: string | null
          store_id: string
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
          organization_id: string
          pharmacist_name?: string | null
          pix_discount_enabled?: boolean
          pix_discount_percentage?: number
          quality_require_own_image?: boolean
          quality_strict_mode?: string
          sanitary_license?: string | null
          sanitary_notice?: string | null
          served_neighborhoods?: string | null
          state_registration?: string | null
          store_geocoded_at?: string | null
          store_id: string
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
          organization_id?: string
          pharmacist_name?: string | null
          pix_discount_enabled?: boolean
          pix_discount_percentage?: number
          quality_require_own_image?: boolean
          quality_strict_mode?: string
          sanitary_license?: string | null
          sanitary_notice?: string | null
          served_neighborhoods?: string | null
          state_registration?: string | null
          store_geocoded_at?: string | null
          store_id?: string
          store_lat?: number | null
          store_lng?: number | null
          store_name?: string | null
          tiktok?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_settings_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          address: Json
          cnpj: string | null
          code: string
          created_at: string
          id: string
          is_headquarters: boolean
          name: string
          organization_id: string
          slug: string
          state_registration: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: Json
          cnpj?: string | null
          code: string
          created_at?: string
          id?: string
          is_headquarters?: boolean
          name: string
          organization_id: string
          slug: string
          state_registration?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: Json
          cnpj?: string | null
          code?: string
          created_at?: string
          id?: string
          is_headquarters?: boolean
          name?: string
          organization_id?: string
          slug?: string
          state_registration?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          active: boolean
          category_id: string
          id: string
          name: string
          organization_id: string
          slug: string
          store_id: string
        }
        Insert: {
          active?: boolean
          category_id: string
          id?: string
          name?: string
          organization_id?: string
          slug: string
          store_id?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          id?: string
          name?: string
          organization_id?: string
          slug?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_same_tenant_fk"
            columns: ["organization_id", "store_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["organization_id", "store_id", "id"]
          },
          {
            foreignKeyName: "subcategories_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          organization_id: string
          plan_id: string
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id: string
          plan_id: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
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
          organization_id: string
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
          store_id: string
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
          organization_id: string
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
          store_id: string
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
          organization_id?: string
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
          store_id?: string
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
        Relationships: [
          {
            foreignKeyName: "trier_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trier_settings_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
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
          organization_id: string | null
          pharmacist_name: string | null
          pix_discount_enabled: boolean | null
          pix_discount_percentage: number | null
          sanitary_license: string | null
          sanitary_notice: string | null
          served_neighborhoods: string | null
          state_registration: string | null
          store_id: string | null
          store_name: string | null
          tiktok: string | null
          updated_at: string | null
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
          organization_id?: string | null
          pharmacist_name?: string | null
          pix_discount_enabled?: boolean | null
          pix_discount_percentage?: number | null
          sanitary_license?: string | null
          sanitary_notice?: string | null
          served_neighborhoods?: string | null
          state_registration?: string | null
          store_id?: string | null
          store_name?: string | null
          tiktok?: string | null
          updated_at?: string | null
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
          organization_id?: string | null
          pharmacist_name?: string | null
          pix_discount_enabled?: boolean | null
          pix_discount_percentage?: number | null
          sanitary_license?: string | null
          sanitary_notice?: string | null
          served_neighborhoods?: string | null
          state_registration?: string | null
          store_id?: string | null
          store_name?: string | null
          tiktok?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_settings_store_same_org_fk"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "user" | "seller"
      pharmacy_role: "owner" | "admin" | "pharmacist" | "staff"
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
      pharmacy_role: ["owner", "admin", "pharmacist", "staff"],
    },
  },
} as const
