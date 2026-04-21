export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  id_number: string;
  date_of_birth: string;
  shiur: string;
  equivalent_year: string;
  phone: string;
  email: string;
  status: 'active' | 'inactive' | 'graduated' | 'chizuk';
  admission_date: string;
  notes: string;
  machzor_id: string | null;
  family_id: string | null;
  photo_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Machzor {
  id: string;
  name: string;
  number: number;
  start_year: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Family {
  id: string;
  family_name: string;
  father_name: string;
  father_id_number: string;
  father_phone: string;
  father_occupation: string;
  father_email: string;
  mother_name: string;
  mother_id_number: string;
  mother_phone: string;
  mother_occupation: string;
  mother_email: string;
  address: string;
  city: string;
  postal_code: string;
  home_phone: string;
  bank_name: string;
  bank_branch: string;
  bank_account: string;
  billing_notes: string;
  created_at: string;
  updated_at: string;
}

export interface EducationHistory {
  id: string;
  student_id: string;
  institution_name: string;
  institution_type: 'elementary' | 'yeshiva_ketana' | 'other';
  city: string;
  start_year: number | null;
  end_year: number | null;
  class_completed: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Donation {
  id: string;
  student_id: string;
  amount: number;
  currency: string;
  donation_date: string;
  commitment_date: string;
  status: 'committed' | 'collected' | 'pending' | 'cancelled';
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  room_number: string;
  building: string;
  wing: string;
  floor: number;
  capacity: number;
  current_occupants: number;
  status: 'available' | 'occupied' | 'maintenance';
  created_at: string;
  updated_at: string;
}

export interface RoomAssignment {
  id: string;
  room_id: string;
  student_id: string;
  assignment_date: string;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  department: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface TuitionCharge {
  id: string;
  family_id: string;
  student_ids: string[];
  total_amount_per_month: number;
  amount_breakdown: Record<string, number>; // {student_id: amount}
  payment_method: 'standing_order' | 'check' | 'credit' | 'office' | 'exempt';
  scheduled_day_of_month: number | null;
  status: 'active' | 'suspended' | 'cancelled';
  start_date: string;
  end_date: string | null;
  notes: string;
  external_charge_id?: string | null;
  external_provider?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TuitionPayment {
  id: string;
  family_id: string;
  tuition_charge_id: string;
  payment_month: string; // YYYY-MM
  scheduled_date: string;
  total_amount: number;
  amount_breakdown: Record<string, number>; // {student_id: amount}
  status: 'scheduled' | 'collected' | 'failed' | 'partial';
  payment_method: 'standing_order' | 'check' | 'credit' | 'office' | 'exempt';
  payment_details: {
    check_number?: string;
    deposit_date?: string;
    bank_response_code?: string;
    transaction_id?: string;
    aashrai_transaction_id?: string;
    collected_by?: string;
    document_ref?: string;
  } | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_students: number;
  active_students: number;
  total_donations_committed: number;
  total_donations_collected: number;
  rooms_occupied: number;
  total_rooms: number;
  staff_count: number;
}
