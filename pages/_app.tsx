import type { AppProps } from 'next/app'
import Head from 'next/head'
import '@/styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='%23F59E0B'/><text x='50' y='73' text-anchor='middle' font-weight='900' font-size='52' fill='%230F172A'>GP</text></svg>" />
      </Head>
      <Component {...pageProps} />
    </>
  )
}
