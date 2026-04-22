-- Task system: todos with reminders and user assignment.

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date DATE,
  reminder_date DATE,
  assigned_to UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  -- Optional link to a related entity (student, family, payment, etc.)
  related_entity_type TEXT,
  related_entity_id UUID,
  completed_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_reminder ON tasks(reminder_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tasks_related ON tasks(related_entity_type, related_entity_id);

-- Auto-update updated_at
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: anyone authenticated can view & modify (can tighten later)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_all" ON tasks FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON tasks TO authenticated, anon;
