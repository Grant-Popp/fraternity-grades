export type Profile = {
  id: string
  full_name: string
  email: string
  class_year: 'Freshman' | 'Sophomore' | 'Junior' | 'Senior'
  major: string | null
  role: 'member' | 'admin'
  created_at: string
}

export type Semester = {
  id: string
  name: string
  deadline: string
  is_active: boolean
  required_years: string[]
  created_at: string
}

export type Submission = {
  id: string
  member_id: string
  semester_id: string
  photo_url: string | null
  no_grade: boolean
  ocr_raw_text: string | null
  ocr_gpa: number | null
  admin_gpa: number | null
  final_gpa: number | null
  status: 'pending' | 'reviewed' | 'no_grade'
  photo_phash: string | null
  duplicate_flag: boolean
  admin_notes: string | null
  submitted_at: string
  reviewed_at: string | null
  profiles?: Profile
  semesters?: Semester
}

export type EmailLog = {
  id: string
  semester_id: string
  member_id: string
  sent_at: string
  type: 'reminder' | 'deadline_warning' | 'confirmation'
}

// Supabase generic type — simple pass-through so createPagesBrowserClient is happy
export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at'>; Update: Partial<Profile> }
      semesters: { Row: Semester; Insert: Omit<Semester, 'id' | 'created_at'>; Update: Partial<Semester> }
      submissions: { Row: Submission; Insert: Omit<Submission, 'id' | 'submitted_at'>; Update: Partial<Submission> }
      email_logs: { Row: EmailLog; Insert: Omit<EmailLog, 'id' | 'sent_at'>; Update: Partial<EmailLog> }
    }
  }
}
