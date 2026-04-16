
-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE public.app_role AS ENUM ('student', 'school_admin', 'advisor', 'employer');

CREATE TYPE public.case_status AS ENUM (
  'draft', 'missing_documents', 'in_progress', 'blocked',
  'ready_for_submission', 'submitted', 'approved', 'denied',
  'change_pending', 'completed'
);

CREATE TYPE public.requirement_severity AS ENUM ('blocker', 'warning', 'info');
CREATE TYPE public.requirement_status AS ENUM ('pending', 'met', 'not_met', 'waived');

-- ============================================
-- UTILITY FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================
-- PROFILES TABLE
-- ============================================

CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  university_name TEXT,
  degree_level TEXT,
  major TEXT,
  visa_type TEXT DEFAULT 'F-1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- USER ROLES TABLE (RBAC)
-- ============================================

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Auto-assign student role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- ============================================
-- SCHOOLS TABLE
-- ============================================

CREATE TABLE public.schools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Schools are viewable by authenticated users" ON public.schools
  FOR SELECT TO authenticated USING (true);

-- ============================================
-- SCHOOL TEMPLATES TABLE
-- ============================================

CREATE TABLE public.school_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  process_type TEXT NOT NULL DEFAULT 'CPT',
  version INTEGER NOT NULL DEFAULT 1,
  config_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.school_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates are viewable by authenticated users" ON public.school_templates
  FOR SELECT TO authenticated USING (true);

-- ============================================
-- CASES TABLE
-- ============================================

CREATE TABLE public.cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_template_id UUID REFERENCES public.school_templates(id),
  process_type TEXT NOT NULL DEFAULT 'CPT',
  status public.case_status NOT NULL DEFAULT 'draft',
  employer_name TEXT,
  role_title TEXT,
  work_location TEXT,
  start_date DATE,
  end_date DATE,
  case_summary TEXT,
  risk_level TEXT DEFAULT 'low',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cases" ON public.cases
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own cases" ON public.cases
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cases" ON public.cases
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own draft cases" ON public.cases
  FOR DELETE USING (auth.uid() = user_id AND status = 'draft');

CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cases_user_id ON public.cases(user_id);
CREATE INDEX idx_cases_status ON public.cases(status);

-- ============================================
-- DOCUMENTS TABLE
-- ============================================

CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'offer_letter',
  version_number INTEGER NOT NULL DEFAULT 1,
  upload_status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view docs of own cases" ON public.documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = documents.case_id AND cases.user_id = auth.uid())
  );
CREATE POLICY "Users can insert docs to own cases" ON public.documents
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = documents.case_id AND cases.user_id = auth.uid())
  );
CREATE POLICY "Users can update docs of own cases" ON public.documents
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = documents.case_id AND cases.user_id = auth.uid())
  );
CREATE POLICY "Users can delete docs of own cases" ON public.documents
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = documents.case_id AND cases.user_id = auth.uid())
  );

CREATE INDEX idx_documents_case_id ON public.documents(case_id);

-- ============================================
-- EXTRACTED FIELDS TABLE
-- ============================================

CREATE TABLE public.extracted_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value TEXT,
  confidence_score NUMERIC(4,2),
  manually_corrected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.extracted_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view extracted fields of own docs" ON public.extracted_fields
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.cases c ON c.id = d.case_id
      WHERE d.id = extracted_fields.document_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update extracted fields of own docs" ON public.extracted_fields
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      JOIN public.cases c ON c.id = d.case_id
      WHERE d.id = extracted_fields.document_id AND c.user_id = auth.uid()
    )
  );

-- ============================================
-- CASE REQUIREMENTS TABLE
-- ============================================

CREATE TABLE public.case_requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  requirement_key TEXT NOT NULL,
  label TEXT NOT NULL,
  severity public.requirement_severity NOT NULL DEFAULT 'blocker',
  status public.requirement_status NOT NULL DEFAULT 'pending',
  explanation TEXT,
  source TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.case_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view requirements of own cases" ON public.case_requirements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = case_requirements.case_id AND cases.user_id = auth.uid())
  );
CREATE POLICY "Users can update requirements of own cases" ON public.case_requirements
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = case_requirements.case_id AND cases.user_id = auth.uid())
  );

CREATE TRIGGER update_case_requirements_updated_at
  BEFORE UPDATE ON public.case_requirements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_case_requirements_case_id ON public.case_requirements(case_id);

-- ============================================
-- CASE TIMELINE EVENTS TABLE
-- ============================================

CREATE TABLE public.case_timeline_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.case_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view timeline of own cases" ON public.case_timeline_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = case_timeline_events.case_id AND cases.user_id = auth.uid())
  );
CREATE POLICY "Users can insert timeline events for own cases" ON public.case_timeline_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = case_timeline_events.case_id AND cases.user_id = auth.uid())
  );

CREATE INDEX idx_timeline_events_case_id ON public.case_timeline_events(case_id);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);

-- ============================================
-- AUDIT LOGS TABLE
-- ============================================

CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit logs of own cases" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = audit_logs.case_id AND cases.user_id = auth.uid())
  );
CREATE POLICY "Users can insert audit logs for own cases" ON public.audit_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.cases WHERE cases.id = audit_logs.case_id AND cases.user_id = auth.uid())
  );

CREATE INDEX idx_audit_logs_case_id ON public.audit_logs(case_id);

-- ============================================
-- CASE NOTES TABLE
-- ============================================

CREATE TABLE public.case_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notes of own cases" ON public.case_notes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert notes for own cases" ON public.case_notes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notes" ON public.case_notes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes" ON public.case_notes
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_case_notes_updated_at
  BEFORE UPDATE ON public.case_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- STORAGE BUCKET FOR CASE DOCUMENTS
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('case-documents', 'case-documents', false);

CREATE POLICY "Users can upload docs to own cases" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'case-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own case docs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'case-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own case docs" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'case-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own case docs" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'case-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
