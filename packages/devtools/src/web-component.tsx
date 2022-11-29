import {
  ChakraProvider,
  DarkMode,
  extendTheme,
  LightMode,
  ThemeConfig,
} from '@chakra-ui/react'
import type { ClientConfig } from '@e2esdk/client'
import { Client } from '@e2esdk/client'
import { E2ESDKClientProvider } from '@e2esdk/react'
import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { PortalProvider } from './components/PortalProvider'
import { E2ESdkDevtoolsView } from './view'

export class E2ESDKDevtoolsElement extends HTMLElement {
  constructor() {
    super()
  }

  connectedCallback() {
    const serverURL = this.getAttribute('serverURL')
    const serverPublicKey = this.getAttribute('serverPublicKey')
    if (!serverURL || !serverPublicKey) {
      return
    }
    const colorMode = (this.getAttribute('theme') ?? 'dark') as 'light' | 'dark'
    console.debug(`[🔐 devtools] Creating client for Web Component with
├ serverURL:       ${serverURL}
└ serverPublicKey: ${serverPublicKey}`)
    const client = new Client({
      serverURL,
      serverPublicKey,
    })
    const config: ThemeConfig = {
      useSystemColorMode: false,
      cssVarPrefix: `--e2esdk-devtools`,
      initialColorMode: colorMode,
    }
    const theme = extendTheme({
      config,
      styles: {
        global: () => ({
          '#e2esdk-devtools': {
            fontFamily: 'body',
            lineHeight: 'base',
            color: colorMode === 'light' ? 'gray.800' : 'whiteAlpha.900',
            bg: colorMode === 'light' ? 'white' : 'gray.900',
          },
          '*::placeholder': {
            color: colorMode === 'light' ? 'gray.400' : 'whiteAlpha.400',
          },
          '*, *::before, &::after': {
            borderColor: colorMode === 'light' ? 'gray.200' : 'whiteAlpha.300',
            wordWrap: 'break-word',
          },
        }),
      },
      colors: {
        gray: {
          10: '#fafdfe',
          1000: '#121721',
        },
      },
    })
    const shadowMountPoint = document.createElement('aside')
    shadowMountPoint.id = `e2esdk-devtools`
    shadowMountPoint.setAttribute('data-theme', colorMode)
    shadowMountPoint.setAttribute('style', `color-scheme: ${colorMode};`)
    this.attachShadow({ mode: 'open' }).appendChild(shadowMountPoint)
    const root = createRoot(shadowMountPoint)
    const cache = createCache({
      key: 'devtools',
      container: shadowMountPoint,
      insertionPoint: shadowMountPoint,
    })
    const ForceColorMode = colorMode === 'light' ? LightMode : DarkMode

    const queryClient = new QueryClient()

    root.render(
      <CacheProvider value={cache}>
        <ChakraProvider theme={theme} cssVarsRoot={`#e2esdk-devtools`}>
          <QueryClientProvider client={queryClient}>
            <E2ESDKClientProvider client={client}>
              <ForceColorMode>
                <PortalProvider>
                  <E2ESdkDevtoolsView />
                </PortalProvider>
              </ForceColorMode>
              {colorMode === 'dark' && <ReactQueryDevtools />}
            </E2ESDKClientProvider>
          </QueryClientProvider>
        </ChakraProvider>
      </CacheProvider>
    )
  }
}

customElements.define('e2esdk-devtools', E2ESDKDevtoolsElement)

// --

type E2ESDKDevtoolsElementAttributes = React.HTMLAttributes<HTMLElement> &
  ClientConfig & {
    theme?: 'dark' | 'light'
  }

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'e2esdk-devtools': React.DetailedHTMLProps<
        E2ESDKDevtoolsElementAttributes,
        E2ESDKDevtoolsElement
      >
    }
  }
}
