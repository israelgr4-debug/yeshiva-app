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
  address: string;
  city: string;
  postal_code: string;
  father_name: string;
  mother_name: string;
  status: 'active' | 'inactive' | 'graduated';
  admission_date: string;
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

export interface DashboardStats {
  total_students: number;
  active_students: number;
  total_donations_committed: number;
  total_donations_collected: number;
  rooms_occupied: number;
  total_rooms: number;
  staff_count: number;
}
