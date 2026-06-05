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
      admin_audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["admin_audit_action"]
          actor_email: string | null
          actor_id: string
          created_at: string
          details: Json
          id: string
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["admin_audit_action"]
          actor_email?: string | null
          actor_id: string
          created_at?: string
          details?: Json
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["admin_audit_action"]
          actor_email?: string | null
          actor_id?: string
          created_at?: string
          details?: Json
          id?: string
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      case_documents: {
        Row: {
          caption: string | null
          case_id: string
          created_at: string
          doc_type: Database["public"]["Enums"]["document_type"]
          file_path: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          caption?: string | null
          case_id: string
          created_at?: string
          doc_type?: Database["public"]["Enums"]["document_type"]
          file_path: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          caption?: string | null
          case_id?: string
          created_at?: string
          doc_type?: Database["public"]["Enums"]["document_type"]
          file_path?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_events: {
        Row: {
          actor_id: string | null
          case_id: string
          created_at: string
          event_type: Database["public"]["Enums"]["case_event_type"]
          from_status: Database["public"]["Enums"]["case_status"] | null
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          to_status: Database["public"]["Enums"]["case_status"] | null
        }
        Insert: {
          actor_id?: string | null
          case_id: string
          created_at?: string
          event_type: Database["public"]["Enums"]["case_event_type"]
          from_status?: Database["public"]["Enums"]["case_status"] | null
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          to_status?: Database["public"]["Enums"]["case_status"] | null
        }
        Update: {
          actor_id?: string | null
          case_id?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["case_event_type"]
          from_status?: Database["public"]["Enums"]["case_status"] | null
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          to_status?: Database["public"]["Enums"]["case_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_signatures: {
        Row: {
          captured_by: string | null
          case_id: string
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          signature_data: string
          signature_type: Database["public"]["Enums"]["signature_type"]
          signer_name: string
          signer_title: string | null
        }
        Insert: {
          captured_by?: string | null
          case_id: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          signature_data: string
          signature_type: Database["public"]["Enums"]["signature_type"]
          signer_name: string
          signer_title?: string | null
        }
        Update: {
          captured_by?: string | null
          case_id?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          signature_data?: string
          signature_type?: Database["public"]["Enums"]["signature_type"]
          signer_name?: string
          signer_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_signatures_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          authorizing_party_name: string | null
          authorizing_party_phone: string | null
          authorizing_party_relation: string | null
          case_number: string
          created_at: string
          created_by: string | null
          decedent_dob: string | null
          decedent_dod: string | null
          decedent_first_name: string | null
          decedent_last_name: string
          decedent_sex: string | null
          decedent_weight_lbs: number | null
          dropoff_address: string | null
          dropoff_city: string | null
          dropoff_facility_id: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          dropoff_notes: string | null
          dropoff_state: string | null
          dropoff_zip: string | null
          id: string
          pickup_address: string | null
          pickup_city: string | null
          pickup_contact_name: string | null
          pickup_contact_phone: string | null
          pickup_facility_id: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_notes: string | null
          pickup_state: string | null
          pickup_zip: string | null
          primary_driver_id: string | null
          scheduled_at: string | null
          secondary_driver_id: string | null
          special_handling: string | null
          status: Database["public"]["Enums"]["case_status"]
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          authorizing_party_name?: string | null
          authorizing_party_phone?: string | null
          authorizing_party_relation?: string | null
          case_number?: string
          created_at?: string
          created_by?: string | null
          decedent_dob?: string | null
          decedent_dod?: string | null
          decedent_first_name?: string | null
          decedent_last_name: string
          decedent_sex?: string | null
          decedent_weight_lbs?: number | null
          dropoff_address?: string | null
          dropoff_city?: string | null
          dropoff_facility_id?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          dropoff_notes?: string | null
          dropoff_state?: string | null
          dropoff_zip?: string | null
          id?: string
          pickup_address?: string | null
          pickup_city?: string | null
          pickup_contact_name?: string | null
          pickup_contact_phone?: string | null
          pickup_facility_id?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_notes?: string | null
          pickup_state?: string | null
          pickup_zip?: string | null
          primary_driver_id?: string | null
          scheduled_at?: string | null
          secondary_driver_id?: string | null
          special_handling?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          authorizing_party_name?: string | null
          authorizing_party_phone?: string | null
          authorizing_party_relation?: string | null
          case_number?: string
          created_at?: string
          created_by?: string | null
          decedent_dob?: string | null
          decedent_dod?: string | null
          decedent_first_name?: string | null
          decedent_last_name?: string
          decedent_sex?: string | null
          decedent_weight_lbs?: number | null
          dropoff_address?: string | null
          dropoff_city?: string | null
          dropoff_facility_id?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          dropoff_notes?: string | null
          dropoff_state?: string | null
          dropoff_zip?: string | null
          id?: string
          pickup_address?: string | null
          pickup_city?: string | null
          pickup_contact_name?: string | null
          pickup_contact_phone?: string | null
          pickup_facility_id?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_notes?: string | null
          pickup_state?: string | null
          pickup_zip?: string | null
          primary_driver_id?: string | null
          scheduled_at?: string | null
          secondary_driver_id?: string | null
          special_handling?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_dropoff_facility_id_fkey"
            columns: ["dropoff_facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_pickup_facility_id_fkey"
            columns: ["pickup_facility_id"]
            isOneToOne: false
            referencedRelation: "facilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      cremation_logs: {
        Row: {
          ash_weight_lbs: number | null
          comment: string | null
          container_type: string | null
          created_at: string
          decedent_id: string
          end_time: string | null
          id: string
          operator_id: string | null
          organization_id: string
          retort: string | null
          start_time: string | null
          updated_at: string
          weight_lbs: number | null
        }
        Insert: {
          ash_weight_lbs?: number | null
          comment?: string | null
          container_type?: string | null
          created_at?: string
          decedent_id: string
          end_time?: string | null
          id?: string
          operator_id?: string | null
          organization_id: string
          retort?: string | null
          start_time?: string | null
          updated_at?: string
          weight_lbs?: number | null
        }
        Update: {
          ash_weight_lbs?: number | null
          comment?: string | null
          container_type?: string | null
          created_at?: string
          decedent_id?: string
          end_time?: string | null
          id?: string
          operator_id?: string | null
          organization_id?: string
          retort?: string | null
          start_time?: string | null
          updated_at?: string
          weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cremation_logs_decedent_id_fkey"
            columns: ["decedent_id"]
            isOneToOne: false
            referencedRelation: "decedents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cremation_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_export_audit: {
        Row: {
          created_at: string
          export_type: string
          filename: string
          id: string
          organization_id: string
          range_from: string | null
          range_to: string | null
          row_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          export_type: string
          filename: string
          id?: string
          organization_id: string
          range_from?: string | null
          range_to?: string | null
          row_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          export_type?: string
          filename?: string
          id?: string
          organization_id?: string
          range_from?: string | null
          range_to?: string | null
          row_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_export_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      decedent_events: {
        Row: {
          actor_id: string | null
          created_at: string
          decedent_id: string
          event_type: Database["public"]["Enums"]["decedent_event_type"]
          from_status: Database["public"]["Enums"]["decedent_status"] | null
          id: string
          message: string | null
          organization_id: string
          to_status: Database["public"]["Enums"]["decedent_status"] | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          decedent_id: string
          event_type: Database["public"]["Enums"]["decedent_event_type"]
          from_status?: Database["public"]["Enums"]["decedent_status"] | null
          id?: string
          message?: string | null
          organization_id: string
          to_status?: Database["public"]["Enums"]["decedent_status"] | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          decedent_id?: string
          event_type?: Database["public"]["Enums"]["decedent_event_type"]
          from_status?: Database["public"]["Enums"]["decedent_status"] | null
          id?: string
          message?: string | null
          organization_id?: string
          to_status?: Database["public"]["Enums"]["decedent_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "decedent_events_decedent_id_fkey"
            columns: ["decedent_id"]
            isOneToOne: false
            referencedRelation: "decedents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decedent_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      decedent_releases: {
        Row: {
          created_at: string
          decedent_id: string
          id: string
          id_number: string | null
          id_type: string | null
          item_type: string
          notes: string | null
          organization_id: string
          released_at: string
          released_by: string | null
          released_to_name: string
          released_to_phone: string | null
          released_to_relation: string | null
          signature_data: string
          signer_name: string
          updated_at: string
          witnessed_by: string | null
        }
        Insert: {
          created_at?: string
          decedent_id: string
          id?: string
          id_number?: string | null
          id_type?: string | null
          item_type: string
          notes?: string | null
          organization_id: string
          released_at?: string
          released_by?: string | null
          released_to_name: string
          released_to_phone?: string | null
          released_to_relation?: string | null
          signature_data: string
          signer_name: string
          updated_at?: string
          witnessed_by?: string | null
        }
        Update: {
          created_at?: string
          decedent_id?: string
          id?: string
          id_number?: string | null
          id_type?: string | null
          item_type?: string
          notes?: string | null
          organization_id?: string
          released_at?: string
          released_by?: string | null
          released_to_name?: string
          released_to_phone?: string | null
          released_to_relation?: string | null
          signature_data?: string
          signer_name?: string
          updated_at?: string
          witnessed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decedent_releases_decedent_id_fkey"
            columns: ["decedent_id"]
            isOneToOne: false
            referencedRelation: "decedents"
            referencedColumns: ["id"]
          },
        ]
      }
      decedents: {
        Row: {
          check_in_at: string | null
          check_out_at: string | null
          created_at: string
          date_of_birth: string | null
          date_of_death: string | null
          dispatch_case_id: string | null
          first_name: string
          funeral_home_id: string | null
          id: string
          last_name: string
          location: string | null
          notes: string | null
          organization_id: string
          rack: string | null
          sex: string | null
          status: Database["public"]["Enums"]["decedent_status"]
          updated_at: string
          weight_lbs: number | null
        }
        Insert: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          date_of_death?: string | null
          dispatch_case_id?: string | null
          first_name: string
          funeral_home_id?: string | null
          id?: string
          last_name: string
          location?: string | null
          notes?: string | null
          organization_id: string
          rack?: string | null
          sex?: string | null
          status?: Database["public"]["Enums"]["decedent_status"]
          updated_at?: string
          weight_lbs?: number | null
        }
        Update: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          date_of_death?: string | null
          dispatch_case_id?: string | null
          first_name?: string
          funeral_home_id?: string | null
          id?: string
          last_name?: string
          location?: string | null
          notes?: string | null
          organization_id?: string
          rack?: string | null
          sex?: string | null
          status?: Database["public"]["Enums"]["decedent_status"]
          updated_at?: string
          weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "decedents_funeral_home_id_fkey"
            columns: ["funeral_home_id"]
            isOneToOne: false
            referencedRelation: "funeral_homes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decedents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          heading: number | null
          lat: number
          lng: number
          speed: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          heading?: number | null
          lat: number
          lng: number
          speed?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          heading?: number | null
          lat?: number
          lng?: number
          speed?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      facilities: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          name: string
          notes: string | null
          phone: string | null
          state: string | null
          type: Database["public"]["Enums"]["facility_type"]
          updated_at: string
          zip: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          type?: Database["public"]["Enums"]["facility_type"]
          updated_at?: string
          zip?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          type?: Database["public"]["Enums"]["facility_type"]
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      funeral_homes: {
        Row: {
          active: boolean
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funeral_homes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          approved: boolean
          created_at: string
          crm_role: Database["public"]["Enums"]["crm_role"]
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          crm_role?: Database["public"]["Enums"]["crm_role"]
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          crm_role?: Database["public"]["Enums"]["crm_role"]
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          created_at: string
          current_vehicle_id: string | null
          full_name: string | null
          id: string
          on_duty: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          current_vehicle_id?: string | null
          full_name?: string | null
          id: string
          on_duty?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          created_at?: string
          current_vehicle_id?: string | null
          full_name?: string | null
          id?: string
          on_duty?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_vehicle_fk"
            columns: ["current_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
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
      vehicles: {
        Row: {
          active: boolean
          capacity: number | null
          created_at: string
          id: string
          license_plate: string | null
          make: string | null
          model: string | null
          name: string
          notes: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          active?: boolean
          capacity?: number | null
          created_at?: string
          id?: string
          license_plate?: string | null
          make?: string | null
          model?: string | null
          name: string
          notes?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          active?: boolean
          capacity?: number | null
          created_at?: string
          id?: string
          license_plate?: string | null
          make?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_crm_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["crm_role"]
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_case_driver: {
        Args: { _case_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_member: { Args: { _org_id: string }; Returns: boolean }
      list_cremation_logs: {
        Args: {
          p_dir?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_retort?: string
          p_scope?: string
          p_search?: string
          p_sort?: string
          p_to?: string
        }
        Returns: {
          ash_weight_lbs: number
          comment: string
          container_type: string
          created_at: string
          decedent_first_name: string
          decedent_id: string
          decedent_last_name: string
          decedent_status: string
          end_time: string
          id: string
          operator_id: string
          operator_name: string
          organization_id: string
          retort: string
          start_time: string
          total_count: number
          updated_at: string
          weight_lbs: number
        }[]
      }
    }
    Enums: {
      admin_audit_action:
        | "user_created"
        | "user_disabled"
        | "user_enabled"
        | "user_deleted"
        | "role_changed"
        | "password_reset"
        | "user_approved"
        | "user_unapproved"
      app_role: "admin" | "dispatcher" | "driver" | "viewer"
      case_event_type:
        | "created"
        | "assigned"
        | "status_changed"
        | "note_added"
        | "document_added"
        | "reassigned"
        | "cancelled"
        | "signature_captured"
      case_status:
        | "new"
        | "assigned"
        | "en_route_pickup"
        | "on_scene"
        | "in_custody"
        | "en_route_dropoff"
        | "delivered"
        | "closed"
        | "cancelled"
      crm_role: "crm_admin" | "crm_user" | "crm_viewer"
      decedent_event_type:
        | "created"
        | "status_changed"
        | "note"
        | "document"
        | "workflow"
      decedent_status:
        | "checked_in"
        | "prepped"
        | "cremated"
        | "released"
        | "checked_out"
      document_type:
        | "release_form"
        | "body_tag"
        | "id_photo"
        | "signature"
        | "other"
      facility_type:
        | "hospital"
        | "residence"
        | "medical_examiner"
        | "nursing_home"
        | "hospice"
        | "funeral_home"
        | "crematory"
        | "embalmer"
        | "other"
      signature_type:
        | "pickup_released"
        | "driver_received"
        | "driver_delivered"
        | "dropoff_received"
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
      admin_audit_action: [
        "user_created",
        "user_disabled",
        "user_enabled",
        "user_deleted",
        "role_changed",
        "password_reset",
        "user_approved",
        "user_unapproved",
      ],
      app_role: ["admin", "dispatcher", "driver", "viewer"],
      case_event_type: [
        "created",
        "assigned",
        "status_changed",
        "note_added",
        "document_added",
        "reassigned",
        "cancelled",
        "signature_captured",
      ],
      case_status: [
        "new",
        "assigned",
        "en_route_pickup",
        "on_scene",
        "in_custody",
        "en_route_dropoff",
        "delivered",
        "closed",
        "cancelled",
      ],
      crm_role: ["crm_admin", "crm_user", "crm_viewer"],
      decedent_event_type: [
        "created",
        "status_changed",
        "note",
        "document",
        "workflow",
      ],
      decedent_status: [
        "checked_in",
        "prepped",
        "cremated",
        "released",
        "checked_out",
      ],
      document_type: [
        "release_form",
        "body_tag",
        "id_photo",
        "signature",
        "other",
      ],
      facility_type: [
        "hospital",
        "residence",
        "medical_examiner",
        "nursing_home",
        "hospice",
        "funeral_home",
        "crematory",
        "embalmer",
        "other",
      ],
      signature_type: [
        "pickup_released",
        "driver_received",
        "driver_delivered",
        "dropoff_received",
      ],
    },
  },
} as const
