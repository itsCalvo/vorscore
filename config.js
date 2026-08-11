// ============================================================
// VorScore Tips — Supabase connection config
// ============================================================
// 1. Create a free project at https://supabase.com
// 2. Go to Project Settings -> API
// 3. Copy your "Project URL" and "anon public" key below
// 4. Save this file — both index.html and admin.html use it
// ============================================================

const SUPABASE_URL = "https://slwghupgnpmvcsuunftt.supabase.co"; // e.g. https://abcdefgh.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsd2dodXBnbnBtdmNzdXVuZnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMzAwNDQsImV4cCI6MjEwMTcwNjA0NH0.-x0JQQyBFkctfIsNb7EQnbcWHVVRx49FAT2sJt6CxdA";

// Leave as-is — used by both pages
const supabaseClient = (SUPABASE_URL.startsWith("http"))
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
