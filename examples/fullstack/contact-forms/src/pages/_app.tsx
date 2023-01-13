import { ChakraProvider, HStack } from '@chakra-ui/react'
import { Client } from '@socialgouv/e2esdk-client'
import { E2ESDKClientProvider } from '@socialgouv/e2esdk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ColorModeSwitch } from 'components/colorModeSwitch'
import { PageLayout } from 'components/pageLayout'
import type { AppProps } from 'next/app'
import dynamic from 'next/dynamic'
import Head from 'next/head'

const e2esdkClient = new Client({
  serverURL: 'http://localhost:4003',
  serverPublicKey: 'gsE7B63ETtNDIzAwXEp3X1Hv12WCKGH6h7brV3U9NKE',
})
const reactQueryClient = new QueryClient()

const Devtools = dynamic(
  () => import('../components/devtools').then(m => m.Devtools),
  {
    ssr: false,
  }
)

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={reactQueryClient}>
      <E2ESDKClientProvider client={e2esdkClient}>
        <ChakraProvider>
          <PageLayout>
            <Head>
              <title>e2esdk | Contact Forms</title>
              <meta name="description" content="Fullstack demo of e2esdk" />
              <link
                rel="icon"
                href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%2210 0 100 100%22><text y=%22.90em%22 font-size=%2290%22>🔐</text></svg>"
              />
            </Head>
            <Component {...pageProps} />
          </PageLayout>
          <HStack position="fixed" zIndex="overlay" bottom={3} left={16}>
            <ReactQueryDevtools
              initialIsOpen={false}
              position="bottom-left"
              toggleButtonProps={{
                style: {
                  zIndex: 'var(--chakra-zIndices-overlay)' as any,
                },
              }}
            />
            <ColorModeSwitch />
          </HStack>
          <Devtools />
        </ChakraProvider>
      </E2ESDKClientProvider>
    </QueryClientProvider>
  )
}

export default MyApp
