# Yeshiva Management System - Database Schema

## Required Supabase Tables

Create these tables in your Supabase project:

### 1. students
```sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  id_number TEXT UNIQUE NOT NULL,
  date_of_birth DATE,
  shiur TEXT,
  equivalent_year TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  father_name TEXT,
  mother_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'graduated')),
  admission_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### 2. donations
```sql
CREATE TABLE donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2),
  currency TEXT DEFAULT 'ILS',
  donation_date DATE,
  commitment_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('committed', 'collected', 'pending', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### 3. rooms
```sql
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number TEXT NOT NULL,
  building TEXT NOT NULL,
  wing TEXT NOT NULL,
  floor INTEGER,
  capacity INTEGER DEFAULT 1,
  current_occupants INTEGER DEFAULT 0,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'maintenance')),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE (building, wing, room_number)
);
```

### 4. room_assignments
```sql
CREATE TABLE room_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  assignment_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### 5. staff
```sql
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  position TEXT,
  department TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

## Indexes

Create these indexes for better performance:

```sql
-- Students
CREATE INDEX idx_students_status ON students(status);
CREATE INDEX idx_students_shiur ON students(shiur);
CREATE INDEX idx_students_id_number ON students(id_number);

-- Donations
CREATE INDEX idx_donations_student_id ON donations(student_id);
CREATE INDEX idx_donations_status ON donations(status);
CREATE INDEX idx_donations_date ON donations(donation_date);

-- Rooms
CREATE INDEX idx_rooms_building_wing ON rooms(building, wing);
CREATE INDEX idx_rooms_status ON rooms(status);

-- Room Assignments
CREATE INDEX idx_room_assignments_room_id ON room_assignments(room_id);
CREATE INDEX idx_room_assignments_student_id ON room_assignments(student_id);
```

## RLS (Row Level Security) Policies

For development, you can disable RLS on all tables. For production, implement proper authorization:

```sql
-- Example: Allow all reads for authenticated users
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_read_students" ON students
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "allow_write_students" ON students
  FOR INSERT, UPDATE, DELETE
  TO authenticated
  USING (true);
```

## Sample Data

You can insert sample data for testing:

```sql
-- Sample students
INSERT INTO students (first_name, last_name, id_number, shiur, status) VALUES
  ('משה', 'כהן', '123456789', 'בחורים א', 'active'),
  ('יוסף', 'לוי', '987654321', 'בחורים ב', 'active'),
  ('דוד', 'ברק', '555555555', 'משכילים א', 'active');

-- Sample rooms
INSERT INTO rooms (room_number, building, wing, floor, capacity) VALUES
  ('101', 'א', '1', 1, 2),
  ('102', 'א', '1', 1, 2),
  ('201', 'א', '1', 2, 2),
  ('301', 'ב', '2', 3, 1);

-- Sample donations
INSERT INTO donations (student_id, amount, status, donation_date)
SELECT id, 5000, 'committed', NOW()::DATE FROM students LIMIT 1;
```

## Data Relationships

```
students
  ├── donations (1-to-many)
  └── room_assignments (1-to-many)
        └── rooms

rooms
  └── room_assignments (1-to-many)
        └── students

staff (independent)
```

## Notes

1. All table names and columns should use snake_case
2. All IDs are UUIDs for better security
3. Dates are stored in ISO 8601 format (YYYY-MM-DD)
4. Soft deletes are not implemented; deleted records are removed
5. Set up automatic `updated_at` triggers if needed
