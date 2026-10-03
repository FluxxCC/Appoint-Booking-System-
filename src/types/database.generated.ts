// Generated from migrations by scripts/generate-foundation-types.mjs. Do not edit.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type Database = { public: { Tables: {
  announcements: {
    Row: {
      id: string;
      title: string;
      body: string;
      published: boolean;
      starts_at: string;
      ends_at: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      title: string;
      body: string;
      published?: boolean;
      starts_at?: string;
      ends_at?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      title?: string;
      body?: string;
      published?: boolean;
      starts_at?: string;
      ends_at?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  appointment_events: {
    Row: {
      id: string;
      appointment_id: string;
      from_state: Database["public"]["Enums"]["appointment_state"] | null;
      to_state: Database["public"]["Enums"]["appointment_state"];
      actor_id: string | null;
      reason: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      appointment_id: string;
      from_state?: Database["public"]["Enums"]["appointment_state"] | null;
      to_state: Database["public"]["Enums"]["appointment_state"];
      actor_id?: string | null;
      reason?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      appointment_id?: string;
      from_state?: Database["public"]["Enums"]["appointment_state"] | null;
      to_state?: Database["public"]["Enums"]["appointment_state"];
      actor_id?: string | null;
      reason?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  appointment_items: {
    Row: {
      id: string;
      appointment_id: string;
      service_id: string;
      service_name_snapshot: string;
      price_amount: number;
      duration_minutes: number;
      buffer_before_minutes: number;
      buffer_after_minutes: number;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      appointment_id: string;
      service_id: string;
      service_name_snapshot: string;
      price_amount: number;
      duration_minutes: number;
      buffer_before_minutes: number;
      buffer_after_minutes: number;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      appointment_id?: string;
      service_id?: string;
      service_name_snapshot?: string;
      price_amount?: number;
      duration_minutes?: number;
      buffer_before_minutes?: number;
      buffer_after_minutes?: number;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  appointment_notes: {
    Row: {
      id: string;
      appointment_id: string;
      author_id: string;
      visibility: Database["public"]["Enums"]["note_visibility"];
      body: string;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      appointment_id: string;
      author_id: string;
      visibility?: Database["public"]["Enums"]["note_visibility"];
      body: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      appointment_id?: string;
      author_id?: string;
      visibility?: Database["public"]["Enums"]["note_visibility"];
      body?: string;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  appointments: {
    Row: {
      id: string;
      customer_id: string;
      staff_id: string;
      policy_version_id: string;
      request_key: string;
      state: Database["public"]["Enums"]["appointment_state"];
      starts_at: string;
      ends_at: string;
      buffer_before_minutes: number;
      buffer_after_minutes: number;
      occupied_range: string;
      currency: string;
      total_amount: number;
      payment_mode_snapshot: Database["public"]["Enums"]["payment_mode"];
      required_payment_amount: number;
      accepted_by: string | null;
      accepted_at: string | null;
      declined_by: string | null;
      declined_at: string | null;
      decline_reason: string | null;
      payment_due_at: string | null;
      payment_expired_at: string | null;
      cancelled_at: string | null;
      cancellation_reason: string | null;
      created_at: string;
      updated_at: string;
      acceptance_source: string;
      public_reference: string;
    };
    Insert: {
      id?: string;
      customer_id: string;
      staff_id: string;
      policy_version_id: string;
      request_key: string;
      state?: Database["public"]["Enums"]["appointment_state"];
      starts_at: string;
      ends_at: string;
      buffer_before_minutes?: number;
      buffer_after_minutes?: number;
      occupied_range: string;
      currency: string;
      total_amount: number;
      payment_mode_snapshot: Database["public"]["Enums"]["payment_mode"];
      required_payment_amount: number;
      accepted_by?: string | null;
      accepted_at?: string | null;
      declined_by?: string | null;
      declined_at?: string | null;
      decline_reason?: string | null;
      payment_due_at?: string | null;
      payment_expired_at?: string | null;
      cancelled_at?: string | null;
      cancellation_reason?: string | null;
      created_at?: string;
      updated_at?: string;
      acceptance_source?: string;
      public_reference?: string;
    };
    Update: {
      id?: string;
      customer_id?: string;
      staff_id?: string;
      policy_version_id?: string;
      request_key?: string;
      state?: Database["public"]["Enums"]["appointment_state"];
      starts_at?: string;
      ends_at?: string;
      buffer_before_minutes?: number;
      buffer_after_minutes?: number;
      occupied_range?: string;
      currency?: string;
      total_amount?: number;
      payment_mode_snapshot?: Database["public"]["Enums"]["payment_mode"];
      required_payment_amount?: number;
      accepted_by?: string | null;
      accepted_at?: string | null;
      declined_by?: string | null;
      declined_at?: string | null;
      decline_reason?: string | null;
      payment_due_at?: string | null;
      payment_expired_at?: string | null;
      cancelled_at?: string | null;
      cancellation_reason?: string | null;
      created_at?: string;
      updated_at?: string;
      acceptance_source?: string;
      public_reference?: string;
    };
    Relationships: [];
  };
  audit_logs: {
    Row: {
      id: string;
      actor_id: string | null;
      action: string;
      entity_table: string;
      entity_id: string | null;
      details: Json;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      actor_id?: string | null;
      action: string;
      entity_table: string;
      entity_id?: string | null;
      details?: Json;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      actor_id?: string | null;
      action?: string;
      entity_table?: string;
      entity_id?: string | null;
      details?: Json;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  booking_policy_versions: {
    Row: {
      id: string;
      version: number;
      payment_window_minutes: number;
      minimum_notice_minutes: number;
      maximum_advance_days: number;
      cancellation_notice_minutes: number;
      no_show_grace_minutes: number;
      terms: string;
      published: boolean;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      version: number;
      payment_window_minutes?: number;
      minimum_notice_minutes?: number;
      maximum_advance_days?: number;
      cancellation_notice_minutes?: number;
      no_show_grace_minutes?: number;
      terms: string;
      published?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      version?: number;
      payment_window_minutes?: number;
      minimum_notice_minutes?: number;
      maximum_advance_days?: number;
      cancellation_notice_minutes?: number;
      no_show_grace_minutes?: number;
      terms?: string;
      published?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  business_closures: {
    Row: {
      id: string;
      starts_at: string;
      ends_at: string;
      public_reason: string;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      starts_at: string;
      ends_at: string;
      public_reason: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      starts_at?: string;
      ends_at?: string;
      public_reason?: string;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  business_hours: {
    Row: {
      id: string;
      weekday: number;
      opens_at: string;
      closes_at: string;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      weekday: number;
      opens_at: string;
      closes_at: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      weekday?: number;
      opens_at?: string;
      closes_at?: string;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  business_settings: {
    Row: {
      id: string;
      singleton: boolean;
      name: string;
      timezone: string;
      currency: string;
      contact_email: string | null;
      contact_phone: string | null;
      address: string | null;
      published: boolean;
      created_at: string;
      updated_at: string;
      description: string;
      scheduling_interval_minutes: number;
      default_buffer_minutes: number;
      require_staff_approval: boolean;
      guest_booking_enabled: boolean;
      customer_registration_enabled: boolean;
      booking_approval_mode: string;
    };
    Insert: {
      id?: string;
      singleton?: boolean;
      name: string;
      timezone?: string;
      currency?: string;
      contact_email?: string | null;
      contact_phone?: string | null;
      address?: string | null;
      published?: boolean;
      created_at?: string;
      updated_at?: string;
      description?: string;
      scheduling_interval_minutes?: number;
      default_buffer_minutes?: number;
      require_staff_approval?: boolean;
      guest_booking_enabled?: boolean;
      customer_registration_enabled?: boolean;
      booking_approval_mode?: string;
    };
    Update: {
      id?: string;
      singleton?: boolean;
      name?: string;
      timezone?: string;
      currency?: string;
      contact_email?: string | null;
      contact_phone?: string | null;
      address?: string | null;
      published?: boolean;
      created_at?: string;
      updated_at?: string;
      description?: string;
      scheduling_interval_minutes?: number;
      default_buffer_minutes?: number;
      require_staff_approval?: boolean;
      guest_booking_enabled?: boolean;
      customer_registration_enabled?: boolean;
      booking_approval_mode?: string;
    };
    Relationships: [];
  };
  customers: {
    Row: {
      id: string;
      auth_user_id: string | null;
      display_name: string;
      email: string | null;
      phone: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      auth_user_id?: string | null;
      display_name: string;
      email?: string | null;
      phone?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      auth_user_id?: string | null;
      display_name?: string;
      email?: string | null;
      phone?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  guest_access_tokens: {
    Row: {
      id: string;
      appointment_id: string;
      token_hash: string;
      scope: string;
      expires_at: string;
      consumed_at: string | null;
      revoked_at: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      appointment_id: string;
      token_hash: string;
      scope: string;
      expires_at: string;
      consumed_at?: string | null;
      revoked_at?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      appointment_id?: string;
      token_hash?: string;
      scope?: string;
      expires_at?: string;
      consumed_at?: string | null;
      revoked_at?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  notification_outbox: {
    Row: {
      id: string;
      appointment_id: string | null;
      kind: string;
      deduplication_key: string;
      payload: Json;
      state: Database["public"]["Enums"]["job_state"];
      attempts: number;
      available_at: string;
      locked_until: string | null;
      last_error: string | null;
      delivered_at: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      appointment_id?: string | null;
      kind: string;
      deduplication_key: string;
      payload?: Json;
      state?: Database["public"]["Enums"]["job_state"];
      attempts?: number;
      available_at?: string;
      locked_until?: string | null;
      last_error?: string | null;
      delivered_at?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      appointment_id?: string | null;
      kind?: string;
      deduplication_key?: string;
      payload?: Json;
      state?: Database["public"]["Enums"]["job_state"];
      attempts?: number;
      available_at?: string;
      locked_until?: string | null;
      last_error?: string | null;
      delivered_at?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  payment_events: {
    Row: {
      id: string;
      provider: string;
      provider_event_id: string;
      payment_id: string | null;
      payload: Json;
      processed_at: string | null;
      error: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      provider: string;
      provider_event_id: string;
      payment_id?: string | null;
      payload?: Json;
      processed_at?: string | null;
      error?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      provider?: string;
      provider_event_id?: string;
      payment_id?: string | null;
      payload?: Json;
      processed_at?: string | null;
      error?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  payments: {
    Row: {
      id: string;
      appointment_id: string;
      provider: string;
      provider_reference: string | null;
      idempotency_key: string;
      amount: number;
      currency: string;
      state: Database["public"]["Enums"]["payment_state"];
      paid_at: string | null;
      verified_at: string | null;
      exception_reason: string | null;
      created_at: string;
      updated_at: string;
      checkout_url: string | null;
    };
    Insert: {
      id?: string;
      appointment_id: string;
      provider: string;
      provider_reference?: string | null;
      idempotency_key: string;
      amount: number;
      currency: string;
      state?: Database["public"]["Enums"]["payment_state"];
      paid_at?: string | null;
      verified_at?: string | null;
      exception_reason?: string | null;
      created_at?: string;
      updated_at?: string;
      checkout_url?: string | null;
    };
    Update: {
      id?: string;
      appointment_id?: string;
      provider?: string;
      provider_reference?: string | null;
      idempotency_key?: string;
      amount?: number;
      currency?: string;
      state?: Database["public"]["Enums"]["payment_state"];
      paid_at?: string | null;
      verified_at?: string | null;
      exception_reason?: string | null;
      created_at?: string;
      updated_at?: string;
      checkout_url?: string | null;
    };
    Relationships: [];
  };
  profiles: {
    Row: {
      id: string;
      auth_user_id: string;
      display_name: string;
      avatar_path: string | null;
      disabled_at: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      auth_user_id: string;
      display_name: string;
      avatar_path?: string | null;
      disabled_at?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      auth_user_id?: string;
      display_name?: string;
      avatar_path?: string | null;
      disabled_at?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  refunds: {
    Row: {
      id: string;
      payment_id: string;
      amount: number;
      state: Database["public"]["Enums"]["refund_state"];
      provider_reference: string | null;
      idempotency_key: string;
      reason: string;
      processed_at: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      payment_id: string;
      amount: number;
      state?: Database["public"]["Enums"]["refund_state"];
      provider_reference?: string | null;
      idempotency_key: string;
      reason: string;
      processed_at?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      payment_id?: string;
      amount?: number;
      state?: Database["public"]["Enums"]["refund_state"];
      provider_reference?: string | null;
      idempotency_key?: string;
      reason?: string;
      processed_at?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  service_categories: {
    Row: {
      id: string;
      name: string;
      slug: string;
      sort_order: number;
      published: boolean;
      created_at: string;
      updated_at: string;
      active: boolean;
    };
    Insert: {
      id?: string;
      name: string;
      slug: string;
      sort_order?: number;
      published?: boolean;
      created_at?: string;
      updated_at?: string;
      active?: boolean;
    };
    Update: {
      id?: string;
      name?: string;
      slug?: string;
      sort_order?: number;
      published?: boolean;
      created_at?: string;
      updated_at?: string;
      active?: boolean;
    };
    Relationships: [];
  };
  services: {
    Row: {
      id: string;
      category_id: string | null;
      name: string;
      slug: string;
      description: string | null;
      price_amount: number;
      duration_minutes: number;
      buffer_before_minutes: number;
      buffer_after_minutes: number;
      payment_mode: Database["public"]["Enums"]["payment_mode"];
      deposit_amount: number;
      active: boolean;
      published: boolean;
      created_at: string;
      updated_at: string;
      image_path: string | null;
      deposit_type: string;
      deposit_percent_bps: number | null;
    };
    Insert: {
      id?: string;
      category_id?: string | null;
      name: string;
      slug: string;
      description?: string | null;
      price_amount: number;
      duration_minutes: number;
      buffer_before_minutes?: number;
      buffer_after_minutes?: number;
      payment_mode?: Database["public"]["Enums"]["payment_mode"];
      deposit_amount?: number;
      active?: boolean;
      published?: boolean;
      created_at?: string;
      updated_at?: string;
      image_path?: string | null;
      deposit_type?: string;
      deposit_percent_bps?: number | null;
    };
    Update: {
      id?: string;
      category_id?: string | null;
      name?: string;
      slug?: string;
      description?: string | null;
      price_amount?: number;
      duration_minutes?: number;
      buffer_before_minutes?: number;
      buffer_after_minutes?: number;
      payment_mode?: Database["public"]["Enums"]["payment_mode"];
      deposit_amount?: number;
      active?: boolean;
      published?: boolean;
      created_at?: string;
      updated_at?: string;
      image_path?: string | null;
      deposit_type?: string;
      deposit_percent_bps?: number | null;
    };
    Relationships: [];
  };
  staff: {
    Row: {
      id: string;
      auth_user_id: string | null;
      display_name: string;
      slug: string;
      bio: string | null;
      photo_path: string | null;
      active: boolean;
      published: boolean;
      bookable: boolean;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      auth_user_id?: string | null;
      display_name: string;
      slug: string;
      bio?: string | null;
      photo_path?: string | null;
      active?: boolean;
      published?: boolean;
      bookable?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      auth_user_id?: string | null;
      display_name?: string;
      slug?: string;
      bio?: string | null;
      photo_path?: string | null;
      active?: boolean;
      published?: boolean;
      bookable?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  staff_schedule_exceptions: {
    Row: {
      id: string;
      staff_id: string;
      kind: Database["public"]["Enums"]["schedule_exception_kind"];
      starts_at: string;
      ends_at: string;
      reason: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      staff_id: string;
      kind: Database["public"]["Enums"]["schedule_exception_kind"];
      starts_at: string;
      ends_at: string;
      reason?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      staff_id?: string;
      kind?: Database["public"]["Enums"]["schedule_exception_kind"];
      starts_at?: string;
      ends_at?: string;
      reason?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  staff_services: {
    Row: {
      id: string;
      staff_id: string;
      service_id: string;
      active: boolean;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      staff_id: string;
      service_id: string;
      active?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      staff_id?: string;
      service_id?: string;
      active?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  staff_working_hours: {
    Row: {
      id: string;
      staff_id: string;
      weekday: number;
      starts_at: string;
      ends_at: string;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      staff_id: string;
      weekday: number;
      starts_at: string;
      ends_at: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      staff_id?: string;
      weekday?: number;
      starts_at?: string;
      ends_at?: string;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  user_roles: {
    Row: {
      id: string;
      auth_user_id: string;
      role: Database["public"]["Enums"]["app_role"];
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      auth_user_id: string;
      role: Database["public"]["Enums"]["app_role"];
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      auth_user_id?: string;
      role?: Database["public"]["Enums"]["app_role"];
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  website_settings: {
    Row: {
      id: string;
      singleton: boolean;
      logo_path: string | null;
      hero_image_path: string | null;
      primary_color: string;
      font_key: string;
      sections: Json;
      published: boolean;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      singleton?: boolean;
      logo_path?: string | null;
      hero_image_path?: string | null;
      primary_color?: string;
      font_key?: string;
      sections?: Json;
      published?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      singleton?: boolean;
      logo_path?: string | null;
      hero_image_path?: string | null;
      primary_color?: string;
      font_key?: string;
      sections?: Json;
      published?: boolean;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
}; Views: { [_ in never]: never }; Functions: {
expire_due_payments: { Args: {  }; Returns: number };
record_verified_payment: { Args: { p_payment: string | null; p_event_id: string | null; p_paid_at: string | null }; Returns: string };
request_appointment: { Args: { p_customer: string | null; p_staff: string | null; p_service: string | null; p_start: string | null; p_request_key: string | null }; Returns: string };
accept_appointment: { Args: { p_appointment: string | null }; Returns: Database["public"]["Enums"]["appointment_state"] };
transition_appointment: { Args: { p_appointment: string | null; p_target: Database["public"]["Enums"]["appointment_state"] | null; p_reason?: string | null }; Returns: undefined };
get_access_context: { Args: {  }; Returns: Json };
complete_customer_profile: { Args: { p_name: string | null; p_phone?: string | null }; Returns: string };
link_staff_account: { Args: { p_user: string | null; p_name: string | null; p_slug: string | null }; Returns: string };
admin_availability_for_date: { Args: { p_service: string | null; p_date: string | null; p_staff?: string | null }; Returns: Json };
bootstrap_initial_owner: { Args: { p_user: string | null; p_email: string | null }; Returns: undefined };
admin_save_hours: { Args: { p_intervals: Json | null }; Returns: undefined };
admin_local_instant: { Args: { p_local: string | null }; Returns: string };
admin_save_settings: { Args: { p_values: Json | null }; Returns: undefined };
admin_save_closure: { Args: { p_date: string | null; p_full_day: boolean | null; p_start: string | null; p_end: string | null; p_reason: string | null }; Returns: undefined };
admin_save_announcement: { Args: { p_id: string | null; p_title: string | null; p_body: string | null; p_published: boolean | null; p_start: string | null; p_end: string | null }; Returns: undefined };
admin_data: { Args: { p_section: string | null; p_id?: string | null; p_date?: string | null; p_status?: string | null; p_query?: string | null; p_page?: number | null }; Returns: Json };
registration_enabled: { Args: {  }; Returns: boolean };
public_website_data: { Args: {  }; Returns: Json };
catalog_set_image: { Args: { p_kind: string | null; p_id: string | null; p_path: string | null; p_expected: string | null }; Returns: undefined };
availability_for_date: { Args: { p_service: string | null; p_date: string | null; p_staff?: string | null }; Returns: Json };
catalog_save_category: { Args: { p_id: string | null; p_values: Json | null }; Returns: string };
catalog_save_service: { Args: { p_id: string | null; p_values: Json | null; p_currency: string | null }; Returns: string };
catalog_save_staff: { Args: { p_id: string | null; p_values: Json | null }; Returns: string };
catalog_assign_services: { Args: { p_staff: string | null; p_services: Json | null }; Returns: undefined };
catalog_save_staff_hours: { Args: { p_staff: string | null; p_intervals: Json | null }; Returns: undefined };
catalog_save_exception: { Args: { p_staff: string | null; p_kind: Database["public"]["Enums"]["schedule_exception_kind"] | null; p_start: string | null; p_end: string | null; p_reason: string | null }; Returns: undefined };
catalog_data: { Args: { p_kind: string | null; p_id?: string | null; p_query?: string | null; p_category?: string | null; p_active?: string | null; p_page?: number | null }; Returns: Json };
my_staff_workspace: { Args: {  }; Returns: Json };
public_catalog: { Args: {  }; Returns: Json };
public_booking_submit: { Args: { p_service: string | null; p_staff: string | null; p_start: string | null; p_request_key: string | null; p_name: string | null; p_email: string | null; p_phone: string | null }; Returns: Json };
server_public_booking_submit: { Args: { p_service: string | null; p_staff: string | null; p_start: string | null; p_request_key: string | null; p_name: string | null; p_email: string | null; p_phone: string | null; p_auth_user: string | null }; Returns: Json };
owner_staff_access: { Args: {  }; Returns: Json };
set_booking_approval_mode: { Args: { p_mode: string | null }; Returns: string };
manage_owner_admins: { Args: { p_action: string | null; p_user?: string | null; p_email?: string | null }; Returns: Json };
server_availability_for_date: { Args: { p_service: string | null; p_date: string | null; p_staff: string | null; p_auth_user: string | null }; Returns: Json };
guest_appointment_by_token: { Args: { p_token_hash: string | null; p_appointment: string | null }; Returns: Json };
enable_staff_login: { Args: { p_staff: string | null; p_email: string | null }; Returns: undefined };
disable_staff_login: { Args: { p_staff: string | null }; Returns: undefined };
manage_admin_access_by_email: { Args: { p_action: string | null; p_email: string | null }; Returns: Json };
prepare_payment_attempt: { Args: { p_appointment: string | null; p_auth_user: string | null; p_guest_token_hash: string | null; p_provider: string | null; p_idempotency_key: string | null }; Returns: Json };
issue_guest_access_link: { Args: { p_email: string | null; p_reference?: string | null; p_appointment?: string | null }; Returns: Json };
exchange_guest_access_link: { Args: { p_token_hash: string | null }; Returns: Json };
attach_payment_checkout: { Args: { p_payment: string | null; p_reference: string | null; p_checkout_url: string | null }; Returns: Json };
claim_notification_outbox: { Args: { p_limit?: number | null }; Returns: string };
finish_notification_outbox: { Args: { p_id: string | null; p_success: boolean | null; p_retryable?: boolean | null; p_error_code?: string | null }; Returns: boolean };
}; Enums: {
app_role: "OWNER" | "ADMIN" | "STAFF";
appointment_state: "PENDING" | "DECLINED" | "ACCEPTED" | "AWAITING_PAYMENT" | "PAYMENT_EXPIRED" | "CONFIRMED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
job_state: "PENDING" | "PROCESSING" | "DELIVERED" | "FAILED";
note_visibility: "INTERNAL" | "CUSTOMER";
payment_mode: "PAY_AT_BUSINESS" | "DEPOSIT" | "FULL_PAYMENT";
payment_state: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
refund_state: "PENDING" | "SUCCEEDED" | "FAILED";
schedule_exception_kind: "UNAVAILABLE" | "EXTRA_HOURS";
}; CompositeTypes: { [_ in never]: never }; }; };
