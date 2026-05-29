import { GetServerSideProps } from 'next'
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="text-center max-w-xl">
        <div className="mb-6 text-7xl">📚</div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Chapter <span className="text-amber-500">Grade Portal</span>
        </h1>
        <p className="text-slate-400 text-lg mb-10">
          The secure platform for fraternity grade submissions. Submit your Blackboard screenshot,
          track deadlines, and help your VP of Academics &amp; Scholarship keep the chapter accountable.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/auth/signup" className="btn-primary text-base px-8 py-3">
            Sign Up
          </Link>
          <Link href="/auth/login" className="btn-secondary text-base px-8 py-3">
            Log In
          </Link>
        </div>
      </div>
    </div>
  )
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const supabase = createPagesServerClient(ctx)
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    return { redirect: { destination: profile?.role === 'admin' ? '/admin' : '/dashboard', permanent: false } }
  }
  return { props: {} }
}
