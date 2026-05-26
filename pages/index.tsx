import { GetServerSideProps } from 'next'
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center py-20">
        <div className="mb-6 text-6xl">📚</div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Chapter <span className="text-amber-500">Grade Portal</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-xl mb-10">
          The secure platform for fraternity grade submissions. Submit your Blackboard screenshot,
          track deadlines, and help your VP of Academics keep the chapter accountable.
        </p>
        <div className="flex gap-4">
          <Link href="/auth/signup" className="btn-primary text-base px-6 py-3">
            Sign Up
          </Link>
          <Link href="/auth/login" className="btn-secondary text-base px-6 py-3">
            Log In
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto w-full px-4 pb-20 grid md:grid-cols-3 gap-6">
        {[
          { icon: '📷', title: 'Easy Submission', desc: 'Upload a screenshot of your Blackboard grades. OCR reads your grade automatically.' },
          { icon: '📊', title: 'GPA Tracking', desc: 'Your GPA is calculated and tracked every semester. The chapter stays accountable.' },
          { icon: '📥', title: 'Excel Reports', desc: 'The VP gets a beautifully formatted Excel report with every member on their own sheet.' },
        ].map(f => (
          <div key={f.title} className="card text-center">
            <div className="text-4xl mb-3">{f.icon}</div>
            <h3 className="font-bold text-white text-lg mb-2">{f.title}</h3>
            <p className="text-slate-400 text-sm">{f.desc}</p>
          </div>
        ))}
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
